from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json

from db.database import get_db
from db.models import UserFinancialProfile, ClauseRiskFlag, Document
from models.schemas import ChatRequest
from services.dual_retrieval import retrieve_agreement_and_rbi_context, build_dual_context_prompt
from services.llm import stream_response
from services.risk_classifier import classify_clause_risk
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
        # Send source info first (for citation chips on frontend)
        sources = {
            "agreement_sources": [
                {
                    "filename": c["metadata"].get("filename"),
                    "text": c["text"][:200],
                    "score": c.get("rerank_score", c["score"]),
                }
                for c in retrieval["agreement_chunks"]
            ],
            "rbi_sources": [
                {
                    "filename": c["metadata"].get("filename"),
                    "status": c["metadata"].get("document_status", "ACTIVE"),
                    "text": c["text"][:200],
                    "score": c.get("rerank_score", c["score"]),
                }
                for c in retrieval["rbi_chunks"]
            ],
        }
        yield f"data: {json.dumps({'type': 'sources', **sources})}\n\n"

        # Stream the LLM answer
        for chunk in stream_response(prompt):
            yield f"data: {json.dumps(chunk)}\n\n"

        # Background: classify risk on the single best-matched clause pair
        # (kept simple/synchronous for this project scope — could be moved
        # to a background task queue in a larger deployment)
        if retrieval["agreement_chunks"] and retrieval["rbi_chunks"]:
            top_clause = retrieval["agreement_chunks"][0]
            top_rbi = retrieval["rbi_chunks"][0]

            risk_result = classify_clause_risk(
                clause_text=top_clause["text"],
                rbi_guideline_text=top_rbi["text"],
                rbi_document_status=top_rbi["metadata"].get("document_status", "ACTIVE"),
            )

            flag = ClauseRiskFlag(
                id=generate_id(),
                session_id=request.session_id,
                document_id=top_clause["metadata"].get("doc_id", ""),
                clause_text=top_clause["text"][:1000],
                rbi_rule_matched=top_rbi["text"][:1000],
                rbi_source_document=top_rbi["metadata"].get("filename"),
                rbi_document_status=top_rbi["metadata"].get("document_status", "ACTIVE"),
                deviation_description=risk_result["deviation_description"],
                risk_level=risk_result["risk_level"],
                reason=risk_result["reason"],
            )
            db.add(flag)
            db.commit()

            yield f"data: {json.dumps({'type': 'risk_flag', 'risk_level': risk_result['risk_level'], 'deviation_description': risk_result['deviation_description']})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
