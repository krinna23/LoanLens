"""
Populates and updates the permanent 'rbi_knowledge_base' ChromaDB collection
and the 'rbi_knowledge_docs' table from RBI guideline documents and loan reference materials.

Run manually whenever RBI documents are added or updated:
    python scripts/seed_rbi_knowledge.py
"""

import os
import sys
import uuid
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.parser import parse_file, detect_watermark_status
from services.chunker import chunk_text
from services.embedder import embed_chunks
from services.vector_store import add_chunks, RBI_KNOWLEDGE_COLLECTION
from db.database import SessionLocal, engine, Base
from db.models import RBIKnowledgeDoc

RBI_DOCS_PATH = os.getenv("RBI_DOCS_PATH", "./data/rbi_guidelines")

# Comprehensive Document Registry defining status, authority, type, and topic
DOCUMENT_REGISTRY = {
    "01_kfs_circular.txt": {
        "title": "RBI Directions on Key Facts Statement (KFS) for Retail & MSME Loans",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Circular",
        "status": "ACTIVE",
        "topic": "Key Facts Statement (KFS) and APR Transparency",
        "effective_date": "2024-10-01",
        "notes": "Mandates KFS with APR and all-inclusive fee disclosure for all retail/MSME loans."
    },
    "02_rbi_housing_loans_faq.txt": {
        "title": "RBI Frequently Asked Questions on Housing Loans",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "Housing Loans, LTV Ratios & Third-Party Charges",
        "effective_date": "None",
        "notes": "Informational FAQ explaining RBI housing loan regulations, LTV caps, and fees."
    },
    "03_prepayment_charges_directions_2025.txt": {
        "title": "RBI Master Direction on Prepayment and Foreclosure Charges on Loans",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Direction",
        "status": "ACTIVE",
        "topic": "Prepayment and Foreclosure Charges",
        "effective_date": "2025",
        "notes": "Prohibits foreclosure/prepayment charges on floating-rate individual loans."
    },
    "04_interest_rate_on_advances_master_direction.txt": {
        "title": "RBI Master Direction on Interest Rate on Advances (2016)",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Direction",
        "status": "WITHDRAWN",
        "topic": "Interest Rate on Advances, MCLR, Base Rate",
        "effective_date": "2016-03-03",
        "notes": "Withdrawn direction. Kept for historical reference only."
    },
    "MD20D6FC6F31E8E5458F9E0411F433B7D40A.pdf": {
        "title": "RBI Master Direction on Interest Rate on Advances (2016)",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Direction",
        "status": "WITHDRAWN",
        "topic": "Interest Rate on Advances, MCLR, Base Rate",
        "effective_date": "2016-03-03",
        "notes": "PDF version of Master Direction 2016 with 'Withdrawn' watermark."
    },
    "05_housing_finance_master_circular.txt": {
        "title": "RBI Master Circular - Housing Finance for Commercial Banks",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Circular",
        "status": "ACTIVE",
        "topic": "Housing Finance, Margin Requirements & Foreclosure Rules",
        "effective_date": "2024",
        "notes": "Active master circular governing bank housing finance rules and disclosures."
    },
    "06_emi_floating_rate_reset_circular.txt": {
        "title": "RBI Circular on Reset of Floating Interest Rate on EMI Based Personal Loans",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Circular",
        "status": "ACTIVE",
        "topic": "Floating Rate Reset, EMI Extension & Switch Options",
        "effective_date": "2023-08-18",
        "notes": "Requires lenders to offer options to switch to fixed rate or adjust EMI/tenure upon rate reset."
    },
    "07_property_document_release_circular.txt": {
        "title": "RBI Circular on Responsible Lending – Release of Property Documents on Loan Repayment",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Circular",
        "status": "ACTIVE",
        "topic": "Release of Property Documents, Delay Compensation (₹5000/day)",
        "effective_date": "2023-09-13",
        "notes": "Mandates release of original property docs within 30 days of loan settlement, ₹5000/day penalty for delay."
    },
    "08_penal_charges_circular.txt": {
        "title": "RBI Fair Lending Practice – Penal Charges in Loan Accounts",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Circular",
        "status": "ACTIVE",
        "topic": "Penal Charges, Prohibition of Penal Interest Compounding",
        "effective_date": "2024-04-01",
        "notes": "Strictly prohibits adding penal interest to principal/compounding; penalties must be separate reasonable penal charges."
    },
    "09_banking_regulation_act_1949.txt": {
        "title": "Banking Regulation Act, 1949 (Key Lending Sections)",
        "authority": "Statute of India / RBI",
        "source": "Statute",
        "document_type": "Act",
        "status": "INFORMATIONAL",
        "topic": "Statutory Power & Banking Regulation",
        "effective_date": "1949",
        "notes": "Statutory legal framework governing banking operations and credit."
    },
    "10_rbi_fair_practices_code_interest_2024.txt": {
        "title": "RBI Fair Practices Code – Fair and Transparent Charging of Interest",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Circular",
        "status": "ACTIVE",
        "topic": "Excessive Interest Rates, Annualised Rate Disclosure & Restraint",
        "effective_date": "2024-04-29",
        "notes": "Directs lenders against unfair interest calculation practices (e.g. charging interest before disbursal)."
    },
    "11_rbi_fair_practices_code.txt": {
        "title": "RBI Guidelines on Fair Practices Code for Lenders",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Guidelines",
        "status": "HISTORICAL",
        "topic": "Fair Practices Code, Loan Processing & Transparency",
        "effective_date": "2003",
        "notes": "Historical foundation of Fair Practices Code, superseded in parts by newer 2023/2024 circulars."
    },
    "12_rbi_integrated_ombudsman_scheme_faq.txt": {
        "title": "RBI Frequently Asked Questions on Integrated Ombudsman Scheme",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "Grievance Redressal, Banking Ombudsman & Complaints",
        "effective_date": "None",
        "notes": "Guidance on how borrowers can escalate unaddressed grievances to the RBI Ombudsman."
    },
    "13_rbi_kyc_faq_2025.txt": {
        "title": "RBI Frequently Asked Questions on KYC (Know Your Customer)",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "KYC Documentation & Periodic Updation",
        "effective_date": "2025-06-09",
        "notes": "Consumer FAQs regarding official valid documents and customer due diligence."
    },
    "14_rbi_kyc_master_direction.txt": {
        "title": "RBI Master Direction – Know Your Customer (KYC) Direction",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Direction",
        "status": "ACTIVE",
        "topic": "KYC Norms, Identity Verification & Video KYC",
        "effective_date": "2016-02-25",
        "notes": "Regulatory master direction on customer identification and lending verification."
    },
    "15_rbi_digital_lending_directions_2025.txt": {
        "title": "RBI Master Direction on Digital Lending & Lending Service Providers (LSPs)",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "Master Direction",
        "status": "ACTIVE",
        "topic": "Digital Lending, Cooling-off Period, DLAs, LSPs & Data Privacy",
        "effective_date": "2025-05-08",
        "notes": "Comprehensive rules for digital loans: look-up period, direct disbursal to borrower account, no third-party fee deduction."
    },
    "16_rbi_secured_assets_sarfaesi_faq.txt": {
        "title": "RBI FAQ on Secured Assets Display under SARFAESI Act",
        "authority": "Reserve Bank of India",
        "source": "RBI",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "Secured Lending, Collateral & SARFAESI Disclosures",
        "effective_date": "2024-02-06",
        "notes": "Information regarding bank disclosures of possessed assets under security enforcement."
    },
    "17_icici_emi_upi_mitc.txt": {
        "title": "ICICI Bank EMI @ UPI Most Important Terms and Conditions (MITC)",
        "authority": "ICICI Bank",
        "source": "Bank",
        "document_type": "MITC",
        "status": "BANK_SPECIFIC",
        "topic": "ICICI Bank UPI Loan Product Terms & Penal Fees",
        "effective_date": "None",
        "notes": "Bank-specific credit facility MITC. Represents commercial terms, not RBI regulation."
    },
    "18_icici_emi_upi_terms_and_conditions.txt": {
        "title": "ICICI Bank EMI @ UPI Terms and Conditions",
        "authority": "ICICI Bank",
        "source": "Bank",
        "document_type": "Terms and Conditions",
        "status": "BANK_SPECIFIC",
        "topic": "ICICI Bank Loan Agreement Standard Clauses & Default Provisions",
        "effective_date": "None",
        "notes": "Bank-specific standard loan agreement contract terms and clauses."
    },
    "19_hdfc_home_loan_mitc.txt": {
        "title": "HDFC Bank Home Loan Most Important Terms and Conditions (MITC)",
        "authority": "HDFC Bank",
        "source": "Bank",
        "document_type": "MITC",
        "status": "BANK_SPECIFIC",
        "topic": "HDFC Bank Home Loan Charges, Prepayment & Insurance Clauses",
        "effective_date": "None",
        "notes": "Bank-specific home loan schedule and MITC terms."
    },
    "20_sbi_home_loan_mitc.txt": {
        "title": "State Bank of India Home Loan Terms and Conditions & MITC",
        "authority": "State Bank of India",
        "source": "Bank",
        "document_type": "MITC",
        "status": "BANK_SPECIFIC",
        "topic": "SBI Home Loan Interest Rates, Reset, Prepayment & Default Clauses",
        "effective_date": "None",
        "notes": "SBI home loan contract terms and borrower disclosure schedule."
    },
    "21_kotak_personal_loan_mitc.txt": {
        "title": "Kotak Mahindra Bank Personal Loan MITC",
        "authority": "Kotak Mahindra Bank",
        "source": "Bank",
        "document_type": "MITC",
        "status": "BANK_SPECIFIC",
        "topic": "Kotak Bank Personal Loan Fees, Foreclosure & Late Charges",
        "effective_date": "None",
        "notes": "Commercial personal loan MITC from Kotak Mahindra Bank."
    },
    "22_axis_bank_personal_loan_terms_and_conditions.txt": {
        "title": "Axis Bank Personal Loan Terms and Conditions",
        "authority": "Axis Bank",
        "source": "Bank",
        "document_type": "Terms and Conditions",
        "status": "BANK_SPECIFIC",
        "topic": "Axis Bank Personal Loan Covenants, Acceleration & Foreclosure Charges",
        "effective_date": "None",
        "notes": "Axis Bank standard terms, default covenants, and arbitration clauses."
    },
    "23_bajaj_housing_finance_retail_mitc.txt": {
        "title": "Bajaj Housing Finance Limited Retail MITC (Secured & Unsecured)",
        "authority": "Bajaj Housing Finance Limited",
        "source": "NBFC/HFC",
        "document_type": "MITC",
        "status": "BANK_SPECIFIC",
        "topic": "Housing Finance Company MITC, Prepayment Rules & Fee Schedule",
        "effective_date": "None",
        "notes": "HFC-specific terms for home loans and loan against property."
    },
    "24_cibil_score_and_report_brochure.txt": {
        "title": "TransUnion CIBIL Credit Score & Report Brochure",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "Brochure",
        "status": "INFORMATIONAL",
        "topic": "Credit Information, CIBIL Scoring & Credit History",
        "effective_date": "2025-10-15",
        "notes": "Educational guide on credit reports and score calculation."
    },
    "25_cibil_credit_score_and_loan_basics.txt": {
        "title": "TransUnion CIBIL FAQ – Credit Score & Loan Basics",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "Credit Score Factors, Loan Eligibility & Credit Inquiries",
        "effective_date": "None",
        "notes": "Educational FAQ explaining creditworthiness and loan impact."
    },
    "26_cibil_loan_rejections_and_disputes.txt": {
        "title": "TransUnion CIBIL FAQ – Loan Rejections & Credit Report Disputes",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "FAQ",
        "status": "INFORMATIONAL",
        "topic": "Credit Report Errors, Dispute Resolution & Rejections",
        "effective_date": "None",
        "notes": "Guidance for borrowers dealing with dispute correction on credit reports."
    },
    "27_cibil_consumer_awareness.txt": {
        "title": "TransUnion CIBIL Consumer Awareness Guide",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "Educational",
        "status": "INFORMATIONAL",
        "topic": "Credit Management & Awareness",
        "effective_date": "None",
        "notes": "Consumer guide for managing loan repayments and credit profile."
    },
    "28_cibil_understand_credit_score_and_report.txt": {
        "title": "TransUnion CIBIL Guide – Understand Your Score & Report",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "Educational",
        "status": "INFORMATIONAL",
        "topic": "DPD (Days Past Due), Account Status & Payment History",
        "effective_date": "None",
        "notes": "Detailed breakdown of credit report sections, DPD, and defaults."
    },
    "29_cibil_report_understanding.txt": {
        "title": "TransUnion CIBIL In-Depth Report Understanding Guide",
        "authority": "TransUnion CIBIL",
        "source": "CIBIL",
        "document_type": "Educational",
        "status": "INFORMATIONAL",
        "topic": "Credit Utilization, Overdue Balances & Settlement Records",
        "effective_date": "None",
        "notes": "Explains how written-off or settled loan accounts impact future borrowing."
    }
}


