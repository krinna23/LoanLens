from typing import List
import re


def chunk_text(text: str, doc_id: str, filename: str, chunk_size: int = 1024, overlap: int = 200) -> List[dict]:
    """
    Simple recursive-style splitter: tries paragraph breaks first,
    falls back to sentence breaks, then hard character split.
    No external dependency required (kept self-contained for this project).
    """
    chunks = _split_text(text, chunk_size, overlap)
    return [
        {
            "text": chunk,
            "doc_id": doc_id,
            "filename": filename,
            "chunk_index": i,
        }
        for i, chunk in enumerate(chunks)
        if chunk.strip()
    ]


def _split_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    if len(text) <= chunk_size:
        return [text]

    # First try splitting on paragraph breaks
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) <= chunk_size:
            current += ("\n\n" if current else "") + para
        else:
            if current:
                chunks.append(current)
            if len(para) > chunk_size:
                # paragraph itself too long — hard split with overlap
                chunks.extend(_hard_split(para, chunk_size, overlap))
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks


def _hard_split(text: str, chunk_size: int, overlap: int) -> List[str]:
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        if end < text_len:
            # Snap to nearest space or newline before end to avoid cutting words
            candidate = text.rfind(" ", start + chunk_size // 2, end)
            if candidate != -1:
                end = candidate
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_len:
            break

        # Calculate next start with overlap, snapping to a word boundary
        next_start = max(start + 1, end - overlap)
        candidate_start = text.find(" ", next_start, end)
        if candidate_start != -1 and candidate_start + 1 < end:
            next_start = candidate_start + 1
        start = next_start
    return chunks
