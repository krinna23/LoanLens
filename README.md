# LoanLens

### AI-Powered Loan Agreement Advisor & Financial Decision Assistant

LoanLens is an AI-powered financial assistant designed to help borrowers understand loan agreements before making financial decisions.

It combines **document analysis, Retrieval-Augmented Generation (RAG), RBI regulatory knowledge, risk detection, clause explanation, financial calculations, and conversational AI** to turn complex loan documents into clear and actionable information.



## Overview

Loan agreements often contain complex financial terminology, hidden charges, penalty clauses, prepayment conditions, and other terms that can be difficult for borrowers to understand.

**LoanLens** analyzes a loan agreement and provides:

* Easy-to-understand loan summaries
* Important loan terms
* Risk and penalty detection
* Clause-by-clause explanations
* RBI guideline-based regulatory context
* AI-powered loan document chat
* Financial calculations and analysis
* Loan comparison
* Verification checks

The goal is to help users understand **what they are agreeing to, what they may have to pay, and which clauses deserve attention**.



## Key Features

### 1. Loan Agreement Upload

Users can upload their loan agreement or Key Fact Statement (KFS) for analysis.

The system processes the document and extracts relevant information such as:

* Loan amount
* Interest rate
* Tenure
* EMI
* Processing fees
* Prepayment / foreclosure charges
* Late payment charges
* Other important contractual clauses



### 2. Agreement Overview

LoanLens converts the uploaded agreement into a concise overview containing the most important financial information.

Users can quickly see:

* Loan amount
* Interest rate
* Loan tenure
* EMI
* Loan type
* Disbursement information
* Processing fees
* Important contractual terms



### 3. AI-Powered Risk Detection

LoanLens identifies potentially important or risky clauses in the agreement.

The risk analysis can highlight:

* Prepayment and foreclosure penalties
* Late payment charges
* Additional fees
* Unusual contractual conditions
* Financial obligations
* Potentially unfavorable clauses
* Missing or unclear disclosures

Risks are categorized according to their severity.

**Risk levels:**

* **High**
* **Medium**
* **Low**

The system also considers the regulatory context associated with a clause rather than treating every regulatory document as an active rule.



### 4. RBI Regulatory Knowledge Base

LoanLens uses a collection of **RBI guidelines and regulatory documents** as part of its knowledge base.

These documents are used to provide regulatory context when analyzing loan clauses.

The system is designed to distinguish between regulatory information such as:

* Active guidelines
* Withdrawn guidelines
* Superseded guidelines
* Historical information
* Informational material
* Bank-specific conditions

This helps prevent withdrawn or historical regulatory material from automatically being treated as an active regulatory violation.



### 5. Clause Explanation

LoanLens provides explanations of individual clauses in simpler language.

Instead of requiring users to interpret complex legal or financial terminology, the system explains:

* What the clause means
* What it requires from the borrower
* When the clause applies
* Possible financial implications
* Why the clause may matter
* Relevant regulatory context where applicable



### 6. AI Loan Chat

Users can ask questions about their uploaded loan agreement using natural language.

Examples:

> "What happens if I repay the loan early?"

> "How much is the foreclosure charge?"

> "Are there any penalty clauses?"

> "What are the important risks in this agreement?"

> "Explain the processing fee."

The chatbot uses the uploaded agreement together with relevant RBI knowledge to generate context-aware responses.



### 7. Financial Analysis

LoanLens provides financial tools to help users understand the cost of their loan.

The system can assist with:

* EMI calculations
* Total repayment estimation
* Interest analysis
* Processing fee impact
* Early payoff analysis
* Estimated interest saved through early repayment
* Financial decision support



### 8. Loan Comparison

LoanLens can compare loan agreements and their financial terms.

Users can evaluate differences in areas such as:

* Loan amount
* Interest rate
* Tenure
* EMI
* Processing fees
* Prepayment charges
* Other important terms
* Identified risks

This helps users make more informed decisions when evaluating different loan options.



### 9. Key Verification Checks

LoanLens provides verification checks for important extracted information and agreement terms.

These checks help users review whether important financial details have been identified and presented clearly.



## System Architecture

``
                    ┌──────────────────────┐
                    │       User           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Next.js Frontend    │
                    │  LoanLens Interface  │
                    └──────────┬───────────┘
                               │
                         REST API
                               │
                               ▼
                    ┌──────────────────────┐
                    │   FastAPI Backend    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Document          Risk Analysis      Financial
       Processing         & Classification   Analysis
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   RAG Pipeline       │
                    ├──────────────────────┤
                    │ Loan Agreement       │
                    │ RBI Guidelines       │
                    │ Retrieval            │
                    │ Reranking            │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      LLM Layer       │
                    │    Groq / Llama      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ AI Response / Risk   │
                    │ Analysis / Insights  │
                    └──────────────────────┘



## RAG-Based Analysis

LoanLens uses **Retrieval-Augmented Generation (RAG)** to provide responses grounded in the available loan agreement and regulatory knowledge.

The high-level process is:


Loan Agreement
      │
      ▼
Document Processing
      │
      ▼
Text / Clause Extraction
      │
      ├──────────────► Agreement Knowledge
      │
      ▼
Relevant Context Retrieval
      ▲
      │
RBI Guidelines
      │
      ▼
Reranking
      │
      ▼
Relevant Context
      │
      ▼
LLM
      │
      ▼
Grounded Response


