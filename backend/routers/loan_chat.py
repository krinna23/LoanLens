from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json

from db.database import get_db
from db.models import UserFinancialProfile, ClauseRiskFlag, Document
from models.schemas import ChatRequest
from services.dual_retrieval import retrieve_agreement_and_rbi_context, build_dual_context_prompt
from services.llm import stream_response
from services.risk_classifier import classify_clause_risk, are_similar_risks, extract_focused_evidence
from utils.helpers import generate_id

router = APIRouter()


def _get_financial_profile(session_id: str, db: Session) -> dict:
    profile = db.query(UserFinancialProfile).filter(
        UserFinancialProfile.session_id == session_id
    ).first()
    if not profile:
        return None
    return {
        "monthly_income": profile.monthly_income,
        "loan_amount_needed": profile.loan_amount_needed,
        "preferred_tenure_months": profile.preferred_tenure_months,
    }


@router.post("/loan_chat")
async def loan_chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Main chat endpoint. Performs dual retrieval (user's agreement + RBI
    knowledge base), builds a combined prompt, streams the answer via SSE,
    and — as a background step — classifies risk on the top matched clause
    and stores it for the Risk Summary panel.
    """
    agreement_label = request.agreement_label if request.agreement_label in ("A", "B") else "A"

    retrieval = retrieve_agreement_and_rbi_context(
        session_id=request.session_id,
        agreement_label=agreement_label,
        query=request.message,
        top_k=5,
    )

    financial_profile = _get_financial_profile(request.session_id, db)

    prompt = build_dual_context_prompt(
        query=request.message,
        agreement_chunks=retrieval["agreement_chunks"],
        rbi_chunks=retrieval["rbi_chunks"],
        financial_profile=financial_profile,
    )

    def event_stream():
        try:
            def _clean_source_snippet(text: str, max_chars: int = 800) -> str:
                if not text:
                    return ""
                s = text.strip()
                if len(s) <= max_chars:
                    return s
                cut = s[:max_chars]
                last_space = cut.rfind(" ")
                if last_space > max_chars // 2:
                    return cut[:last_space].strip() + "..."
                return cut.strip() + "..."

            # Send source info first (for citation chips on frontend)
            sources = {
                "agreement_sources": [
                    {
                        "filename": c["metadata"].get("filename"),
                        "text": _clean_source_snippet(c["text"]),
                        "score": c.get("rerank_score", c["score"]),
                    }
                    for c in retrieval["agreement_chunks"]
                ],
                "rbi_sources": [
                    {
                        "filename": c["metadata"].get("filename"),
                        "status": c["metadata"].get("document_status", "ACTIVE"),
                        "text": _clean_source_snippet(c["text"]),
                        "score": c.get("rerank_score", c["score"]),
                    }
                    for c in retrieval["rbi_chunks"]
                ],
            }
            yield f"data: {json.dumps({'type': 'sources', **sources})}\n\n"

            # Stream the LLM answer
            for chunk in stream_response(prompt):
                yield f"data: {json.dumps(chunk)}\n\n"

            # Background: classify risk on the top retrieved clause-RBI pairs (up to 3)
            if retrieval["agreement_chunks"] and retrieval["rbi_chunks"]:
                try:
                    from db.database import SessionLocal as _SessionLocal
                    db_bg = _SessionLocal()
                    try:
                        # Existing descriptions for this session to avoid re-inserting duplicates
                        existing_bg = list(
                            row[0] for row in db_bg.query(ClauseRiskFlag.deviation_description)
                            .filter(ClauseRiskFlag.session_id == request.session_id).all()
                            if row[0] and row[0] not in ("No deviation found", "Could not automatically assess this clause.")
                        )

                        for top_clause in retrieval["agreement_chunks"][:2]:
                            # Per-clause RBI matching: find the best-matching RBI guideline for THIS specific clause
                            clause_rbi_chunks = retrieval["rbi_chunks"]
                            if len(retrieval["rbi_chunks"]) > 1:
                                # Pick the RBI chunk whose text has the most word overlap with this clause
                                import re as _re
                                clause_words = set(_re.findall(r'\b\w{4,}\b', top_clause["text"].lower()))
                                best_rbi_match = max(
                                    retrieval["rbi_chunks"],
                                    key=lambda r: sum(1 for w in clause_words if w in r["text"].lower())
                                )
                                clause_rbi_chunks = [best_rbi_match] + [c for c in retrieval["rbi_chunks"] if c is not best_rbi_match]

                            active_rbi_chunks = [c for c in clause_rbi_chunks
                                                 if c["metadata"].get("document_status") == "ACTIVE"]
                            top_rbi = active_rbi_chunks[0] if active_rbi_chunks else clause_rbi_chunks[0]
                            rbi_status = top_rbi["metadata"].get("document_status", "ACTIVE")

                            risk_result = classify_clause_risk(
                                clause_text=top_clause["text"],
                                rbi_guideline_text=top_rbi["text"],
                                rbi_document_status=rbi_status,
                            )

                            dev_desc = risk_result.get("deviation_description", "")
                            if (not dev_desc
                                or dev_desc == "No deviation found"
                                or dev_desc == "Could not automatically assess this clause."
                                or len(dev_desc) < 10):
                                continue

                            # Semantic deduplication against existing flags in this session
                            if any(are_similar_risks(dev_desc, existing) for existing in existing_bg):
                                continue

                            evidence_quote = risk_result.get("evidence_quote") or ""
                            focused_evidence = extract_focused_evidence(top_clause["text"], evidence_quote)
                            doc_id_val = top_clause["metadata"].get("doc_id", "")
                            if not doc_id_val:
                                active_doc = db_bg.query(Document).filter(
                                    Document.session_id == request.session_id,
                                    Document.agreement_label == request.agreement_label
                                ).order_by(Document.uploaded_at.desc()).first()
                                doc_id_val = active_doc.id if active_doc else ""

                            flag_id = generate_id()
                            flag = ClauseRiskFlag(
                                id=flag_id,
                                session_id=request.session_id,
                                document_id=doc_id_val,
                                clause_text=focused_evidence[:600],
                                rbi_rule_matched=top_rbi["text"][:1000],
                                rbi_source_document=top_rbi["metadata"].get("filename"),
                                rbi_document_status=rbi_status,
                                deviation_description=dev_desc,
                                risk_level=risk_result["risk_level"],
                                reason=risk_result["reason"],
                            )
                            db_bg.add(flag)
                            db_bg.commit()
                            existing_bg.append(dev_desc)

                            print(f"[RISK]\ndocument_id={doc_id_val}\nclause_id={top_clause['metadata'].get('chunk_id', flag_id[:8])}\nrisk={risk_result['risk_level']}\ndescription={dev_desc}\nevidence={focused_evidence[:100]}...\nrbi_source={top_rbi.get('metadata', {}).get('filename')}\nstatus={rbi_status}\n")

                            yield f"data: {json.dumps({'type': 'risk_flag', 'risk_level': risk_result['risk_level'], 'deviation_description': dev_desc})}\n\n"
                    finally:
                        db_bg.close()
                except Exception as risk_err:
                    print(f"Risk classification background error: {risk_err}")

            yield "data: [DONE]\n\n"
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_text = f"\n\n**AI Service Error:** {str(e)}"
            yield f"data: {json.dumps({'type': 'text', 'text': error_text})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
