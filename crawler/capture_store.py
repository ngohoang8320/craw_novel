"""Đọc dữ liệu chapter đã được browser extension capture, lưu bởi capture_server.py
vào thư mục data/{novel_id}/{chapter_id}.json.
"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def load_captured_chapter(novel_id: str, chapter_id: str) -> dict | None:
    """Trả về dict đã lưu cho 1 chapter, hoặc None nếu chưa capture."""
    path = os.path.join(DATA_DIR, str(novel_id), f"{chapter_id}.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def flatten_pages(captured: dict) -> list[str]:
    """Nối các trang con của 1 chapter (dict 'pages': {"1": [...], "2": [...]})
    thành 1 danh sách đoạn văn theo đúng thứ tự trang."""
    pages = captured.get("pages", {})
    ordered_page_numbers = sorted(pages.keys(), key=lambda k: int(k))
    paragraphs: list[str] = []
    for page_num in ordered_page_numbers:
        paragraphs.extend(pages[page_num])
    return paragraphs
