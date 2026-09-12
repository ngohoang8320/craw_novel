"""Read chapter data captured by the browser extension, saved by capture_server.py
into data/{novel_id}/{chapter_id}.json.
"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def load_captured_chapter(novel_id: str, chapter_id: str) -> dict | None:
    """Return the saved dict for one chapter, or None if it hasn't been captured yet."""
    path = os.path.join(DATA_DIR, str(novel_id), f"{chapter_id}.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def delete_captured_chapter(novel_id: str, chapter_id: str) -> bool:
    """Delete the captured JSON file for one chapter, if it exists.

    Returns True if a file was removed, False if there was nothing to delete.
    """
    path = os.path.join(DATA_DIR, str(novel_id), f"{chapter_id}.json")
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
