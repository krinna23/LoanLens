import os
import json
import re
from typing import List, Dict, Optional
from services.llm import client, MODEL, AVAILABLE_MODELS

RISK_SYSTEM_PROMPT = """You are a financial compliance assistant that compares loan agreement clauses against RBI guidelines.

You will be provided with:
1. A specific LOAN AGREEMENT CLAUSE.
2. A matched RBI GUIDELINE and its regulatory status (e.g. ACTIVE, WITHDRAWN, SUPERSEDED, HISTORICAL, INFORMATIONAL, BANK_SPECIFIC).

Your task is to determine whether the LOAN AGREEMENT CLAUSE contains a real regulatory deviation or borrower risk under the matched RBI guideline.

STRICT GROUNDING & RELEVANCE RULES:
1. GROUNDED IN CLAUSE: You must NEVER find a deviation unless the LOAN AGREEMENT CLAUSE explicitly contains the problematic term, fee, condition, or omission.
2. NO TRANSFER: If the RBI guideline mentions a restriction, but the provided LOAN AGREEMENT CLAUSE does NOT actually contain, offer, or refer to that practice, you MUST return risk_level: "LOW" and deviation_description: "No deviation found".
3. EXACT QUOTE: If you find a genuine deviation, you MUST extract the exact, verbatim sentence or phrase from the LOAN AGREEMENT CLAUSE as "evidence_quote".
4. SEVERITY RULES:
   - HIGH: The clause explicitly violates an active mandatory RBI prohibition, rate cap, or explicit restriction (e.g. compounding penal interest, prohibited foreclosure charges on floating-rate individual loans).
   - MEDIUM: Missing mandatory statutory disclosures, ambiguous rate resets, or aggressive charges/terms.
   - LOW: Compliant clause, or no applicable deviation.
5. WITHDRAWN / SUPERSEDED / HISTORICAL RULES:
   - If the matched guideline is marked WITHDRAWN, SUPERSEDED, or HISTORICAL, it MUST NOT automatically be presented as an active RBI violation.
   - Never say "Violates RBI rule" when the guideline is withdrawn.
   - If the loan clause contains a separate contractual risk (e.g., unilateral power to alter fees or interest), you may assign MEDIUM or LOW risk, but your explanation MUST explicitly note: "This RBI guidance has been withdrawn and is not treated as a current regulatory requirement."
   - If there is no independent issue, assign risk_level: "LOW" and deviation_description: "No deviation found".
6. Output ONLY a valid JSON object with EXACTLY these keys:
{
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "deviation_description": "one clear sentence describing the specific deviation found in the clause, or 'No deviation found' if compliant",
  "reason": "brief explanation of why this risk level was assigned",
  "evidence_quote": "exact verbatim excerpt from the clause supporting this deviation, or null if No deviation found"
}
"""



def normalize_risk_text(text: str) -> str:
    """Normalizes risk text for semantic duplicate comparison."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'in',
        'on', 'and', 'or', 'by', 'per', 'as', 'at', 'this', 'that', 'which',
        'with', 'from', 'clause', 'agreement', 'rbi', 'guideline', 'requirement',
        'violating', 'violates', 'contrary', 'provides', 'provided'
    }
    words = [w for w in text.split() if w not in stop_words and len(w) > 2]
    return ' '.join(words)


def are_similar_risks(desc1: str, desc2: str) -> bool:
    """
    Determines if two risk descriptions represent the same underlying issue.
    E.g. "Provides a 10% discount to senior citizens, violating..." and
    "Senior citizen discount creates discriminatory fee treatment" -> True
    """
    if not desc1 or not desc2:
        return False
    if desc1.strip().lower() == desc2.strip().lower():
        return True

    n1 = set(normalize_risk_text(desc1).split())
    n2 = set(normalize_risk_text(desc2).split())
    if not n1 or not n2:
        return False

    inter = n1.intersection(n2)
    if not inter:
        return False

    jaccard = len(inter) / len(n1.union(n2))
    overlap1 = len(inter) / len(n1)
    overlap2 = len(inter) / len(n2)

    return jaccard >= 0.35 or overlap1 >= 0.60 or overlap2 >= 0.60


def extract_focused_evidence(clause_text: str, evidence_quote: Optional[str] = None) -> str:
    """
    Extracts the focused clause excerpt surrounding the actual evidence quote.
    Prevents displaying an entire 1000-character chunk whose beginning is unrelated.
    Guarantees the returned string comes directly from clause_text.
    """
    if not clause_text:
        return ""
    clause_clean = clause_text.strip()
    if not evidence_quote or len(evidence_quote.strip()) < 8:
        # Return first 300 characters of the clause
        lines = [line.strip() for line in clause_clean.split("\n") if line.strip()]
        return lines[0][:300] if lines else clause_clean[:300]

    quote_clean = evidence_quote.strip()
    idx = clause_clean.lower().find(quote_clean.lower())
    if idx != -1:
        # Find sentence or line boundaries around the quote
        start = max(0, clause_clean.rfind('\n', 0, idx) + 1)
        end = clause_clean.find('\n', idx + len(quote_clean))
        if end == -1:
            end = len(clause_clean)
        snippet = clause_clean[start:end].strip()
        if len(snippet) >= len(quote_clean):
            return snippet[:600]
        return quote_clean[:600]

    # If exact substring not found, find the line in clause_text with best word match
    quote_words = set(re.findall(r'\b\w{4,}\b', quote_clean.lower()))
    best_line = ""
    best_score = 0
    for line in clause_clean.split('\n'):
        line_str = line.strip()
        if not line_str:
            continue
        line_words = set(re.findall(r'\b\w{4,}\b', line_str.lower()))
        score = len(quote_words.intersection(line_words))
        if score > best_score:
            best_score = score
            best_line = line_str

    if best_line and best_score >= 2:
        return best_line[:600]

    return quote_clean[:600] if quote_clean.lower() in clause_clean.lower() else clause_clean[:300]


def classify_clause_risk(clause_text: str, rbi_guideline_text: str, rbi_document_status: str = "ACTIVE") -> Dict:
    norm_status = (rbi_document_status or "ACTIVE").upper().strip()
    prompt = f"""LOAN AGREEMENT CLAUSE:
{clause_text}

