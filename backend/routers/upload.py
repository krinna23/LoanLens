from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import os

from db.database import get_db
from db.models import Document, ClauseRiskFlag
from models.schemas import UploadResponse, DocumentOut
from services.parser import parse_file
from services.chunker import chunk_text
from services.embedder import embed_chunks
from services.vector_store import add_chunks, get_agreement_collection_name
from utils.helpers import generate_id, is_allowed_file, get_file_extension, build_storage_path

router = APIRouter()

STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")


@router.post("/upload", response_model=UploadResponse)
async def upload_agreement(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    agreement_label: str = Form("A"),  # "A" or "B" for comparison mode
    db: Session = Depends(get_db),
):
    if not is_allowed_file(file.content_type, file.filename):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    if agreement_label not in ("A", "B"):
        raise HTTPException(status_code=400, detail="agreement_label must be 'A' or 'B'")

    # Clean stale risk flags from any previous upload in this session
    if agreement_label == "A":
        try:
            db.query(ClauseRiskFlag).filter(ClauseRiskFlag.session_id == session_id).delete()
            db.commit()
        except Exception as del_err:
            db.rollback()
            print(f"Error clearing stale risk flags: {del_err}")

    file_type = get_file_extension(file.content_type, file.filename)
    doc_id = generate_id()

    save_path = build_storage_path(STORAGE_PATH, doc_id, file_type)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    file_size = len(content)

    db_doc = Document(
        id=doc_id,
        filename=file.filename,
        file_type=file_type,
        session_id=session_id,
        agreement_label=agreement_label,
        file_size=file_size,
        status="processing",
    )
    db.add(db_doc)
    db.commit()

    try:
        text = parse_file(save_path, file_type)
        chunks = chunk_text(text, doc_id, file.filename)
        chunks_with_embeddings = embed_chunks(chunks)

        collection_name = get_agreement_collection_name(session_id, agreement_label)
        add_chunks(collection_name, chunks_with_embeddings)

        db_doc.chunk_count = len(chunks)
        db_doc.status = "ready"
        db.commit()
    except Exception as e:
        db_doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    db.refresh(db_doc)
    return UploadResponse(
        document=DocumentOut.model_validate(db_doc),
        message=f"Processed {len(chunks)} chunks from Agreement {agreement_label}.",
    )


@router.get("/documents/{session_id}")
def list_documents(session_id: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.session_id == session_id).order_by(Document.uploaded_at.desc()).all()
    return [DocumentOut.model_validate(d) for d in docs]


