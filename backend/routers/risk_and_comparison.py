from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from db.database import get_db
from db.models import ClauseRiskFlag, LoanComparison
from models.schemas import RiskFlagOut, ComparisonFieldOut
from services.vector_store import get_agreement_collection_name, get_collection
from services.comparison_engine import extract_loan_fields, build_comparison_rows, generate_comparison_recommendation
from utils.helpers import generate_id

router = APIRouter()


@router.get("/risk_summary/{session_id}", response_model=List[RiskFlagOut])
def get_risk_summary(session_id: str, db: Session = Depends(get_db)):
    flags = db.query(ClauseRiskFlag).filter(
        ClauseRiskFlag.session_id == session_id
    ).order_by(ClauseRiskFlag.created_at.desc()).all()
    return [RiskFlagOut.model_validate(f) for f in flags]


@router.post("/comparison/{session_id}/generate")
def generate_comparison(session_id: str, db: Session = Depends(get_db)):
    """
    Reads both Agreement A and Agreement B collections, extracts structured
    loan terms from each via the LLM, stores the comparison rows in MySQL,
    and returns a plain-language recommendation.
    """
    collection_a = get_collection(get_agreement_collection_name(session_id, "A"))
    collection_b = get_collection(get_agreement_collection_name(session_id, "B"))

    if collection_a.count() == 0:
        raise HTTPException(status_code=400, detail="Agreement A has not been uploaded yet.")
    if collection_b.count() == 0:
        raise HTTPException(status_code=400, detail="Agreement B has not been uploaded yet for comparison.")

    # Pull a broad sample of text from each agreement (first N chunks by insertion order)
    sample_a = collection_a.peek(limit=15)
    sample_b = collection_b.peek(limit=15)

    docs_a = sample_a.get("documents") or []
    docs_b = sample_b.get("documents") or []

    text_a = "\n\n".join(docs_a)
    text_b = "\n\n".join(docs_b)

    fields_a = extract_loan_fields(text_a)
    fields_b = extract_loan_fields(text_b)

    comparison_rows = build_comparison_rows(fields_a, fields_b)

    # Clear old comparison rows for this session, then store fresh ones
    db.query(LoanComparison).filter(LoanComparison.session_id == session_id).delete()
    for row in comparison_rows:
        val_a = str(row["agreement_a_value"])[:255] if row.get("agreement_a_value") is not None else None
        val_b = str(row["agreement_b_value"])[:255] if row.get("agreement_b_value") is not None else None
        db.add(LoanComparison(
            id=generate_id(),
            session_id=session_id,
            field_name=row["field_name"],
            agreement_a_value=val_a,
            agreement_b_value=val_b,
        ))
    db.commit()

    recommendation = generate_comparison_recommendation(comparison_rows)

    return {
        "comparison": comparison_rows,
        "recommendation": recommendation,
    }


@router.get("/comparison/{session_id}", response_model=List[ComparisonFieldOut])
def get_comparison(session_id: str, db: Session = Depends(get_db)):
    rows = db.query(LoanComparison).filter(LoanComparison.session_id == session_id).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No comparison generated yet for this session.")
    return [ComparisonFieldOut.model_validate(r) for r in rows]
