from services.embedder import embed_query
from services.vector_store import dual_retrieve
from services.reranker import rerank_chunks, normalize_scores


def retrieve_agreement_and_rbi_context(session_id: str, agreement_label: str, query: str, top_k: int = 5):
    """
    Full dual-retrieval pipeline for one query:
    1. Embed the query
    2. Search both the user's agreement collection and the RBI knowledge base
    3. Rerank each set independently
    4. Return both, clearly separated (labels are for internal prompt use only,
       never shown to the end user)
    """
    query_embedding = embed_query(query)

    raw = dual_retrieve(session_id, agreement_label, query_embedding, n_results=20)

    agreement_top = rerank_chunks(query, raw["agreement_chunks"], top_k=top_k) if raw["agreement_chunks"] else []
    rbi_top = rerank_chunks(query, raw["rbi_chunks"], top_k=top_k) if raw["rbi_chunks"] else []

    agreement_top = normalize_scores(agreement_top) if agreement_top else []
    rbi_top = normalize_scores(rbi_top) if rbi_top else []

    return {
        "agreement_chunks": agreement_top,
        "rbi_chunks": rbi_top,
    }


def build_dual_context_prompt(query: str, agreement_chunks: list, rbi_chunks: list, financial_profile: dict = None) -> str:
    """
    Builds the final prompt sent to the LLM. Internal labels [USER AGREEMENT] /
    [RBI GUIDELINE] are for the model's understanding only — the system prompt
    instructs it never to repeat these labels verbatim in the visible answer.
    """
    agreement_context = "\n\n---\n\n".join(
        f"[USER AGREEMENT — {c['metadata'].get('filename', 'agreement')}]\n{c['text']}"
        for c in agreement_chunks
    ) or "No relevant clause found in the uploaded agreement."

    rbi_context = "\n\n---\n\n".join(
        f"[RBI GUIDELINE — {c['metadata'].get('filename', 'guideline')} — status: {c['metadata'].get('document_status', 'ACTIVE')}]\n{c['text']}"
        for c in rbi_chunks
    ) or "No directly relevant RBI guideline found for this query."

    profile_context = ""
    if financial_profile:
        income = financial_profile.get("monthly_income")
        loan_amount = financial_profile.get("loan_amount_needed")
        tenure = financial_profile.get("preferred_tenure_months")
        profile_context = f"""

USER FINANCIAL PROFILE (use this to personalize your answer where relevant):
- Monthly income: {income}
- Loan amount needed: {loan_amount}
- Preferred tenure: {tenure} months
"""

    return f"""{agreement_context}

===

{rbi_context}
{profile_context}

---

User question: {query}

Instructions:
- Compare the user's agreement clause(s) against the RBI guideline(s) explicitly
- If an RBI guideline is marked as WITHDRAWN or SUPERSEDED, clearly tell the user this specific regulation is no longer current and should be treated as historical/reference context only, not active law
- Explain in simple, plain language — avoid legal jargon
- If the financial profile is provided, personalize the answer (e.g. EMI as % of income)
- Never present yourself as giving definitive legal or financial advice — always suggest consulting a qualified advisor for final decisions
- Cite sources naturally (e.g. "according to your loan agreement" or "per RBI's penal charges guideline") — never repeat internal labels like [USER AGREEMENT] or [RBI GUIDELINE] in your visible answer

Answer:"""
