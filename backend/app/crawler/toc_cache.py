"""Persistent memory of table-of-contents links that had to be *recovered*,
stored in data/{novel_id}/toc_cache.json (path resolved via app.config.DATA_DIR).

Some chapters have a fake "javascript:cid(...)" href in the catalog page, and
recovering their real link costs extra requests to chapter content pages (see
`app.crawler.toc._resolve_missing_chapters`) - requests that can fail at
random (timeouts, the site's anti-bot). Without any memory, every re-fetch of
the same novel redid all of that from scratch, so a chapter recovered last
time could fail this time while another one succeeded: the set of missing
chapters kept shifting and never converged. Remembering what was already
recovered lets each fetch retry only the chapters that are still missing, so
repeated fetches only ever add links, never lose them.

An entry is keyed by the chapter's `order` and only applied when its title
still matches, so a changed table of contents can't attach a link to the wrong
chapter.
"""
import json
import os
import threading

from app.config import DATA_DIR

_LOCK = threading.RLock()


def _cache_file(novel_id: str) -> str:
    return os.path.join(DATA_DIR, str(novel_id), "toc_cache.json")


def load_recovered(novel_id: str) -> dict[int, dict]:
    """Return {order: {"title", "chapter_id", "url", "manual"}} for every
    recovered chapter remembered for this novel (empty if none). A missing or
    unreadable cache file just means "nothing remembered" - it must never
    break fetching the table of contents."""
    path = _cache_file(novel_id)
    with _LOCK:
        if not os.path.isfile(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f).get("recovered", {})
            return {int(order): entry for order, entry in raw.items()}
        except (OSError, ValueError, AttributeError):
            return {}


def _save(novel_id: str, entries: dict[int, dict]) -> None:
    path = _cache_file(novel_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"recovered": {str(order): e for order, e in entries.items()}}, f, ensure_ascii=False, indent=2)


def remember(novel_id: str, new_entries: dict[int, dict]) -> None:
    """Merge `new_entries` into the novel's remembered links (overwriting any
    existing entry for the same order)."""
    if not new_entries:
        return
    with _LOCK:
        entries = load_recovered(novel_id)
        entries.update(new_entries)
        _save(novel_id, entries)


def forget(novel_id: str, chapter_id: str) -> bool:
    """Drop the remembered link for the chapter with this (recovered)
    chapter_id, so the next fetch re-recovers it from scratch. Returns True if
    an entry was removed."""
    with _LOCK:
        entries = load_recovered(novel_id)
        kept = {order: e for order, e in entries.items() if e.get("chapter_id") != str(chapter_id)}
        if len(kept) == len(entries):
            return False
        _save(novel_id, kept)
        return True
