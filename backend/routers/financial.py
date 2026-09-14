import json
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from services.vector_store import get_collection, get_agreement_collection_name
from services.llm import client as groq_client, MODEL, AVAILABLE_MODELS
from db.database import get_db
from db.models import ClauseRiskFlag

router = APIRouter()

# In-memory cache: session_id+label -> extracted fields dict
# Prevents redundant LLM calls if the same session calls extract_fields again
_fields_cache: dict = {}


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
    cache_key = f"{session_id}:{agreement_label}"
    if cache_key in _fields_cache:
        print(f"[ExtractFields] Cache hit for {cache_key}")
        return _fields_cache[cache_key]

    try:
        collection_name = get_agreement_collection_name(session_id, agreement_label)
        collection = get_collection(collection_name)
        
        if collection.count() == 0:
            raise HTTPException(status_code=404, detail="No document chunks found. Upload the agreement first.")

        total_count = collection.count()
        gathered_chunks = []
        seen_texts = set()

        # 1. Take initial document overview / sanction chunks
        initial_sample = collection.peek(limit=min(10, total_count))
        for doc in (initial_sample.get("documents") or []):
            if doc and doc not in seen_texts:
                seen_texts.add(doc)
                gathered_chunks.append(doc)

        # 2. Targeted semantic retrieval for key contractual terms across the full document
        from services.vector_store import query_collection
        from services.embedder import embed_query
        
        target_queries = [
            "collateral security guarantee hypothecation pledge unsecured",
            "event of default breach remedies recovery associate",
            "interest rate reset benchmark spread floating MCLR revision",
            "prepayment foreclosure part payment charges lock-in period",
            "repayment schedule instalment EMI bounce charges NACH auto-debit"
        ]
        
        for q in target_queries:
            try:
                emb = embed_query(q)
                matches = query_collection(collection_name, emb, n_results=2)
                for m in (matches or []):
                    m_text = m.get("text", "")
                    if m_text and m_text not in seen_texts:
                        seen_texts.add(m_text)
                        gathered_chunks.append(m_text)
            except Exception as q_err:
                print(f"Error querying agreement for '{q}': {q_err}")

        # Limit context to avoid hitting Groq token limits while capturing all key sections
        context = "\n\n---\n\n".join(gathered_chunks)[:9500]
        
        prompt = """You are a financial document analyst. Extract specific loan terms from the provided agreement text.

CRITICAL INSTRUCTIONS:
- Extract the actual value or condition explicitly stated in the text.
- If a requirement is stated as not applicable or clean (e.g. 'Unsecured Personal Loan', 'No collateral required', 'No third-party guarantor needed'), state that explicitly (e.g. 'Unsecured / None required' or 'No third-party guarantee needed'). Do NOT mark it 'Not specified'.
- If a term is partially specified or conditional (e.g. '4% of principal outstanding up to 24 EMIs; post-24 EMI condition not specified' or 'Fixed for 1 year, then resets annually'), PRESERVE the exact specified part. Do NOT mark the whole field 'Not specified'.
- Only return 'Not specified' if the provided text genuinely contains no mention or indication of that term.

Return ONLY a valid JSON object with these exact keys:
{
  "loan_amount": "e.g. ₹5,00,000 or Not specified",
  "loan_type": "e.g. Personal Loan or Not specified",
  "interest_rate": "e.g. 10.5% p.a. or Not specified",
  "interest_type": "Fixed / Floating / Hybrid / Not specified",
  "tenure": "e.g. 60 months or Not specified",
  "emi": "e.g. ₹10,747 or Not specified",
  "disbursement_mode": "e.g. Direct bank transfer or Not specified",
  "processing_fee": "e.g. ₹5,000 or Not specified",
  "insurance": "e.g. ₹2,000 or Not specified",
  "other_charges": "description of any other charges or Not specified",
  "late_payment_charges": "e.g. 18% p.a. on overdue amount or 2% per month or Not specified",
  "prepayment_charges": "exact condition found (e.g. 4% within first 24 EMIs; post-24 EMI condition not specified) or Not specified",
  "prepayment_allowed": "Yes / Allowed with charges / No / Not specified",
  "lock_in_period": "e.g. 12 months or Not specified",
  "collateral": "exact collateral condition (e.g. Unsecured / None required, or Property) or Not specified",
  "security_guarantee": "exact guarantee/security details found (e.g. None required / Personal guarantee) or Not specified",
  "rate_reset_conditions": "exact rate reset clause found or Not specified",
  "default_conditions": "exact default triggers or recovery/penal consequences found or Not specified",
  "repayment_conditions": "exact repayment mode or bounce charge details found or Not specified"
}

Document text:
""" + context

        last_error = None
        for candidate_model in AVAILABLE_MODELS:
            try:
                response = groq_client.chat.completions.create(
                    model=candidate_model,
                    messages=[
                        {"role": "system", "content": "You are a precise JSON extractor. Output ONLY a valid JSON object."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.0,
                    max_tokens=800,
                    response_format={"type": "json_object"}
                )
                
                content = response.choices[0].message.content.strip()
                if "{" in content and "}" in content:
                    content = content[content.find("{"):content.rfind("}")+1]
                    
                parsed = json.loads(content)
                expected_keys = [
                    "loan_amount", "loan_type", "interest_rate", "interest_type", "tenure", "emi",
                    "disbursement_mode", "processing_fee", "insurance", "other_charges",
                    "late_payment_charges", "prepayment_charges", "prepayment_allowed",
                    "lock_in_period", "collateral", "security_guarantee", "rate_reset_conditions",
                    "default_conditions", "repayment_conditions"
                ]
                result = {k: parsed.get(k, "Not specified") for k in expected_keys}
                _fields_cache[cache_key] = result
                return result
            except Exception as model_err:
                last_error = model_err
                print(f"Model {candidate_model} failed for extract_fields ({model_err}), trying next candidate...")
                continue

        if last_error:
            raise last_error

    except Exception as e:
        print(f"Error in extract_fields: {e}")
        return {
            "loan_amount": "Not specified",
            "loan_type": "Not specified",
            "interest_rate": "Not specified",
            "interest_type": "Not specified",
            "tenure": "Not specified",
            "emi": "Not specified",
            "disbursement_mode": "Not specified",
            "processing_fee": "Not specified",
            "insurance": "Not specified",
            "other_charges": "Not specified",
            "late_payment_charges": "Not specified",
            "prepayment_charges": "Not specified",
            "prepayment_allowed": "Not specified",
            "lock_in_period": "Not specified",
            "collateral": "Not specified",
            "security_guarantee": "Not specified",
            "rate_reset_conditions": "Not specified",
            "default_conditions": "Not specified",
            "repayment_conditions": "Not specified"
        }

@router.post("/true_cost/calculate")
def true_cost(req: TrueCostRequest):
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


@router.get("/clause_explanations/{session_id}")
def get_clause_explanations(session_id: str, agreement_label: str = "A", db: Session = Depends(get_db)):
    """
    Returns structured, plain-language explanations of important clauses
    extracted from the agreement, along with borrower implications and RBI context.
    """
    # 1. First retrieve extracted loan fields (or extract if cached)
    fields = extract_fields(session_id, agreement_label)
    
    # 2. Retrieve risk flags for this session to augment with regulatory status
    flags = db.query(ClauseRiskFlag).filter(ClauseRiskFlag.session_id == session_id).all()
    flags_by_type = {}
    for f in flags:
        desc = (f.deviation_description or "").lower()
        if any(k in desc for k in ["penal", "penalty", "overdue", "late payment"]):
            flags_by_type["late_payment"] = f
        elif any(k in desc for k in ["prepayment", "foreclosure", "closure"]):
            flags_by_type["prepayment"] = f
        elif any(k in desc for k in ["interest", "rate", "reset", "mclr", "spread"]):
            flags_by_type["rate_reset"] = f
        elif any(k in desc for k in ["default"]):
            flags_by_type["default"] = f

    explanations = []

    # Clause 1: Prepayment & Foreclosure
    prep_val = fields.get("prepayment_charges") or fields.get("prepayment_allowed") or "Allowed subject to bank terms"
    prep_flag = flags_by_type.get("prepayment")
    explanations.append({
        "id": "prepayment_clause",
        "title": "Prepayment & Foreclosure Charges",
        "category": "Exit Conditions",
        "original_text": str(prep_val),
        "simple_explanation": "This clause explains whether you can pay off your loan early and if the lender will charge a fee for doing so.",
        "borrower_implication": "Under RBI guidelines, floating-rate personal/home loans to individual borrowers cannot have prepayment charges. Fixed-rate loans may still carry prepayment fees.",
        "rbi_context": prep_flag.rbi_rule_matched if prep_flag else "RBI Master Direction on Prepayment Charges (2025)",
        "rbi_status": prep_flag.rbi_document_status if prep_flag else "ACTIVE",
        "risk_level": prep_flag.risk_level if prep_flag else "LOW"
    })

    # Clause 2: Penal Charges & Default Interest
    late_val = fields.get("late_payment_charges") or "Penal charges on overdue amounts"
    late_flag = flags_by_type.get("late_payment")
    explanations.append({
        "id": "penal_charges_clause",
        "title": "Penal Charges & Late Payment",
        "category": "Default & Penalties",
        "original_text": str(late_val),
        "simple_explanation": "This specifies what extra charges apply if you miss an EMI payment or delay instalment repayment.",
        "borrower_implication": "RBI strictly mandates that penal charges must be reasonable and cannot be compounded or added into the loan principal to earn extra interest.",
        "rbi_context": late_flag.rbi_rule_matched if late_flag else "RBI Fair Lending Practice — Penal Charges in Loan Accounts (Circular 2023-24)",
        "rbi_status": late_flag.rbi_document_status if late_flag else "ACTIVE",
        "risk_level": late_flag.risk_level if late_flag else "MEDIUM"
    })

    # Clause 3: Interest Rate Reset
    rate_val = fields.get("rate_reset_conditions") or fields.get("interest_rate_type") or "Subject to periodic bank review"
    rate_flag = flags_by_type.get("rate_reset")
    explanations.append({
        "id": "rate_reset_clause",
        "title": "Interest Rate Reset & Benchmark",
        "category": "Interest & Pricing",
        "original_text": str(rate_val),
        "simple_explanation": "This determines how and when the lender can change your interest rate when benchmark rates (like Repo or MCLR) change.",
        "borrower_implication": "RBI rules require lenders to give you the option to switch to a fixed rate or adjust loan tenure when floating rates increase.",
        "rbi_context": rate_flag.rbi_rule_matched if rate_flag else "RBI Circular on Reset of Floating Rate Loan EMIs (Aug 2023)",
        "rbi_status": rate_flag.rbi_document_status if rate_flag else "ACTIVE",
        "risk_level": rate_flag.risk_level if rate_flag else "LOW"
    })

    # Clause 4: Default & Acceleration
    default_val = fields.get("default_conditions") or "Failure to pay EMI or breach of covenants"
    default_flag = flags_by_type.get("default")
    explanations.append({
        "id": "default_conditions_clause",
        "title": "Events of Default & Acceleration",
        "category": "Legal & Covenants",
        "original_text": str(default_val),
        "simple_explanation": "This lists the circumstances under which the lender considers you in breach and can demand immediate repayment of the entire outstanding balance.",
        "borrower_implication": "Borrowers must be given formal notice and a cure period before drastic acceleration or legal action is initiated.",
        "rbi_context": default_flag.rbi_rule_matched if default_flag else "RBI Fair Practices Code for Lenders",
        "rbi_status": default_flag.rbi_document_status if default_flag else "ACTIVE",
        "risk_level": default_flag.risk_level if default_flag else "LOW"
    })

    return {
        "session_id": session_id,
        "agreement_label": agreement_label,
        "clauses": explanations
    }