MATCHED RBI GUIDELINE (status: {norm_status}):
{rbi_guideline_text}

Compare these and return the JSON risk assessment."""

    last_err = None
    for candidate_model in AVAILABLE_MODELS:
        try:
            response = client.chat.completions.create(
                model=candidate_model,
                messages=[
                    {"role": "system", "content": RISK_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content.strip()
            if "{" in raw and "}" in raw:
                raw = raw[raw.find("{"):raw.rfind("}") + 1]
            parsed = json.loads(raw)

            risk_level = parsed.get("risk_level", "LOW")
            dev_desc = parsed.get("deviation_description", "No deviation found")
            reason = parsed.get("reason", "")
            evidence_quote = parsed.get("evidence_quote") or ""

            # Strict grounding validation:
            # If deviation reported, verify that the clause actually contains the words
            if risk_level != "LOW" and dev_desc and dev_desc != "No deviation found":
                clause_lower = clause_text.lower()
                if evidence_quote:
                    eq_clean = re.sub(r'[^\w\s]', '', evidence_quote.lower()).strip()
                    c_clean = re.sub(r'[^\w\s]', '', clause_lower).strip()
                    eq_words = [w for w in eq_clean.split() if len(w) > 3]
                    if eq_words:
                        matched_words = [w for w in eq_words if w in c_clean]
                        if len(matched_words) / len(eq_words) < 0.35:
                            # Quote is not grounded in the provided clause!
                            risk_level = "LOW"
                            dev_desc = "No deviation found"
                            reason = "Candidate guideline was not applicable to the specific terms in this clause."
                            evidence_quote = ""
                else:
                    key_dev_words = [
                        w for w in re.findall(r'\b[a-zA-Z]{4,}\b', dev_desc.lower())
                        if w not in {'clause', 'violates', 'violating', 'guideline', 'requirement', 'agreement', 'provides', 'deviation', 'found', 'rbi'}
                    ]
                    if key_dev_words:
                        found_count = sum(1 for w in key_dev_words if w in clause_lower)
                        if found_count == 0:
                            risk_level = "LOW"
                            dev_desc = "No deviation found"
                            reason = "Clause text does not contain the practice addressed in the guideline."

            # Withdrawn / Superseded / Historical enforcement
            if norm_status in ("WITHDRAWN", "SUPERSEDED", "HISTORICAL"):
                if risk_level == "HIGH":
                    # Never present a withdrawn guideline as an active HIGH violation
                    risk_level = "MEDIUM"
                withdrawn_disclaimer = "This RBI guidance has been withdrawn and is not treated as a current regulatory requirement."
                if risk_level != "LOW" and dev_desc and dev_desc != "No deviation found":
                    if withdrawn_disclaimer.lower() not in (reason or "").lower():
                        reason = f"{reason.strip()} ({withdrawn_disclaimer})" if reason else withdrawn_disclaimer
                    # Clean any "violates active RBI rule" wording
                    dev_desc = re.sub(r'(?i)\bviolat(es|ing)\s+(current\s+|active\s+)?rbi\s+rule\b', 'deviates from historical/withdrawn RBI guidance', dev_desc)
                    dev_desc = re.sub(r'(?i)\bbreach(es|ing)\s+(current\s+|active\s+)?rbi\s+rule\b', 'deviates from historical/withdrawn RBI guidance', dev_desc)

            return {
                "risk_level": risk_level,
                "deviation_description": dev_desc,
                "reason": reason,
                "evidence_quote": evidence_quote,
            }
        except Exception as e:
            last_err = e
            print(f"[RiskClassifier] Model {candidate_model} failed ({e}), trying next...")
            continue

    # All models failed — return a safe fallback
    return {
        "risk_level": "LOW",
        "deviation_description": "Could not automatically assess this clause.",
        "reason": f"Risk classification error: {str(last_err)}",
        "evidence_quote": "",
    }

