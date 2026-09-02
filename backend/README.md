# LoanLens Backend

AI-powered RAG system that helps users understand loan agreements by comparing
them against RBI (Reserve Bank of India) guidelines, in plain language, with
personalized risk assessment.

Built as a fresh project reusing proven patterns: FastAPI, ChromaDB, local
embeddings, Groq LLM, and SSE streaming.

---

## What's already in this project

Your uploaded RBI PDF (`MD20D6FC6F31E8E5458F9E0411F433B7D40A.pdf` — the
"Interest Rate on Advances" Master Direction) is already placed in
`data/rbi_guidelines/` and pre-configured in the seed script's manual status
override table as **WITHDRAWN**, since the copy you provided shows a visible
"Withdrawn" watermark on every page.

**Add your other 2 RBI documents** (the `.txt` versions) into the same folder:

```
data/rbi_guidelines/
    MD20D6FC6F31E8E5458F9E0411F433B7D40A.pdf   ← already here (marked WITHDRAWN)
    doc1.txt                                    ← add your first .txt file
    doc2.txt                                    ← add your second .txt file
```

If your `.txt` files are for genuinely active RBI circulars (e.g. the 2023
Penal Charges circular, or the Fair Practices Code), the seed script will
auto-detect them as ACTIVE unless you also add an override entry for them in
`scripts/seed_rbi_knowledge.py` under `MANUAL_STATUS_OVERRIDE`.

---

## Setup Steps

### 1. Install dependencies

Use the project’s pinned dependency set to avoid known compatibility issues between PyTorch, Transformers, and the Groq SDK.

```bash
cd backend
py -3.10 -m pip install --upgrade pip
py -3.10 -m pip install -r requirements.txt
```

If you already have a newer incompatible `transformers`, `torch`, or `httpx` installed, reinstall from the pinned file above to force the compatible versions.

### 2. Set up MySQL

Create a database:
```sql
CREATE DATABASE loanlens;
```

Update `.env` with your real credentials:
```env
DATABASE_URL=mysql+pymysql://your_user:your_password@localhost:3306/loanlens
GROQ_API_KEY=your_actual_groq_key
```

### 3. Run database migrations

```bash
alembic upgrade head
```

This creates all 5 tables: `documents`, `user_financial_profile`,
`clause_risk_flags`, `loan_comparison`, `rbi_knowledge_docs`.

### 4. Seed the RBI knowledge base (one-time, run whenever documents change)

```bash
python scripts/seed_rbi_knowledge.py
```

This reads every file in `data/rbi_guidelines/`, parses it, chunks it,
embeds it locally, and stores it permanently in the `rbi_knowledge_base`
ChromaDB collection — separate from any user's uploaded agreement.

You'll see output like:
```
Processing: MD20D6FC6F31E8E5458F9E0411F433B7D40A.pdf (pdf)
  Status: WITHDRAWN
  Seeded 42 chunks into 'rbi_knowledge_base'

Processing: doc1.txt (txt)
  Status: ACTIVE
  Seeded 18 chunks into 'rbi_knowledge_base'
```

### 5. Start the server

```bash
uvicorn main:app --reload
```

Visit `http://localhost:8000/docs` to test every endpoint interactively.

---

## How the withdrawn-document handling works

Every chunk from a withdrawn document is tagged with
`[DOCUMENT STATUS: WITHDRAWN]` at ingestion time. This tag travels through
retrieval into the LLM prompt. The system prompt explicitly instructs the
model:

> "If a cited RBI guideline is marked as withdrawn or superseded, you must
> explicitly tell the user this and treat it as historical context only."

So even though the withdrawn document stays in the knowledge base (useful
for general definitions like MCLR, Base Rate, benchmark concepts), the
chatbot will never present it as current law — it will flag the deprecation
directly to the user in its answer.

**Before going further, verify the true current status** of this Master
Direction at:
`https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10295`

RBI announced a major consolidation of ~9,000 circulars into 238 new Master
Directions in October 2025. This specific document may have been folded into
a newer consolidated direction. Update `MANUAL_STATUS_OVERRIDE` in the seed
script once you confirm the current status.

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/upload` | Upload a loan agreement (Agreement A or B) |
| GET | `/api/documents/{session_id}` | List uploaded documents for a session |
| POST | `/api/profile` | Submit/update financial profile (income, loan amount, tenure) |
| GET | `/api/profile/{session_id}` | Get stored financial profile |
| POST | `/api/loan_chat` | Main chat — dual retrieval + SSE streaming + risk flagging |
| GET | `/api/risk_summary/{session_id}` | Get all flagged risky clauses for a session |
| POST | `/api/comparison/{session_id}/generate` | Extract & compare fields from Agreement A vs B |
| GET | `/api/comparison/{session_id}` | Retrieve stored comparison rows |
| GET | `/health` | Health check |

---

## Architecture Summary

```
User uploads loan agreement (Agreement A, optionally B)
        ↓
Parsed (pdfplumber/docx/txt) → chunked → embedded locally
        ↓
Stored in ChromaDB: user_{session_id}_agreement_A (isolated per user)

Separately, RBI documents pre-loaded once via seed script
        ↓
Stored in ChromaDB: rbi_knowledge_base (permanent, shared, never deleted)

User asks a question
        ↓
Query embedded → searched in BOTH collections simultaneously
        ↓
Both sets reranked independently → combined into one prompt
        ↓
LLM compares agreement clause vs RBI rule, personalizes using profile data
        ↓
Answer streamed via SSE (thinking + answer blocks)
        ↓
Background: best-matched clause pair classified for risk (LOW/MEDIUM/HIGH)
        ↓
Risk flag stored in MySQL, shown in Risk Summary panel
```

---

## Safety Notes

- The system never gives a definitive legal or financial verdict — every
  response is framed as guidance with a suggestion to consult a qualified
  advisor for final decisions.
- Withdrawn/superseded RBI documents are clearly flagged, never silently
  cited as active law.
- No Python `enum.Enum` or SQLAlchemy `Enum` columns are used anywhere in
  this project — all status/type fields are plain String columns.

---

## Next Steps (Not Yet Included)

- Frontend (Next.js) — not included in this backend-only package
- User authentication — currently uses `session_id` only, no login system
- Docker containerization for deployment
