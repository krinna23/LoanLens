import pdfplumber
from docx import Document as DocxDocument
from pathlib import Path


def parse_file(file_path: str, file_type: str) -> str:
    path = Path(file_path)

    if file_type == "pdf":
        return _parse_pdf(path)
    elif file_type == "docx":
        return _parse_docx(path)
    elif file_type == "txt":
        return _parse_txt(path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def _parse_pdf(path: Path) -> str:
    """
    Uses pdfplumber instead of PyPDF2 — better at extracting tables,
    which loan agreements (EMI schedules, fee tables) commonly contain.
    """
    text_parts = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ""
            text_parts.append(f"[Page {i + 1}]\n{page_text}")

            # Extract tables separately and append as readable text
            tables = page.extract_tables()
            for t_idx, table in enumerate(tables):
                table_text = "\n".join(
                    " | ".join(cell or "" for cell in row) for row in table
                )
                text_parts.append(f"[Page {i + 1} - Table {t_idx + 1}]\n{table_text}")

    return "\n\n".join(text_parts)


def _parse_docx(path: Path) -> str:
    doc = DocxDocument(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _parse_txt(path: Path) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def detect_watermark_status(text: str) -> str:
    """
    Best-effort detection of a 'Withdrawn' watermark or notice in RBI PDFs.
    pdfplumber extracts diagonal watermark text inline with body text,
    so we scan for the literal word near the top of the document.
    """
    lowered = text[:2000].lower()
    if "withdrawn" in lowered:
        return "WITHDRAWN"
    if "superseded" in lowered:
        return "SUPERSEDED"
    return "ACTIVE"
