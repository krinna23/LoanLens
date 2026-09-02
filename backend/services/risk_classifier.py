import os
import json
from groq import Groq
from typing import List, Dict

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")

RISK_SYSTEM_PROMPT = """You are a financial compliance assistant that compares loan agreement clauses against RBI guidelines.

For each clause you are given, along with the matched RBI guideline text, you must return a single JSON object with EXACTLY these fields:
{
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "deviation_description": "one sentence describing any deviation from the RBI rule, or 'No deviation found' if compliant",
  "reason": "brief explanation of why this risk level was assigned"
}

Rules:
- HIGH risk: the clause clearly exceeds or violates a specific numeric limit or explicit prohibition in the RBI guideline
- MEDIUM risk: the clause is ambiguous, lacks required disclosure, or is close to a regulatory limit
- LOW risk: the clause is compliant or no relevant RBI guideline conflict is found
- If the matched RBI guideline is marked as WITHDRAWN or SUPERSEDED, you must mention this in the reason field and treat the comparison as informational only, not as active regulatory backing
- Never fabricate a specific RBI rule number or percentage that is not present in the provided guideline text
- Output ONLY the JSON object, no other text
"""


def classify_clause_risk(clause_text: str, rbi_guideline_text: str, rbi_document_status: str = "ACTIVE") -> Dict:
    prompt = f"""LOAN AGREEMENT CLAUSE:
{clause_text}

MATCHED RBI GUIDELINE (status: {rbi_document_status}):
{rbi_guideline_text}

Compare these and return the JSON risk assessment."""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": RISK_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=500,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if the model added them
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)

        return {
            "risk_level": parsed.get("risk_level", "LOW"),
            "deviation_description": parsed.get("deviation_description", ""),
            "reason": parsed.get("reason", ""),
        }
    except Exception as e:
        # Fail safe — never crash the pipeline, return a LOW-confidence flag instead
        return {
            "risk_level": "LOW",
            "deviation_description": "Could not automatically assess this clause.",
            "reason": f"Risk classification error: {str(e)}",
        }
