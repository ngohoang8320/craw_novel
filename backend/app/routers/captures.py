from fastapi import APIRouter, Query

from app.crawler.capture_store import (
    delete_captured_chapter,
    flatten_pages,
    load_captured_chapter,
)
from app.schemas import CapturedChapter, CapturesResponse, DeleteCaptureResponse

router = APIRouter(prefix="/api/novels", tags=["captures"])


@router.get("/{novel_id}/captures", response_model=CapturesResponse)
def get_captures(novel_id: str, chapter_ids: str = Query(..., description="Comma-separated chapter ids")) -> CapturesResponse:
    ids = [c.strip() for c in chapter_ids.split(",") if c.strip()]
    results: list[CapturedChapter] = []

    for chapter_id in ids:
        captured = load_captured_chapter(novel_id, chapter_id)
        if not captured:
            results.append(CapturedChapter(chapter_id=chapter_id, captured=False))
            continue

        paragraphs = flatten_pages(captured)
        results.append(
            CapturedChapter(
                chapter_id=chapter_id,
                captured=True,
                title=captured.get("title", ""),
                is_complete=captured.get("is_complete", False),
                page_count=len(captured.get("pages", {})),
                paragraph_count=len(paragraphs),
                char_count=sum(len(p) for p in paragraphs),
                paragraphs=paragraphs,
            )
        )

    return CapturesResponse(chapters=results)


@router.delete("/{novel_id}/captures/{chapter_id}", response_model=DeleteCaptureResponse)
def delete_capture(novel_id: str, chapter_id: str) -> DeleteCaptureResponse:
    deleted = delete_captured_chapter(novel_id, chapter_id)
    return DeleteCaptureResponse(deleted=deleted)
