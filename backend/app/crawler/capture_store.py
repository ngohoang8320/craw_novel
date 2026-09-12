"""Read/write chapter data captured by the browser extension, stored in
data/{novel_id}/{chapter_id}.json (path resolved via app.config.DATA_DIR).
"""
import json
import os

from app.config import DATA_DIR


def _chapter_file(novel_id: str, chapter_id: str) -> str:
    return os.path.join(DATA_DIR, str(novel_id), f"{chapter_id}.json")


def load_captured_chapter(novel_id: str, chapter_id: str) -> dict | None:
    """Return the saved dict for one chapter, or None if it hasn't been captured yet."""
    path = _chapter_file(novel_id, chapter_id)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def delete_captured_chapter(novel_id: str, chapter_id: str) -> bool:
    """Delete the captured JSON file for one chapter, if it exists.

    Returns True if a file was removed, False if there was nothing to delete.
    """
    path = _chapter_file(novel_id, chapter_id)
    if os.path.isfile(path):
        os.remove(path)
        return True
    return False


def flatten_pages(captured: dict) -> list[str]:
    """Join a chapter's pages (the 'pages' dict: {"1": [...], "2": [...]}) into a
    single list of paragraphs in the correct page order."""
    pages = captured.get("pages", {})
    ordered_page_numbers = sorted(pages.keys(), key=lambda k: int(k))
    paragraphs: list[str] = []
    for page_num in ordered_page_numbers:
        paragraphs.extend(pages[page_num])
    return paragraphs


def save_captured_page(
    novel_id: str,
    chapter_id: str,
    page: int,
    paragraphs: list[str],
    title: str,
    is_last_page: bool,
    captured_at: str,
) -> dict:
    """Merge one captured page into the chapter's stored JSON file, creating it
    if needed. Returns the merged record (same shape as `load_captured_chapter`).
    """
    novel_dir = os.path.join(DATA_DIR, str(novel_id))
    os.makedirs(novel_dir, exist_ok=True)
    path = _chapter_file(novel_id, chapter_id)

    existing: dict = {}
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            existing = json.load(f)

    pages = existing.get("pages", {})
    pages[str(page)] = paragraphs

    merged = {
        "novel_id": novel_id,
        "chapter_id": chapter_id,
        "title": title or existing.get("title", ""),
        "pages": pages,
        "is_complete": bool(is_last_page) or existing.get("is_complete", False),
        "captured_at": captured_at,
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    return merged
