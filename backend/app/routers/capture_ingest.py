"""Endpoint the browser extension posts captured chapter content to.

Ported from the old standalone capture_server.py (stdlib http.server) - same
merge-pages logic, now a FastAPI route so it shares a process with the rest
of the API.
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from app.crawler.capture_store import save_captured_page
from app.schemas import CaptureIngestRequest, CaptureIngestResponse

router = APIRouter(prefix="/api", tags=["capture-ingest"])


@router.post("/capture", response_model=CaptureIngestResponse)
def ingest_capture(payload: CaptureIngestRequest) -> CaptureIngestResponse:
    captured_at = payload.captured_at or datetime.now(timezone.utc).isoformat()

    merged = save_captured_page(
        novel_id=payload.novel_id,
        chapter_id=payload.chapter_id,
        page=payload.page,
        paragraphs=payload.paragraphs,
        title=payload.title,
        is_last_page=payload.is_last_page,
        captured_at=captured_at,
    )

    total_paragraphs = sum(len(p) for p in merged["pages"].values())
    print(
        f"[capture] novel={payload.novel_id} chapter={payload.chapter_id} page={payload.page} "
        f"paragraphs_this_page={len(payload.paragraphs)} total_paragraphs={total_paragraphs} "
        f"complete={merged['is_complete']}"
    )

    return CaptureIngestResponse(
        ok=True,
        pages_captured=len(merged["pages"]),
        is_complete=merged["is_complete"],
    )
