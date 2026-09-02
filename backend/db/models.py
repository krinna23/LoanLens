from sqlalchemy import Column, String, Integer, DateTime, Text, Float, JSON
from sqlalchemy.sql import func
from .database import Base


class Document(Base):
    """Stores metadata for every uploaded loan agreement."""
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(20), nullable=False)  # pdf / docx / txt
    session_id = Column(String(36), nullable=False, index=True)
    agreement_label = Column(String(10), default="A")  # "A" or "B" for comparison
    chunk_count = Column(Integer, default=0)
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default="processing")  # processing / ready / error


class UserFinancialProfile(Base):
    """One-time profile form data used to personalize every response."""
    __tablename__ = "user_financial_profile"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, unique=True, index=True)
    monthly_income = Column(Float, nullable=False)
    loan_amount_needed = Column(Float, nullable=False)
    preferred_tenure_months = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ClauseRiskFlag(Base):
    """Structured risk output — never free text, always these exact fields."""
    __tablename__ = "clause_risk_flags"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    document_id = Column(String(36), nullable=False)
    clause_text = Column(Text, nullable=False)
    rbi_rule_matched = Column(Text, nullable=True)
    rbi_source_document = Column(String(255), nullable=True)
    rbi_document_status = Column(String(20), default="ACTIVE")  # ACTIVE / WITHDRAWN
    deviation_description = Column(Text, nullable=True)
    risk_level = Column(String(10), default="LOW")  # LOW / MEDIUM / HIGH — plain string
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LoanComparison(Base):
    """Structured side-by-side comparison fields between Agreement A and B."""
    __tablename__ = "loan_comparison"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)  # e.g. "interest_rate"
    agreement_a_value = Column(String(255), nullable=True)
    agreement_b_value = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RBIKnowledgeDoc(Base):
    """Tracks which RBI documents have been seeded, and their current status."""
    __tablename__ = "rbi_knowledge_docs"

    id = Column(String(36), primary_key=True)
    filename = Column(String(255), nullable=False)
    title = Column(String(500), nullable=True)
    status = Column(String(20), default="ACTIVE")  # ACTIVE / WITHDRAWN / SUPERSEDED
    replaced_by = Column(String(255), nullable=True)  # filename/reference if superseded
    chunk_count = Column(Integer, default=0)
    seeded_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text, nullable=True)