The system combines agreement-specific information with relevant regulatory context before generating an answer.



## Technology Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS

### Backend

* Python
* FastAPI
* Uvicorn

### AI / Machine Learning

* Groq API
* Llama 3.3
* Retrieval-Augmented Generation (RAG)
* Cross-Encoder reranking
* Natural Language Processing

### Document Processing

* PDF processing
* DOCX processing
* Text extraction
* Document chunking
* Clause-level analysis

### Vector Search

* ChromaDB

### Database

* MySQL
* SQLAlchemy
* Alembic

### Regulatory Knowledge

* RBI guideline and regulatory documents



## Project Structure


LoanLens/
│
├── backend/
│   ├── alembic/
│   │   └── versions/
│   │
│   ├── data/
│   │   └── rbi_guidelines/
│   │
│   ├── db/
│   │
│   ├── models/
│   │
│   ├── routers/
│   │   ├── financial.py
│   │   ├── loan_chat.py
│   │   ├── risk_and_comparison.py
│   │   └── upload.py
│   │
│   ├── scripts/
│   │
│   ├── services/
│   │   ├── dual_retrieval.py
│   │   ├── llm.py
│   │   └── risk_classifier.py
│   │
│   ├── storage/
│   │
│   ├── utils/
│   │
│   └── main.py
│
├── frontend/
│   └── src/
│       ├── app/
│       │   └── fonts/
│       │
│       ├── components/
│       │   └── tabs/
│       │
│       └── utils/
│
├── .env.example
├── .gitignore
└── README.md


### Backend Components

**`routers/`**

Contains the API endpoints responsible for different application functions:

* Loan document upload
* Loan chat
* Financial analysis
* Risk analysis
* Loan comparison

**`services/`**

Contains the core application and AI logic:

* `dual_retrieval.py` — retrieves relevant agreement and RBI context
* `llm.py` — handles LLM interaction
* `risk_classifier.py` — analyzes and classifies loan risks

**`data/rbi_guidelines/`**

Contains the regulatory documents used by the RBI knowledge base.

**`db/`**

Contains database configuration and database-related functionality.

**`models/`**

Contains application/database models.

**`alembic/`**

Contains database migration configuration and migration versions.



## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/krinna23/LoanLens.git
cd LoanLens
```



### 2. Backend Setup

Navigate to the backend:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

### 3. Environment Variables

Create a `.env` file inside the backend directory.

Example:

```env
GROQ_API_KEY=your_groq_api_key

DATABASE_URL=your_database_connection_string

SECRET_KEY=your_secret_key
```

**Do not commit the actual `.env` file to GitHub.**

Use `.env.example` as the template for required environment variables.

---

### 4. Database Setup

Create a MySQL database for LoanLens.

Configure the database connection using the environment variables required by the backend.

Run database migrations if required:

```bash
alembic upgrade head
```

---

### 5. Start the Backend

From the `backend` directory:

```bash
uvicorn main:app --reload --port 8000
```

The backend will run at:

```text
http://localhost:8000
```

---

### 6. Frontend Setup

Open another terminal and navigate to the frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:3000
```

---

## How to Use

### Step 1 — Upload

Upload a supported loan agreement or KFS document.

### Step 2 — Document Processing

LoanLens extracts and processes relevant information from the document.

### Step 3 — Agreement Analysis

The system identifies important loan terms and contractual clauses.

### Step 4 — Risk Analysis

Potential risks, penalties, fees, and other important conditions are identified and classified.

### Step 5 — RBI Context

Relevant regulatory information is retrieved from the RBI knowledge base when applicable.

### Step 6 — Ask Questions

Use the AI chat to ask questions about the agreement.

### Step 7 — Financial Analysis

Use the financial tools to understand EMI, repayment costs, and early repayment scenarios.

### Step 8 — Compare

Compare loan agreements to evaluate their terms and potential risks.

---

## Example Analysis

For a loan containing terms such as:

```text
Loan Amount       : ₹12,00,000
Interest Rate     : 10.8% p.a.
Tenure            : 60 months
EMI               : ₹25,971
Processing Fee    : ₹7,670
```

LoanLens can identify and explain additional contractual conditions such as:

```text
Pre-closure Charges:
4% up to 24 EMIs
3% up to 36 EMIs
2% thereafter
```

Instead of simply displaying the clause, LoanLens can explain what the condition means and provide relevant regulatory context where available.

---

## Security Considerations

LoanLens is designed with the following considerations:

* API keys are stored using environment variables.
* `.env` files are excluded from version control.
* Uploaded documents are handled through the backend storage layer.
* Sensitive credentials should never be committed to the repository.
* Regulatory documents are maintained separately from application secrets.

---

## Disclaimer

LoanLens is an **AI-powered informational and decision-support tool**.

It is not a substitute for:

* Professional legal advice
* Financial advice
* Official RBI interpretation
* Advice from a qualified financial professional
* Advice from the lending institution

Regulatory information and AI-generated explanations should be independently verified before making significant financial decisions.

---



## Why LoanLens?

LoanLens focuses on making loan agreements **understandable, transparent, and easier to evaluate**.

Instead of forcing borrowers to interpret lengthy financial documents themselves, the system combines:

**Loan Agreement + AI + RAG + RBI Knowledge + Risk Analysis + Financial Calculations**

to provide a single platform for understanding the financial and contractual implications of a loan.

---


## License

This project is intended for educational, research, and demonstration purposes.
