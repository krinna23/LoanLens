from sentence_transformers.cross_encoder import CrossEncoder
import os
from typing import List

_reranker = None


def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        model_name = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        _reranker = CrossEncoder(model_name)
    return _reranker


def rerank_chunks(query: str, chunks: List[dict], top_k: int = 5) -> List[dict]:
    if not chunks:
        return chunks

    reranker = get_reranker()
    pairs = [[query, chunk["text"]] for chunk in chunks]
    scores = reranker.predict(pairs)

    for chunk, score in zip(chunks, scores):
        chunk["rerank_score"] = float(score)

    reranked = sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)
    return reranked[:top_k]


def normalize_scores(chunks: List[dict]) -> List[dict]:
    if not chunks:
        return chunks
    scores = [c["rerank_score"] for c in chunks]
    min_s, max_s = min(scores), max(scores)
    diff = max_s - min_s
    for chunk in chunks:
        chunk["rerank_score"] = 1.0 if diff == 0 else round((chunk["rerank_score"] - min_s) / diff, 3)
    return chunks