@router.post("/summarize/{session_id}")
async def summarize_agreement(
    session_id: str,
    background_tasks: BackgroundTasks,
    agreement_label: str = "A",
    db: Session = Depends(get_db),
):
    """
    Called automatically by the frontend right after upload.
    Pulls chunks from the uploaded agreement, asks the LLM to generate
    a plain-language summary + key terms, and runs a background risk scan
    over the first few clauses so the Risk Summary panel is populated
    without the user needing to chat first.
    """
    from services.vector_store import get_collection, get_agreement_collection_name, RBI_KNOWLEDGE_COLLECTION
    from services.llm import client as groq_client, MODEL, SYSTEM_PROMPT
    from services.risk_classifier import classify_clause_risk, are_similar_risks, extract_focused_evidence
    from services.embedder import embed_query
    from services.vector_store import query_collection
    from db.models import ClauseRiskFlag, Document
    from utils.helpers import generate_id

    # Resolve the active document for this session and label
    doc = db.query(Document).filter(
        Document.session_id == session_id,
        Document.agreement_label == agreement_label
    ).order_by(Document.uploaded_at.desc()).first()
    doc_id = doc.id if doc else generate_id()

    collection_name = get_agreement_collection_name(session_id, agreement_label)
    collection = get_collection(collection_name)

    if collection.count() == 0:
        raise HTTPException(status_code=404, detail="No document chunks found. Upload the agreement first.")

    # Pull a broad sample — first 20 chunks give enough context for a summary
    sample = collection.peek(limit=20)
    doc_text = "\n\n".join(sample["documents"])

    # ── 1. Generate plain-language summary ──────────────────────────────────
    summary_prompt = f"""You are given excerpts from a loan agreement. Generate a structured summary for the borrower.

OUTPUT RULES — YOU MUST FOLLOW EXACTLY:
- Use the exact section headings below (###)
- Use bullet points for all lists
- Use **bold** for all values (amounts, rates, dates, fees)
- Use a Markdown table for Fees & Charges
- If a value is not found in the text, write exactly: **Not specified in the agreement.**
- Never invent or estimate any number
- Keep each bullet concise (one idea per bullet)

Required output format:

### Loan Overview
- **Loan Amount:** (value or Not specified in the agreement.)
- **Interest Rate:** (value or Not specified in the agreement.)
- **Tenure:** (value or Not specified in the agreement.)
- **EMI:** (value or Not specified in the agreement.)
- **Loan Type:** (e.g. Personal Loan, Home Loan, or Not specified in the agreement.)
- **Disbursement Mode:** (value or Not specified in the agreement.)

### Key Terms
- (3–5 most important terms/conditions from the agreement, one per bullet)

### Fees & Charges
| Charge | Amount | When It Applies |
|---|---:|---|
| Processing Fee | (value or Not specified) | (condition) |
| Prepayment Penalty | (value or Not specified) | (condition) |
| Late Payment Fee | (value or Not specified) | (condition) |
| Other charges found | (value) | (condition) |

### Prepayment & Penalties
- **Prepayment Allowed:** (Yes/No/Partial, or Not specified in the agreement.)
- **Prepayment Penalty:** (value or Not specified in the agreement.)
- **Lock-in Period:** (value or Not specified in the agreement.)
- **Conditions:** (any conditions mentioned)

### Risks & Red Flags
(List 3–6 notable risks or clauses the borrower should be aware of. Cover HIGH, MEDIUM and LOW severity risks. If none, write: No significant risks identified in the reviewed excerpts.)
1. **High Risk —** (brief description of a serious issue)
2. **Medium Risk —** (brief description of a moderate concern)
3. **Low Risk —** (brief description of a minor concern)

### Important Things to Check
- (3–5 specific things the borrower should verify before signing)

AGREEMENT EXCERPTS:
{doc_text[:6000]}"""

    try:
        summary_resp = groq_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": summary_prompt},
            ],
            temperature=0.2,
            max_tokens=2500,
        )
        summary_text = summary_resp.choices[0].message.content.strip()
        if not summary_text:
            summary_text = "Summary could not be generated from this document. The document may be too short or contain insufficient text. Please use the 'Ask LoanLens' tab to query your agreement directly."
    except Exception as e:
        summary_text = f"Summary generation failed: {str(e)}. Please use the 'Ask LoanLens' tab to query your agreement directly."

    # ── 2. Auto risk-scan: Parse risks from summary text synchronously ────────
    # The summary LLM has already identified key risks — parse them now (fast, no extra LLM call).
    # The slow targeted clause scan (up to 24 LLM calls) runs in background via BackgroundTasks.
    risk_flags_added = 0
    try:
        import re
        rbi_col = get_collection(RBI_KNOWLEDGE_COLLECTION)
        existing_descriptions = list(
            row[0] for row in db.query(ClauseRiskFlag.deviation_description).filter(ClauseRiskFlag.session_id == session_id).all()
            if row[0] and row[0] not in ("No deviation found", "Could not automatically assess this clause.")
        )

        # 2a. Convert risks already identified in summary into ClauseRiskFlags (no extra LLM call)
        if "### Risks & Red Flags" in summary_text:
            rf_section = summary_text.split("### Risks & Red Flags")[1]
            if "###" in rf_section:
                rf_section = rf_section.split("###")[0]

            for raw_line in rf_section.split("\n"):
                raw_line = raw_line.strip()
                if not raw_line or raw_line.startswith("(") or raw_line.startswith("#"):
                    continue
                s = re.sub(r'^(?:\d+[\.)]|\-|\*)+\s*', '', raw_line).strip()
                s = re.sub(r'^(?:\-|\*)+\s*', '', s).strip()

                level = None
                desc = None

                m = re.match(r'^(?:\[?\*{0,2}(HIGH|MEDIUM|LOW)(?:\s+RISK)?\]?\*{0,2})\s*[\u2014\u2013\-:]+\s*(.+)$', s, re.IGNORECASE)
                if m:
                    level = m.group(1).upper()
                    desc = re.sub(r'^\*+|\*+$', '', m.group(2)).strip()
                    desc = re.sub(r'^[\u2014\u2013\-:\s]+', '', desc).strip()
                else:
                    parts = re.split(r'[\u2014\u2013\-:]+', s, maxsplit=1)
                    if len(parts) == 2:
                        prefix, rest = parts[0].strip(), parts[1].strip()
                        rest = re.sub(r'^\*+|\*+$', '', rest).strip()
                        if re.search(r'\bHIGH\b', prefix, re.IGNORECASE):
                            level = 'HIGH'; desc = rest
                        elif re.search(r'\bMEDIUM\b', prefix, re.IGNORECASE):
                            level = 'MEDIUM'; desc = rest
                        elif re.search(r'\bLOW\b', prefix, re.IGNORECASE):
                            level = 'LOW'; desc = rest

                if not level or not desc:
                    continue
                desc = re.sub(r'\*+', '', desc).strip()
                if (not desc or desc.lower().startswith("no significant risk")
                        or desc.lower().startswith("brief description") or len(desc) < 8):
                    continue

                # Semantic deduplication against already parsed risks
                if any(are_similar_risks(desc, existing) for existing in existing_descriptions):
                    continue

                # --- STRICT GROUNDING: find the SPECIFIC clause that matches this risk ---
                # Extract meaningful content words from the description (exclude generic loan/risk words)
                STOP_WORDS = {'risk', 'clause', 'violates', 'violating', 'guideline', 'requirement',
                              'agreement', 'provides', 'loan', 'bank', 'borrower', 'lender', 'this',
                              'that', 'with', 'from', 'does', 'have', 'will', 'shall', 'been', 'being'}
                desc_words = [w.lower() for w in re.findall(r'\b\w{4,}\b', desc)
                              if w.lower() not in STOP_WORDS]

                matched_clause = ""
                best_overlap = 0

                for chunk in sample["documents"]:
                    chunk_lower = chunk.lower()
                    # Count unique matching words (not total occurrences)
                    unique_matches = sum(1 for w in set(desc_words) if w in chunk_lower)
                    if unique_matches > best_overlap:
                        best_overlap = unique_matches
                        matched_clause = chunk

                # Require at least 3 distinct matching words to prevent spurious matches
                if best_overlap < 3:
                    matched_clause = ""

                # If still no match, use semantic embedding search to find the correct chunk
                if not matched_clause:
                    try:
                        q_emb = embed_query(desc[:200])
                        found = query_collection(collection_name, q_emb, n_results=3)
                        for found_chunk in found:
                            c_text = found_chunk.get("text", "")
                            c_lower = c_text.lower()
                            # Require at least 2 desc_words present in the found chunk
                            word_matches = sum(1 for w in set(desc_words) if w in c_lower)
                            if word_matches >= 2:
                                matched_clause = c_text
                                break
                    except Exception:
                        pass

                # If no grounded evidence found, do not create an ungrounded risk
                if not matched_clause:
                    print(f"[SummaryRisk] Skipping risk (no grounded clause found): {desc[:60]}")
                    continue

                # Focus evidence snippet on the relevant sentence — use desc as the "quote"
                evidence_text = extract_focused_evidence(matched_clause, desc)

                # Final verification: make sure the evidence comes from the matched clause
                if evidence_text and matched_clause:
                    ev_words = set(re.findall(r'\b\w{4,}\b', evidence_text.lower()))
                    cl_words = set(re.findall(r'\b\w{4,}\b', matched_clause.lower()))
                    if len(ev_words.intersection(cl_words)) < 2:
                        # Evidence not actually from matched clause — use first sentence of clause
                        first_sentence = matched_clause.strip().split('.')[0][:300]
                        evidence_text = first_sentence

                rbi_doc_name = "RBI Regulatory Framework"
                rbi_rule_text = "RBI Fair Practices Code & Regulatory Directives"
                rbi_status = "ACTIVE"
                if rbi_col.count() > 0:
                    try:
                        emb = embed_query(desc[:200])
                        rbi_matches = query_collection(RBI_KNOWLEDGE_COLLECTION, emb, n_results=3)
                        # Prefer ACTIVE guideline; fall back to best matching regardless of status
                        active_rbi = [r for r in rbi_matches if r.get("metadata", {}).get("document_status") == "ACTIVE"]
                        top_rbi_match = active_rbi[0] if active_rbi else (rbi_matches[0] if rbi_matches else None)
                        if top_rbi_match:
                            rbi_doc_name = (top_rbi_match.get("metadata", {}).get("filename")
                                            or top_rbi_match.get("metadata", {}).get("title") or rbi_doc_name)
                            rbi_rule_text = top_rbi_match.get("text", "")[:1000]
                            rbi_status = top_rbi_match.get("metadata", {}).get("document_status", "ACTIVE")
                    except Exception as rbi_err:
                        print(f"Error querying RBI for summary risk: {rbi_err}")

                try:
                    flag_id = generate_id()
                    flag = ClauseRiskFlag(
                        id=flag_id,
                        session_id=session_id,
                        document_id=doc_id,
                        clause_text=evidence_text[:600],
                        rbi_rule_matched=rbi_rule_text[:1000],
                        rbi_source_document=rbi_doc_name,
                        rbi_document_status=rbi_status,
                        deviation_description=desc,
                        risk_level=level,
                        reason=f"{level.capitalize()} risk identified during agreement analysis: {desc}",
                    )
                    db.add(flag)
                    db.commit()
                    existing_descriptions.append(desc)
                    risk_flags_added += 1

                    print(f"[RISK]\ndocument_id={doc_id}\nclause_id=summary_{flag_id[:8]}\nrisk={level}\ndescription={desc}\nevidence={evidence_text[:100]}...\nrbi_source={rbi_doc_name}\nstatus={rbi_status}\n")
                except Exception as add_err:
                    db.rollback()
                    print(f"Failed to add summary risk flag: {add_err}")

    except Exception as risk_scan_err:
        print(f"Summary risk parse exception: {risk_scan_err}")


    # 2b. Targeted RBI compliance scan runs in background — does NOT block this response
    background_tasks.add_task(
        _run_targeted_risk_scan,
        session_id=session_id,
        agreement_label=agreement_label,
        doc_id=doc_id,
    )

    return {
        "summary": summary_text,
        "risk_flags_added": risk_flags_added,
        "chunks_sampled": len(sample["documents"]),
    }


