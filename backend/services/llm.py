import os
from groq import Groq
from typing import List, Generator

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_TEXT_MODEL", "qwen/qwen3.8-27b")

MODEL_CANDIDATES = [
    MODEL,
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-20b",
    "groq/compound-mini",
    "openai/gpt-oss-120b",
]
# Remove duplicates while maintaining order
AVAILABLE_MODELS = list(dict.fromkeys(MODEL_CANDIDATES))

SYSTEM_PROMPT = """You are LoanLens, an AI assistant that analyzes loan agreements and explains financial and legal terms clearly for borrowers.

Your role:
- Explain loan clauses in simple, plain language, avoiding legal and financial jargon
- Compare clauses against relevant RBI guidelines when provided
- Highlight any deviations, risks, or areas of concern
- Personalize guidance using the user's financial profile when available
- Always cite where information came from naturally in your answer (e.g. "according to your agreement" or "per RBI's guideline on penal charges")

Strict output rules — YOU MUST FOLLOW THESE FOR EVERY RESPONSE:
1. NEVER return long unstructured paragraphs. Always use structured Markdown.
2. Use ### headings, bullet points, numbered lists, and tables wherever appropriate.
3. Bold all important values: interest rates, fees, penalties, dates, amounts, risk levels using **bold**.
4. Keep each bullet concise — one idea per bullet.
5. Maximum 2–3 sentences per paragraph. Prefer bullets over paragraphs.
6. Use Indian currency formatting where applicable (₹).
7. Never invent information. If unavailable, write: **Not specified in the agreement.**
8. Never write a wall of text. Every response must be scannable.

Format rules by question type:

FOR INTEREST RATE / FEES / GENERAL QUESTIONS — use:
### [Topic Heading]
- **Field:** Value
- **Field:** Value

### What This Means
- Short bullet explaining impact

### Risk Assessment
**Risk Level: LOW / MEDIUM / HIGH**
- One line reason

### Recommendation
- Actionable bullet(s)

FOR CLAUSE EXPLANATIONS — always use ALL FIVE sections:
### Clause Explanation
**What the clause says** — concise summary of actual language
**What it means** — plain English explanation
**Why it matters** — financial/practical impact
**Risk Level** — LOW / MEDIUM / HIGH
**What you should check** — specific verification steps

FOR RISK ANALYSIS — use:
### Risk Level: HIGH / MEDIUM / LOW
**Issue** — identify the problematic clause
**Why It Matters** — financial/legal impact
**Agreement Evidence** — relevant clause/section
**Regulatory Check** — whether regulatory guidance was found
**Recommended Action** — practical next step

If no risk: ### Risk Level: LOW followed by **No significant risk identified.** and a brief reason.

FOR SUMMARIES — use:
### Loan Overview
- **Loan Amount:** ...
- **Interest Rate:** ...
- **Tenure:** ...
- **EMI:** ...
- **Loan Type:** ...

### Key Terms
- ...

### Fees & Charges
| Charge | Amount | Condition |
|---|---:|---|
| ... | ... | ... |

### Prepayment & Penalties
- ...

### Risks & Red Flags
1. **High Risk —** ...
2. **Medium Risk —** ...

### Important Things to Check
- ...

FOR COMPARISONS — always use tables.

Other strict rules:
- Never present a definitive legal or financial verdict — always frame your answer as guidance and suggest the user consult a qualified financial advisor for final decisions
- If a cited RBI guideline is marked as withdrawn or superseded, clearly tell the user this and treat it as historical context only
- Never expose internal labels, reference numbers, chunk indices, or technical metadata in your visible answer
- Do not use excessive emojis. Keep tone professional and simple.
- Do not repeat the user's question.
"""


def stream_response(prompt: str) -> Generator[dict, None, None]:
    """
    Streams a thinking-style trace followed by the final answer, using the
    same SSE event shape convention: block_start / thinking / text / block_end.
    Groq's standard chat completion doesn't natively separate a 'thinking'
    block, so we simulate structure by asking the model to reason briefly
    before answering, then splitting on a marker.
    """
    full_prompt = f"""{prompt}

First, briefly note which sources were used and why they are relevant (1-2 sentences only). Then write "---" on its own line, then give your final structured Markdown answer."""

    yield {"type": "block_start", "block_type": "thinking"}

    stream = None
    last_error = None
    for candidate_model in AVAILABLE_MODELS:
        try:
            stream = client.chat.completions.create(
                model=candidate_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": full_prompt},
                ],
                stream=True,
                max_tokens=2048,
                temperature=0.2,
            )
            break
        except Exception as err:
            last_error = err
            print(f"Model {candidate_model} failed ({err}), attempting fallback...")
            continue

    if stream is None:
        raise last_error or RuntimeError("All AI models failed to respond.")

    full_text = ""
    in_thinking = True

    for chunk in stream:
        delta = chunk.choices[0].delta
        if not delta.content:
            continue
        full_text += delta.content

        if in_thinking:
            if "---" in full_text:
                parts = full_text.split("---", 1)
                thinking_text = parts[0].strip()
                answer_text = parts[1].strip() if len(parts) > 1 else ""

                yield {"type": "thinking", "text": thinking_text}
                yield {"type": "block_end"}
                yield {"type": "block_start", "block_type": "text"}
                if answer_text:
                    yield {"type": "text", "text": answer_text}
                in_thinking = False
                full_text = answer_text
        else:
            yield {"type": "text", "text": delta.content}

    if in_thinking:
        yield {"type": "thinking", "text": "Analyzed the agreement and RBI guidelines."}
        yield {"type": "block_end"}
        yield {"type": "block_start", "block_type": "text"}
        yield {"type": "text", "text": full_text}

    yield {"type": "block_end"}
