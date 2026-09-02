from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class DocumentOut(BaseModel):
    id: str
    filename: str
    file_type: str
    agreement_label: str
    chunk_count: int
    file_size: int
    uploaded_at: datetime
    status: str

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    document: DocumentOut
    message: str


class ProfileRequest(BaseModel):
    session_id: str
    monthly_income: float
    loan_amount_needed: float
    preferred_tenure_months: int


class ProfileOut(BaseModel):
    session_id: str
    monthly_income: float
    loan_amount_needed: float
    preferred_tenure_months: int

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    session_id: str
    agreement_label: Optional[Literal["A", "B", "both"]] = "A"


class RiskFlagOut(BaseModel):
    id: str
    clause_text: str
    rbi_rule_matched: Optional[str]
    rbi_source_document: Optional[str]
    rbi_document_status: str
    deviation_description: Optional[str]
    risk_level: str
    reason: Optional[str]

    class Config:
        from_attributes = True


class ComparisonFieldOut(BaseModel):
    field_name: str
    agreement_a_value: Optional[str]
    agreement_b_value: Optional[str]

    class Config:
        from_attributes = True
