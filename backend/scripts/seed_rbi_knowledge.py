"""
One-time script to populate the permanent 'rbi_knowledge_base' ChromaDB
collection from RBI guideline documents (PDF and TXT supported).

Run manually whenever RBI documents are added or updated:
    python scripts/seed_rbi_knowledge.py

This does NOT run automatically per user request — it is a setup/maintenance
script only, separate from the per-user document upload flow.
"""

import os
import sys
import uuid

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

# ─────────────────────────────────────────────────────────────────────────
# MANUAL OVERRIDE TABLE
# If a document's status cannot be auto-detected from its content
# (e.g. no visible watermark text extracted), set it explicitly here.
# Key = exact filename in RBI_DOCS_PATH
# ─────────────────────────────────────────────────────────────────────────
MANUAL_STATUS_OVERRIDE = {
    # Example based on the document discussed in this conversation:
    "MD20D6FC6F31E8E5458F9E0411F433B7D40A.pdf": {
        "status": "WITHDRAWN",
        "notes": "RBI Master Direction on Interest Rate on Advances, 2016. "
                 "PDF copy shows a 'Withdrawn' watermark on every page. "
                 "Retained in knowledge base for historical/reference context only. "
                 "Verify current status at rbi.org.in before treating as active guidance.",
    },
    # Add more overrides here as needed, e.g.:
    # "doc1.txt": {"status": "ACTIVE", "notes": "Fair Practices Code, verified current."},
}


def get_file_type(filename: str) -> str:
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        return "pdf"
    elif ext == "txt":
        return "txt"
    elif ext == "docx":
        return "docx"
    return "txt"


def seed_rbi_knowledge_base():
    if not os.path.isdir(RBI_DOCS_PATH):
        print(f"ERROR: RBI documents folder not found at {RBI_DOCS_PATH}")
        print(f"Create it and place your RBI PDF/TXT files there first.")
        return

    files = [f for f in os.listdir(RBI_DOCS_PATH) if not f.startswith(".")]
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

        # Determine status: manual override takes priority, then auto-detection
        if filename in MANUAL_STATUS_OVERRIDE:
            status = MANUAL_STATUS_OVERRIDE[filename]["status"]
            notes = MANUAL_STATUS_OVERRIDE[filename]["notes"]
        else:
            status = detect_watermark_status(text)
            notes = f"Status auto-detected as {status} from document content."

        print(f"  Status: {status}")

        # Prepend status flag so it appears in every chunk's context for the LLM
        flagged_text = f"[DOCUMENT STATUS: {status}]\n\n{text}"

        doc_id = str(uuid.uuid4())
        chunks = chunk_text(flagged_text, doc_id, filename)

        for c in chunks:
            c["document_status"] = status

        chunks_with_embeddings = embed_chunks(chunks)
        add_chunks(RBI_KNOWLEDGE_COLLECTION, chunks_with_embeddings)

        print(f"  Seeded {len(chunks)} chunks into '{RBI_KNOWLEDGE_COLLECTION}'")
        total_chunks_seeded += len(chunks)

        # Record in MySQL for tracking
        existing = db.query(RBIKnowledgeDoc).filter(RBIKnowledgeDoc.filename == filename).first()
        if existing:
            existing.status = status
            existing.chunk_count = len(chunks)
            existing.notes = notes
        else:
            db.add(RBIKnowledgeDoc(
                id=doc_id,
                filename=filename,
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
