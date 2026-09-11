import os
import uuid

ALLOWED_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "docx",
    "text/plain": "txt",
}


def generate_id() -> str:
    return str(uuid.uuid4())


def get_file_extension(content_type: str, filename: str = "") -> str:
    if content_type in ALLOWED_EXTENSIONS:
        return ALLOWED_EXTENSIONS[content_type]
    if filename:
        ext = filename.split(".")[-1].lower()
        if ext in ("pdf", "docx", "txt"):
            return ext
    return None


def is_allowed_file(content_type: str, filename: str = "") -> bool:
    return get_file_extension(content_type, filename) is not None


def build_storage_path(base_path: str, doc_id: str, extension: str) -> str:
    os.makedirs(base_path, exist_ok=True)
    return os.path.join(base_path, f"{doc_id}.{extension}")
