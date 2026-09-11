import os
import json
from typing import Dict, List
from services.llm import client, MODEL, AVAILABLE_MODELS

COMPARISON_FIELDS = [
    "loan_amount",
    "interest_rate",
    "interest_type",
    "tenure",
    "emi",
    "processing_fee",
    "insurance",
    "prepayment_penalty",
    "late_payment_fee",
    "total_cost_of_loan",
    "collateral",
    "major_risks",
]

EXTRACTION_SYSTEM_PROMPT = """You are a financial document analyst. Extract specific loan terms from the provided agreement text.

Return ONLY a JSON object with these exact keys:
{
  "loan_amount": "value found, e.g. '₹5,00,000' or 'Not specified'",
  "interest_rate": "value found, e.g. '10.5% p.a.' or 'Not specified'",
  "interest_type": "Fixed / Floating / Not specified",
  "tenure": "value found, e.g. '60 months' or 'Not specified'",
  "emi": "value found or 'Not specified'",
  "processing_fee": "value found or 'Not specified'",
  "insurance": "value found or 'Not specified'",
  "prepayment_penalty": "value found or 'Not specified'",
  "late_payment_fee": "value found or 'Not specified'",
  "total_cost_of_loan": "value found or 'Not specified'",
  "collateral": "value found or 'Not specified'",
  "major_risks": "1-2 sentence summary of biggest risks, or 'Not identified'"
}

Only extract what is explicitly stated in the text. Never estimate or infer a number that is not present.
Output ONLY the JSON object, no other text.
"""


def extract_loan_fields(agreement_text_sample: str) -> Dict[str, str]:
    """
    agreement_text_sample should be the concatenated top-N most relevant
    chunks (e.g. from a broad retrieval of the agreement), not the full document,
    to stay within a reasonable prompt size.
    """
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": agreement_text_sample},
            ],
            temperature=0.1,
            max_tokens=2048,
        )
        raw = response.choices[0].message.content or ""
        raw = raw.strip().replace("```json", "").replace("```", "").strip()
        if "{" in raw and "}" in raw:
            raw = raw[raw.find("{"):raw.rfind("}")+1]
        parsed = json.loads(raw)
        return {field: parsed.get(field, "Not specified") for field in COMPARISON_FIELDS}
    except Exception as e:
        print(f"Error in extract_loan_fields: {e}")
        return {field: "Could not extract" for field in COMPARISON_FIELDS}


def build_comparison_rows(fields_a: Dict[str, str], fields_b: Dict[str, str]) -> List[dict]:
    return [
        {
            "field_name": field,
            "agreement_a_value": fields_a.get(field, "Not specified"),
            "agreement_b_value": fields_b.get(field, "Not specified"),
        }
        for field in COMPARISON_FIELDS
    ]


def generate_comparison_recommendation(comparison_rows: List[dict]) -> str:
    """One final LLM call to produce a plain-language recommendation from the structured table."""
    table_text = "\n".join(
        f"{row['field_name']}: Agreement A = {row['agreement_a_value']}, Agreement B = {row['agreement_b_value']}"
        for row in comparison_rows
    )

    prompt = f"""Here is a comparison of two loan agreements:

{table_text}

Generate a structured Markdown analysis using EXACTLY this format:

### Key Differences
- **Interest Rate:** (state which is higher/lower and by how much, or "Both not specified")
- **Processing Fee:** (state difference or "Both not specified")
- **Prepayment Penalty:** (state difference or "Both not specified")
- **Tenure:** (state difference or "Both not specified")
- **Total Cost of Loan:** (state difference or "Both not specified")

### Better Option

**Document [A or B]** — or **Cannot determine** if values are missing.

Reason:
- (bullet: why this document is better based on the values shown)
- (bullet: any caveats or conditions)

### Recommendation
- (1–2 practical next steps for the borrower)
- Always consult a qualified financial advisor before making a final decision.

Base your analysis ONLY on the values shown above. Do not invent or estimate any number. If a field says "Not specified", state that clearly."""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=2048,
        )
        content = (response.choices[0].message.content or "").strip()
        if content:
            return content
        return "Unable to generate a comparison summary at this time. Please review the table above manually."
    except Exception as e:
        print(f"Error in generate_comparison_recommendation: {e}")
        return "Unable to generate a comparison summary at this time. Please review the table above manually."

