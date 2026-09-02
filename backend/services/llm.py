import os
from groq import Groq
from typing import List, Generator

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")

SYSTEM_PROMPT = """You are LoanLens, an AI assistant that helps users understand their loan agreements by comparing them against RBI (Reserve Bank of India) guidelines.

Your role:
- Explain loan clauses in simple, plain language, avoiding legal and financial jargon
- Compare clauses against relevant RBI guidelines when provided
- Highlight any deviations, risks, or areas of concern
- Personalize guidance using the user's financial profile when available
- Always cite where information came from naturally in your answer (e.g. "according to your agreement" or "per RBI's guideline on penal charges")

Strict rules:
- Never present a definitive legal or financial verdict — always frame your answer as guidance and suggest the user consult a qualified financial advisor or legal professional for final decisions
- If a cited RBI guideline is marked as withdrawn or superseded, you must explicitly tell the user this and treat it as historical context only
- Never expose internal labels, reference numbers, chunk indices, or technical metadata in your visible answer
- If you cannot find relevant information in the provided context, say so clearly rather than guessing
- Keep answers well-structured: lead with a direct answer, then supporting detail, using markdown only where it genuinely helps readability
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

First, briefly reason step by step about which sources are relevant (2-3 sentences). Then write "---" on its own line, then give your final answer."""

    yield {"type": "block_start", "block_type": "thinking"}

    stream = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": full_prompt},
        ],
        stream=True,
        max_tokens=2048,
        temperature=0.2,
    )

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
