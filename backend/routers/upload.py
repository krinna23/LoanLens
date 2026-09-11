from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
import os

from db.database import get_db
from db.models import Document
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
    from services.risk_classifier import classify_clause_risk
    from services.embedder import embed_query
    from services.vector_store import query_collection
    from db.models import ClauseRiskFlag
    from utils.helpers import generate_id

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
(List 2–4 notable risks or clauses the borrower should be aware of. If none, write: No significant risks identified in the reviewed excerpts.)
1. **[Risk Level] Risk —** (brief description)
2. **[Risk Level] Risk —** (brief description)

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

    # ── 2. Auto risk-scan top clauses vs RBI knowledge base ─────────────────
    risk_flags_added = 0
    try:
        rbi_col = get_collection(RBI_KNOWLEDGE_COLLECTION)
        if rbi_col.count() > 0:
            # For each of the first 10 chunks, embed + find the best RBI match
            clauses_to_scan = sample["documents"][:10]
            metadatas = sample["metadatas"][:10]
            for i, clause_text in enumerate(clauses_to_scan):
                clause_embedding = embed_query(clause_text)
                rbi_matches = query_collection(RBI_KNOWLEDGE_COLLECTION, clause_embedding, n_results=5)
                if not rbi_matches:
                    continue
                # Prefer ACTIVE documents over withdrawn/informational
                active_matches = [m for m in rbi_matches if m.get("metadata", {}).get("document_status") == "ACTIVE"]
                top_rbi = active_matches[0] if active_matches else rbi_matches[0]
                risk_result = classify_clause_risk(
                    clause_text=clause_text,
                    rbi_guideline_text=top_rbi["text"],
                    rbi_document_status=top_rbi["metadata"].get("document_status", "ACTIVE"),
                )
                # Only store MEDIUM/HIGH to keep the panel signal-rich
                if risk_result["risk_level"] in ("MEDIUM", "HIGH"):
                    flag = ClauseRiskFlag(
                        id=generate_id(),
                        session_id=session_id,
                        document_id=metadatas[i].get("doc_id", ""),
                        clause_text=clause_text[:1000],
                        rbi_rule_matched=top_rbi["text"][:1000],
                        rbi_source_document=top_rbi["metadata"].get("filename"),
                        rbi_document_status=top_rbi["metadata"].get("document_status", "ACTIVE"),
                        deviation_description=risk_result["deviation_description"],
                        risk_level=risk_result["risk_level"],
                        reason=risk_result["reason"],
                    )
                    db.add(flag)
                    risk_flags_added += 1
            db.commit()
    except Exception:
        pass  # Risk scan failure is non-fatal — summary still returned

    return {
        "summary": summary_text,
        "risk_flags_added": risk_flags_added,
        "chunks_sampled": len(sample["documents"]),
    }

