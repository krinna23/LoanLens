from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import UserFinancialProfile
from models.schemas import ProfileRequest, ProfileOut
from utils.helpers import generate_id

router = APIRouter()


@router.post("/profile", response_model=ProfileOut)
def submit_profile(request: ProfileRequest, db: Session = Depends(get_db)):
    existing = db.query(UserFinancialProfile).filter(
        UserFinancialProfile.session_id == request.session_id
    ).first()

    if existing:
        existing.monthly_income = request.monthly_income
        existing.loan_amount_needed = request.loan_amount_needed
        existing.preferred_tenure_months = request.preferred_tenure_months
        db.commit()
        db.refresh(existing)
        return ProfileOut.model_validate(existing)

    new_profile = UserFinancialProfile(
        id=generate_id(),
        session_id=request.session_id,
        monthly_income=request.monthly_income,
        loan_amount_needed=request.loan_amount_needed,
        preferred_tenure_months=request.preferred_tenure_months,
    )
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    return ProfileOut.model_validate(new_profile)


@router.get("/profile/{session_id}", response_model=ProfileOut)
def get_profile(session_id: str, db: Session = Depends(get_db)):
    profile = db.query(UserFinancialProfile).filter(
        UserFinancialProfile.session_id == session_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found for this session")
    return ProfileOut.model_validate(profile)
