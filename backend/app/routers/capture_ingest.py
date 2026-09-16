"""Endpoint the browser extension posts captured chapter content to.

Ported from the old standalone capture_server.py (stdlib http.server) - same
merge-pages logic, now a FastAPI route so it shares a process with the rest
of the API.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks

from app.crawler.capture_store import download_page_images, save_captured_page
from app.schemas import CaptureIngestRequest, CaptureIngestResponse

router = APIRouter(prefix="/api", tags=["capture-ingest"])


@router.post("/capture", response_model=CaptureIngestResponse)
def ingest_capture(payload: CaptureIngestRequest, background_tasks: BackgroundTasks) -> CaptureIngestResponse:
    captured_at = payload.captured_at or datetime.now(timezone.utc).isoformat()

    items = [item.model_dump() for item in payload.items]

    merged = save_captured_page(
        novel_id=payload.novel_id,
        chapter_id=payload.chapter_id,
        page=payload.page,
        items=items,
        title=payload.title,
        is_last_page=payload.is_last_page,
        captured_at=captured_at,
        total_pages=payload.total_pages,
    )

    # Runs after this response is sent - never adds latency to the capture
    # itself (Auto-Pilot's page-to-page timing depends on a prompt response).
    background_tasks.add_task(download_page_images, payload.novel_id, payload.chapter_id, payload.page)

    total_items = sum(len(p) for p in merged["pages"].values())
    print(
        f"[capture] novel={payload.novel_id} chapter={payload.chapter_id} page={payload.page} "
        f"items_this_page={len(items)} total_items={total_items} "
        f"complete={merged['is_complete']}"
    )

    return CaptureIngestResponse(
        ok=True,
        pages_captured=len(merged["pages"]),
        is_complete=merged["is_complete"],
    )