def get_file_type(filename: str) -> str:
    ext = filename.split(".")[-1].lower()
    if ext in ("pdf", "txt", "docx"):
        return ext
    return "txt"


def seed_rbi_knowledge_base():
    if not os.path.isdir(RBI_DOCS_PATH):
        print(f"ERROR: RBI documents folder not found at {RBI_DOCS_PATH}")
        return

    # Process all supported documents (skip metadata JSON files)
    files = [
        f for f in sorted(os.listdir(RBI_DOCS_PATH))
        if not f.startswith(".") and f.lower().endswith((".pdf", ".txt", ".docx"))
    ]
    if not files:
        print(f"No documents found in {RBI_DOCS_PATH}. Nothing to seed.")
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    total_chunks_seeded = 0

    for filename in files:
        filepath = os.path.join(RBI_DOCS_PATH, filename)
        file_type = get_file_type(filename)

        print(f"\nProcessing: {filename} ({file_type})")

        try:
            text = parse_file(filepath, file_type)
        except Exception as e:
            print(f"  FAILED to parse: {e}")
            continue

        if not text.strip():
            print(f"  WARNING: No text extracted, skipping.")
            continue

        # Look up metadata from registry or JSON file
        meta = DOCUMENT_REGISTRY.get(filename, {})
        if not meta:
            json_path = os.path.join(RBI_DOCS_PATH, os.path.splitext(filename)[0] + ".json")
            if os.path.isfile(json_path):
                try:
                    with open(json_path, "r", encoding="utf-8") as jf:
                        meta = json.load(jf)
                except Exception:
                    pass

        status = meta.get("status") or detect_watermark_status(text)
        title = meta.get("title") or filename
        authority = meta.get("authority") or "Reserve Bank of India"
        source = meta.get("source") or "RBI"
        doc_type = meta.get("document_type") or "Circular"
        topic = meta.get("topic") or ""
        notes = meta.get("notes") or f"Authority: {authority}, Type: {doc_type}, Status: {status}"

        print(f"  Title: {title}")
        print(f"  Authority: {authority} | Status: {status} | Type: {doc_type}")

        # Deterministic 36-char doc_id based on filename so re-running updates cleanly
        doc_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, filename))

        # Prepend header to give clear context to each chunk
        flagged_text = f"[{authority.upper()} — {title.upper()} — STATUS: {status}]\n\n{text}"

        chunks = chunk_text(flagged_text, doc_id, filename)

        for i, c in enumerate(chunks):
            c["chunk_id"] = f"{doc_id}_chunk_{i}"
            c["document_status"] = status
            c["title"] = title
            c["authority"] = authority
            c["source"] = source
            c["document_type"] = doc_type
            c["topic"] = topic

        chunks_with_embeddings = embed_chunks(chunks)
        add_chunks(RBI_KNOWLEDGE_COLLECTION, chunks_with_embeddings)

        print(f"  Seeded {len(chunks)} chunks into '{RBI_KNOWLEDGE_COLLECTION}'")
        total_chunks_seeded += len(chunks)

        # Record or update in MySQL for tracking
        existing = db.query(RBIKnowledgeDoc).filter(RBIKnowledgeDoc.filename == filename).first()
        if existing:
            existing.status = status
            existing.title = title
            existing.chunk_count = len(chunks)
            existing.notes = notes
        else:
            db.add(RBIKnowledgeDoc(
                id=doc_id,
                filename=filename,
                title=title,
                status=status,
                chunk_count=len(chunks),
                notes=notes,
            ))
        db.commit()

    db.close()

    print(f"\n{'='*60}")
    print(f"Seeding complete. Total chunks in knowledge base: {total_chunks_seeded}")
    print(f"{'='*60}")


if __name__ == "__main__":
    seed_rbi_knowledge_base()