def _run_targeted_risk_scan(session_id: str, agreement_label: str, doc_id: str):
    """
    Background task: runs targeted RBI compliance scans against agreement clauses.
    Validates grounding, extracts focused evidence, applies semantic deduplication,
    and logs every created risk.
    """
    from db.database import SessionLocal
    from services.vector_store import get_collection, get_agreement_collection_name, RBI_KNOWLEDGE_COLLECTION, query_collection
    from services.embedder import embed_query
    from services.risk_classifier import classify_clause_risk, are_similar_risks, extract_focused_evidence
    from db.models import ClauseRiskFlag
    from utils.helpers import generate_id

    db = SessionLocal()
    try:
        rbi_col = get_collection(RBI_KNOWLEDGE_COLLECTION)
        if rbi_col.count() == 0:
            print("[BgRiskScan] RBI collection empty, skipping targeted scan.")
            return

        existing_descriptions = list(
            row[0] for row in db.query(ClauseRiskFlag.deviation_description).filter(ClauseRiskFlag.session_id == session_id).all()
            if row[0] and row[0] not in ("No deviation found", "Could not automatically assess this clause.")
        )

        target_queries = [
            "penal charges penalty default interest overdue",
            "prepayment charges foreclosure floating rate individual borrower",
            "rate reset unilateral change benchmark spread MCLR",
            "recovery agents harassment default procedure coercive",
            "insurance premium credit life policy mandatory",
            "arbitration clause dispute resolution lender unilateral",
            "NACH auto-debit ECS payment instruction revocation",
            "cross default acceleration clause entire loan due",
        ]

        scanned_pairs: set = set()
        flags_added = 0

        for tq in target_queries:
            try:
                q_emb = embed_query(tq)
                agreement_col_name = get_agreement_collection_name(session_id, agreement_label)
                cand_matches = query_collection(agreement_col_name, q_emb, n_results=3)
                if not cand_matches:
                    continue

                for cand in cand_matches:
                    clause_text = cand["text"]
                    clause_key = clause_text[:80]
                    if clause_key in scanned_pairs:
                        continue
                    scanned_pairs.add(clause_key)

                    # Per-clause RBI matching: embed THIS clause and find its best RBI guideline
                    try:
                        cand_emb = embed_query(clause_text[:200])
                        rbi_matches = query_collection(RBI_KNOWLEDGE_COLLECTION, cand_emb, n_results=4)
                    except Exception:
                        # Fall back to query embedding if clause embedding fails
                        rbi_matches = query_collection(RBI_KNOWLEDGE_COLLECTION, q_emb, n_results=4)

                    if not rbi_matches:
                        continue

                    # Prefer ACTIVE guideline for hard violations; still include WITHDRAWN with proper status
                    active_matches = [m for m in rbi_matches if m.get("metadata", {}).get("document_status") == "ACTIVE"]
                    top_rbi = active_matches[0] if active_matches else rbi_matches[0]
                    rbi_status = top_rbi.get("metadata", {}).get("document_status", "ACTIVE")

                    risk_result = classify_clause_risk(
                        clause_text=clause_text,
                        rbi_guideline_text=top_rbi["text"],
                        rbi_document_status=rbi_status,
                    )

                    dev_desc = risk_result.get("deviation_description") or "Clause compliance assessed"
                    if (dev_desc == "No deviation found"
                            or dev_desc == "Could not automatically assess this clause."
                            or len(dev_desc) < 10):
                        continue

                    # Semantic deduplication
                    if any(are_similar_risks(dev_desc, existing) for existing in existing_descriptions):
                        print(f"[BgRiskScan] Skipping duplicate risk: {dev_desc[:60]}")
                        continue

                    # Extract focused evidence quote
                    evidence_quote = risk_result.get("evidence_quote") or ""
                    focused_evidence = extract_focused_evidence(clause_text, evidence_quote)

                    try:
                        flag_id = generate_id()
                        flag = ClauseRiskFlag(
                            id=flag_id,
                            session_id=session_id,
                            document_id=doc_id,
                            clause_text=focused_evidence[:600],
                            rbi_rule_matched=top_rbi["text"][:1000],
                            rbi_source_document=top_rbi["metadata"].get("filename"),
                            rbi_document_status=rbi_status,
                            deviation_description=dev_desc,
                            risk_level=risk_result["risk_level"],
                            reason=risk_result["reason"],
                        )
                        db.add(flag)
                        db.commit()
                        existing_descriptions.append(dev_desc)
                        flags_added += 1

                        print(f"[RISK]\ndocument_id={doc_id}\nclause_id={cand.get('id', flag_id[:8])}\nrisk={risk_result['risk_level']}\ndescription={dev_desc}\nevidence={focused_evidence[:100]}...\nrbi_source={top_rbi.get('metadata', {}).get('filename')}\nstatus={rbi_status}\n")
                    except Exception as add_err:
                        db.rollback()
                        print(f"[BgRiskScan] Error adding flag: {add_err}")

            except Exception as clause_err:
                print(f"[BgRiskScan] Error on query '{tq}': {clause_err}")

        print(f"[BgRiskScan] Completed. Added {flags_added} additional risk flags for session {session_id}.")
    except Exception as e:
        print(f"[BgRiskScan] Fatal error: {e}")
    finally:
        db.close()

