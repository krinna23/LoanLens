"""create loanlens tables

Revision ID: 0001
Revises:
Create Date: 2026-08-16

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'documents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('file_type', sa.String(20), nullable=False),
        sa.Column('session_id', sa.String(36), nullable=False),
        sa.Column('agreement_label', sa.String(10), default='A'),
        sa.Column('chunk_count', sa.Integer(), default=0),
        sa.Column('file_size', sa.Integer(), default=0),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('status', sa.String(20), default='processing'),
    )
    op.create_index('ix_documents_session_id', 'documents', ['session_id'])

    op.create_table(
        'user_financial_profile',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), nullable=False, unique=True),
        sa.Column('monthly_income', sa.Float(), nullable=False),
        sa.Column('loan_amount_needed', sa.Float(), nullable=False),
        sa.Column('preferred_tenure_months', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )
    op.create_index('ix_user_financial_profile_session_id', 'user_financial_profile', ['session_id'])

    op.create_table(
        'clause_risk_flags',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), nullable=False),
        sa.Column('document_id', sa.String(36), nullable=False),
        sa.Column('clause_text', sa.Text(), nullable=False),
        sa.Column('rbi_rule_matched', sa.Text(), nullable=True),
        sa.Column('rbi_source_document', sa.String(255), nullable=True),
        sa.Column('rbi_document_status', sa.String(20), default='ACTIVE'),
        sa.Column('deviation_description', sa.Text(), nullable=True),
        sa.Column('risk_level', sa.String(10), default='LOW'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )
    op.create_index('ix_clause_risk_flags_session_id', 'clause_risk_flags', ['session_id'])

    op.create_table(
        'loan_comparison',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), nullable=False),
        sa.Column('field_name', sa.String(100), nullable=False),
        sa.Column('agreement_a_value', sa.String(255), nullable=True),
        sa.Column('agreement_b_value', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )
    op.create_index('ix_loan_comparison_session_id', 'loan_comparison', ['session_id'])

    op.create_table(
        'rbi_knowledge_docs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('title', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), default='ACTIVE'),
        sa.Column('replaced_by', sa.String(255), nullable=True),
        sa.Column('chunk_count', sa.Integer(), default=0),
        sa.Column('seeded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('rbi_knowledge_docs')
    op.drop_index('ix_loan_comparison_session_id', table_name='loan_comparison')
    op.drop_table('loan_comparison')
    op.drop_index('ix_clause_risk_flags_session_id', table_name='clause_risk_flags')
    op.drop_table('clause_risk_flags')
    op.drop_index('ix_user_financial_profile_session_id', table_name='user_financial_profile')
    op.drop_table('user_financial_profile')
    op.drop_index('ix_documents_session_id', table_name='documents')
    op.drop_table('documents')
