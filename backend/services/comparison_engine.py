import os
import json
from groq import Groq
from typing import Dict, List

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")

COMPARISON_FIELDS = [
    "interest_rate",
    "processing_fee",
    "prepayment_penalty",
    "tenure",
    "total_cost_of_loan",
]

EXTRACTION_SYSTEM_PROMPT = """You are a financial document analyst. Extract specific loan terms from the provided agreement text.

Return ONLY a JSON object with these exact keys:
{
  "interest_rate": "value found, e.g. '10.5% p.a.' or 'Not specified'",
  "processing_fee": "value found or 'Not specified'",
  "prepayment_penalty": "value found or 'Not specified'",
  "tenure": "value found, e.g. '60 months' or 'Not specified'",
  "total_cost_of_loan": "value found or 'Not specified'"
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
            max_tokens=500,
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        return {field: parsed.get(field, "Not specified") for field in COMPARISON_FIELDS}
    except Exception:
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

In 3-4 sentences, explain in plain language which loan appears more favorable overall and why, based only on the values shown above. Do not give definitive financial advice — end by suggesting the user consult a financial advisor for a final decision."""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return "Unable to generate a comparison summary at this time. Please review the table above manually."
