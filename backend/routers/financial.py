import json
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.vector_store import get_collection, get_agreement_collection_name
from services.llm import client as groq_client, MODEL
from db.database import get_db
from db.models import ClauseRiskFlag

router = APIRouter()

class TrueCostRequest(BaseModel):
    principal: Optional[float] = None
    annual_rate_pct: Optional[float] = None
    tenure_months: Optional[int] = None
    processing_fee: Optional[float] = None
    insurance: Optional[float] = None
    other_charges: Optional[float] = None

class PrepaymentRequest(BaseModel):
    principal: float
    annual_rate_pct: float
    tenure_months: int
    months_paid: int
    prepayment_amount: float
    prepayment_charge_pct: float = 0.0

@router.post("/extract_fields/{session_id}")
def extract_fields(session_id: str, agreement_label: str = "A"):
    try:
        collection_name = get_agreement_collection_name(session_id, agreement_label)
        collection = get_collection(collection_name)
        
        if collection.count() == 0:
            raise HTTPException(status_code=404, detail="No document chunks found. Upload the agreement first.")

        sample = collection.peek(limit=20)
        chunks = sample.get("documents", [])

        context = "\n\n".join(chunks)
        
        prompt = """You are a financial document analyst. Extract specific loan terms from the provided agreement text.

Return ONLY a JSON object with these exact keys (never guess, always use "Not specified" if not found):
{
  "loan_amount": "e.g. ₹5,00,000 or Not specified",
  "loan_type": "e.g. Personal Loan or Not specified",
  "interest_rate": "e.g. 10.5% p.a. or Not specified",
  "interest_type": "Fixed / Floating / Not specified",
  "tenure": "e.g. 60 months or Not specified",
  "emi": "e.g. ₹10,747 or Not specified",
  "disbursement_mode": "e.g. Bank transfer or Not specified",
  "processing_fee": "e.g. ₹5,000 or Not specified",
  "insurance": "e.g. ₹2,000 or Not specified",
  "other_charges": "description or Not specified",
  "late_payment_charges": "e.g. 2% per month or Not specified",
  "prepayment_charges": "e.g. 3% of outstanding principal or Not specified",
  "prepayment_allowed": "Yes / No / Partial / Not specified",
  "lock_in_period": "e.g. 12 months or Not specified",
  "collateral": "e.g. None required / Property / Not specified",
  "rate_reset_conditions": "description or Not specified",
  "default_conditions": "description or Not specified"
}

Document text:
""" + context

        response = groq_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a precise JSON extractor. Output ONLY JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0
        )
        
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        return json.loads(content)
    except Exception as e:
        return {
            "loan_amount": "Could not extract",
            "loan_type": "Could not extract",
            "interest_rate": "Could not extract",
            "interest_type": "Could not extract",
            "tenure": "Could not extract",
            "emi": "Could not extract",
            "disbursement_mode": "Could not extract",
            "processing_fee": "Could not extract",
            "insurance": "Could not extract",
            "other_charges": "Could not extract",
            "late_payment_charges": "Could not extract",
            "prepayment_charges": "Could not extract",
            "prepayment_allowed": "Could not extract",
            "lock_in_period": "Could not extract",
            "collateral": "Could not extract",
            "rate_reset_conditions": "Could not extract",
            "default_conditions": "Could not extract"
        }

@router.post("/true_cost/{session_id}")
def true_cost(session_id: str, req: TrueCostRequest):
    missing_fields = []
    if req.principal is None: missing_fields.append("principal")
    if req.annual_rate_pct is None: missing_fields.append("annual_rate_pct")
    if req.tenure_months is None: missing_fields.append("tenure_months")
    
    if missing_fields:
        return {
            "error": "insufficient_data",
            "missing_fields": missing_fields,
            "message": f"Cannot calculate accurately because {', '.join(missing_fields)} are not specified in the agreement."
        }
        
    principal = req.principal
    annual_rate_pct = req.annual_rate_pct
    tenure_months = req.tenure_months
    
    r = annual_rate_pct / (12 * 100)
    if r == 0:
        emi = principal / tenure_months
    else:
        emi = principal * r * (1+r)**tenure_months / ((1+r)**tenure_months - 1)
        
    total_repayment = round(emi * tenure_months, 2)
    total_interest = round(total_repayment - principal, 2)
    fees = round((req.processing_fee or 0) + (req.insurance or 0) + (req.other_charges or 0), 2)
    total_cost = round(total_repayment + fees, 2)
    
    return {
        "principal": principal,
        "emi": round(emi, 2),
        "tenure_months": tenure_months,
        "total_repayment": total_repayment,
        "total_interest": total_interest,
        "processing_fee": req.processing_fee or 0,
        "insurance": req.insurance or 0,
        "other_charges": req.other_charges or 0,
        "total_fees": fees,
        "total_cost": total_cost,
        "source": "Calculated from provided values"
    }

