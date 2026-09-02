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
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks
