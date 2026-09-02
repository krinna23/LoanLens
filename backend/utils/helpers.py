import os
import uuid

ALLOWED_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}


def generate_id() -> str:
    return str(uuid.uuid4())


def get_file_extension(content_type: str):
    return ALLOWED_EXTENSIONS.get(content_type)


def is_allowed_file(content_type: str) -> bool:
    return content_type in ALLOWED_EXTENSIONS


def build_storage_path(base_path: str, doc_id: str, extension: str) -> str:
    os.makedirs(base_path, exist_ok=True)
    return os.path.join(base_path, f"{doc_id}.{extension}")