@router.post("/prepayment_scenario")
def prepayment_scenario(req: PrepaymentRequest):
    try:
        if req.months_paid >= req.tenure_months:
            raise ValueError("months_paid must be less than tenure_months")
        if req.prepayment_amount <= 0:
            raise ValueError("prepayment_amount must be greater than 0")
            
        r = req.annual_rate_pct / (12 * 100)
        n = req.tenure_months
        m = req.months_paid
        principal = req.principal
        
        if r == 0:
            outstanding = principal * (1 - m / n)
        else:
            outstanding = principal * ((1 + r)**n - (1 + r)**m) / ((1 + r)**n - 1)
        outstanding = round(outstanding, 2)
        
        actual_prepayment = min(req.prepayment_amount, outstanding)
        
        if r == 0:
            emi = principal / n
        else:
            emi = principal * r * (1+r)**n / ((1+r)**n - 1)
            
        remaining_months = n - m
        interest_without = round(emi * remaining_months - outstanding, 2)
        
        new_outstanding = outstanding - actual_prepayment
        if new_outstanding <= 0:
            interest_with = 0
            months_saved = remaining_months
        else:
            if r == 0:
                new_remaining_months = int(new_outstanding / emi)
            else:
                new_remaining_months = int(math.ceil(-math.log(1 - new_outstanding * r / emi) / math.log(1 + r)))
            interest_with = round(emi * new_remaining_months - new_outstanding, 2)
            months_saved = remaining_months - new_remaining_months
            
        interest_saved = round(max(0, interest_without - interest_with), 2)
        prepayment_charge = round(actual_prepayment * req.prepayment_charge_pct / 100, 2)
        net_benefit = round(interest_saved - prepayment_charge, 2)
        
        return {
            "outstanding_principal": outstanding,
            "prepayment_amount": actual_prepayment,
            "new_outstanding": round(max(0, new_outstanding), 2),
            "months_saved": months_saved,
            "interest_saved": interest_saved,
            "prepayment_charge": prepayment_charge,
            "net_benefit": net_benefit,
            "assumptions": [
                "Calculation uses reducing balance (amortization) method",
                "EMI assumed constant throughout loan tenure",
                f"Prepayment charge rate: {req.prepayment_charge_pct}% of prepaid amount",
                "Interest saved is approximate based on standard amortization"
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/regulatory_status/{session_id}")
def regulatory_status(session_id: str, db: Session = Depends(get_db)):
    flags = db.query(ClauseRiskFlag).filter(ClauseRiskFlag.session_id == session_id).order_by(ClauseRiskFlag.created_at.desc()).all()
    
    STATUS_LABELS = {
        "ACTIVE": {"label": "ACTIVE", "color": "green", "explanation": "The referenced regulatory guideline is currently active."},
        "WITHDRAWN": {"label": "WITHDRAWN", "color": "red", "explanation": "The referenced circular has been withdrawn. This clause cannot be assessed solely against this withdrawn guideline."},
        "SUPERSEDED": {"label": "SUPERSEDED", "color": "amber", "explanation": "This guideline has been replaced by a newer regulation. Refer to the current applicable rule."},
    }
    
    results = []
    for flag in flags:
        status_info = STATUS_LABELS.get(flag.rbi_document_status, {"label": "NOT VERIFIED", "color": "gray", "explanation": "Regulatory status could not be verified from available sources."})
        results.append({
            "flag_id": flag.id,
            "risk_level": flag.risk_level,
            "rbi_source_document": flag.rbi_source_document,
            "rbi_document_status": flag.rbi_document_status,
            "status_label": status_info["label"],
            "status_color": status_info["color"],
            "status_explanation": status_info["explanation"],
            "deviation_description": flag.deviation_description
        })
        
    return results
