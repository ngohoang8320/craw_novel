"""Read/write chapter data captured by the browser extension, stored in
data/{novel_id}/{chapter_id}.json (path resolved via app.config.DATA_DIR).
"""
import json
import os
import threading
from urllib.parse import urlparse

from app.config import DATA_DIR
from app.image_fetch import ImageFetchError, ImageNotAllowedError, extension_for, fetch_image

# FastAPI runs each (sync) route handler in a worker thread, so two captures
# landing close together (e.g. a retried send from the extension racing a
# fresh one, or a manual capture overlapping an Auto-Pilot run) could
# otherwise interleave a read-modify-write on the same chapter file: both
# read the old content, both write back, and whichever writes second silently
# discards the other's page. One process-wide lock around every read+write in
# this module serializes those, at negligible cost given how infrequent
# captures are (at most a few per second). Reentrant (RLock) because
# `download_page_images` needs to call `load_captured_chapter` (which also
# takes the lock) from within its own locked section.
_LOCK = threading.RLock()


def _chapter_file(novel_id: str, chapter_id: str) -> str:
    return os.path.join(DATA_DIR, str(novel_id), f"{chapter_id}.json")


def load_captured_chapter(novel_id: str, chapter_id: str) -> dict | None:
    """Return the saved dict for one chapter, or None if it hasn't been captured yet."""
    path = _chapter_file(novel_id, chapter_id)
    with _LOCK:
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


def delete_captured_chapter(novel_id: str, chapter_id: str) -> bool:
    """Delete the captured JSON file for one chapter, if it exists.

    Returns True if a file was removed, False if there was nothing to delete.
    """
    path = _chapter_file(novel_id, chapter_id)
    with _LOCK:
        if os.path.isfile(path):
            os.remove(path)
            return True
        return False


def _normalize_item(item) -> dict:
    """Chapters captured before image support was added store each page as a
    plain list of paragraph strings; newer captures store a list of
    {"type": "text"|"image", ...} dicts. Normalize both to the dict shape so
    callers only ever deal with one format."""
    if isinstance(item, str):
        return {"type": "text", "text": item}
    return item


def missing_pages(captured: dict) -> list[int]:
    """Return the page numbers not yet captured for a chapter, in order.

    If `total_pages` is known, checks the full 1..total_pages range (so
    trailing missing pages show up too). If it isn't known yet, only reports
    gaps *within* the pages already captured (e.g. having 1, 2, 4 reveals a
    gap at 3) - it can't say whether anything comes after the highest page
    seen, since the true total isn't known.
    """
    pages = captured.get("pages", {})
    if not pages:
        return []

    captured_numbers = {int(k) for k in pages.keys()}
    total_pages = captured.get("total_pages")
    upper_bound = total_pages if total_pages is not None else max(captured_numbers)

    return sorted(set(range(1, upper_bound + 1)) - captured_numbers)


def flatten_pages(captured: dict) -> list[dict]:
    """Join a chapter's pages (the 'pages' dict: {"1": [...], "2": [...]}) into a
    single list of content items, in the correct page order."""
    pages = captured.get("pages", {})
    ordered_page_numbers = sorted(pages.keys(), key=lambda k: int(k))
    items: list[dict] = []
    for page_num in ordered_page_numbers:
        items.extend(_normalize_item(item) for item in pages[page_num])
    return items


def save_captured_page(
    novel_id: str,
    chapter_id: str,
    page: int,
    items: list[dict],
    title: str,
    is_last_page: bool,
    captured_at: str,
    total_pages: int | None = None,
) -> dict:
    """Merge one captured page into the chapter's stored JSON file, creating it
    if needed. Returns the merged record (same shape as `load_captured_chapter`).

    `total_pages` is only known once the site's own UI reveals it (typically
    from page 2 onward - page 1 never shows a total). A later page's value is
    authoritative, so it overwrites any earlier (or missing) value; passing
    `None` never erases a previously-learned total.
    """
    novel_dir = os.path.join(DATA_DIR, str(novel_id))
    path = _chapter_file(novel_id, chapter_id)

    with _LOCK:
        os.makedirs(novel_dir, exist_ok=True)

        existing: dict = {}
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)

        pages = existing.get("pages", {})
        pages[str(page)] = items

        merged = {
            "novel_id": novel_id,
            "chapter_id": chapter_id,
            "title": title or existing.get("title", ""),
            "pages": pages,
            "is_complete": bool(is_last_page) or existing.get("is_complete", False),
            "total_pages": total_pages if total_pages is not None else existing.get("total_pages"),
            "captured_at": captured_at,
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)

    return merged


def _image_file(novel_id: str, src: str, content_type: str) -> tuple[str, str]:
    """Where a captured image's bytes should live on disk. Returns
    (absolute_path, path_relative_to_DATA_DIR - the latter is what gets
    stored as the item's `local_path`). Named after the image URL's own
    filename (unique per bilinovel.com/readpai.com image), so re-downloading
    the same URL overwrites the same file instead of piling up duplicates."""
    basename = os.path.basename(urlparse(src).path) or "image"
    root = os.path.splitext(basename)[0]
    filename = f"{root}{extension_for(content_type, src)}"
    relative = os.path.join(str(novel_id), "images", filename)
    return os.path.join(DATA_DIR, relative), relative


def download_page_images(novel_id: str, chapter_id: str, page: int) -> None:
    """Download and locally store the image items of one already-saved page,
    so a later EPUB build can read them straight from disk instead of
    re-fetching from the site - by the time someone builds an EPUB, the
    original image URL may have gone dead (bilinovel.com's own CDN does
    this), but the image was still live moments ago when it was captured.

    Meant to run as a FastAPI `BackgroundTasks` job, scheduled *after* the
    capture-ingest response has already been sent - it must never add
    latency to the capture response itself, since Auto-Pilot's page-to-page
    timing depends on that response landing promptly.

    Best-effort: a failed download just leaves that item's `local_path`
    unset, and the EPUB builder falls back to fetching over the network at
    build time - exactly the behavior before this function existed.
    """
    with _LOCK:
        captured = load_captured_chapter(novel_id, chapter_id)
        if not captured:
            return

        items = captured.get("pages", {}).get(str(page))
        if not items:
            return

        changed = False
        for item in items:
            if item.get("type") != "image" or not item.get("src") or item.get("local_path"):
                continue

            try:
                content, content_type = fetch_image(item["src"])
            except (ImageFetchError, ImageNotAllowedError) as exc:
                print(f"[capture_store] could not pre-download image {item['src']}: {exc}")
                continue

            absolute_path, relative_path = _image_file(novel_id, item["src"], content_type)
            os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
            with open(absolute_path, "wb") as f:
                f.write(content)

            item["local_path"] = relative_path
            changed = True

        if changed:
            path = _chapter_file(novel_id, chapter_id)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(captured, f, ensure_ascii=False, indent=2)
