from sentence_transformers import SentenceTransformer
import os
from typing import List

_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _model = SentenceTransformer(model_name)
    return _model


def embed_chunks(chunks: List[dict]) -> List[dict]:
    model = get_model()
    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=False, convert_to_numpy=True)
    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding.tolist()
    return chunks


def embed_query(query: str) -> List[float]:
    model = get_model()
    embedding = model.encode([query], show_progress_bar=False, convert_to_numpy=True)
    return embedding[0].tolist()
