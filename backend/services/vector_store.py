import chromadb
import os
from typing import List

_client = None

RBI_KNOWLEDGE_COLLECTION = "rbi_knowledge_base"  # permanent, shared, never session-scoped


def get_chroma_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=os.getenv("CHROMA_PATH", "./chroma_db"))
    return _client


def _sanitize(name: str) -> str:
    return "".join(c if c.isalnum() or c == "_" else "_" for c in name)


def get_collection(collection_name: str):
    client = get_chroma_client()
    safe_name = _sanitize(collection_name)
    return client.get_or_create_collection(
        name=safe_name,
        metadata={"hnsw:space": "cosine"},
    )


def get_agreement_collection_name(session_id: str, agreement_label: str = "A") -> str:
    """Per-user, per-agreement collection — isolated from all other users."""
    return f"user_{session_id}_agreement_{agreement_label}"


def add_chunks(collection_name: str, chunks: List[dict]):
    collection = get_collection(collection_name)
    collection.add(
        ids=[f"{c['doc_id']}_chunk_{c['chunk_index']}" for c in chunks],
        embeddings=[c["embedding"] for c in chunks],
        documents=[c["text"] for c in chunks],
        metadatas=[
            {
                "doc_id": c["doc_id"],
                "filename": c["filename"],
                "chunk_index": c["chunk_index"],
                "document_status": c.get("document_status", "ACTIVE"),
            }
            for c in chunks
        ],
    )


def query_collection(collection_name: str, query_embedding: List[float], n_results: int = 20):
    """Returns [] gracefully if the collection is empty or doesn't exist yet."""
    try:
        collection = get_collection(collection_name)
        if collection.count() == 0:
            return []
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, collection.count()),
            include=["documents", "metadatas", "distances"],
        )
        chunks = []
        for doc, meta, dist in zip(
            results["documents"][0], results["metadatas"][0], results["distances"][0]
        ):
            chunks.append({"text": doc, "metadata": meta, "score": 1 - dist})
        return chunks
    except Exception:
        return []


def dual_retrieve(session_id: str, agreement_label: str, query_embedding: List[float], n_results: int = 20):
    """
    Core of the dual-collection design: searches the user's private
    agreement collection AND the permanent shared RBI knowledge base
    in the same call, returning both sets separately (not merged),
    so the caller can label them distinctly for the LLM prompt.
    """
    agreement_collection = get_agreement_collection_name(session_id, agreement_label)

    agreement_chunks = query_collection(agreement_collection, query_embedding, n_results)
    rbi_chunks = query_collection(RBI_KNOWLEDGE_COLLECTION, query_embedding, n_results)

    return {
        "agreement_chunks": agreement_chunks,
        "rbi_chunks": rbi_chunks,
    }


def delete_doc_chunks(collection_name: str, doc_id: str):
    collection = get_collection(collection_name)
    collection.delete(where={"doc_id": doc_id})
