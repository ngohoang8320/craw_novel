from fastapi import APIRouter, HTTPException

from app.config import BASE_URL
from app.crawler import toc_cache
from app.crawler.toc import (
    TocFetchError,
    TocParseError,
    chapter_id_from_manual_link,
    get_table_of_contents,
)
from app.schemas import ForgetRecoveredResponse, ManualLinkRequest, ManualLinkResponse, TocResponse

router = APIRouter(prefix="/api/novels", tags=["toc"])


@router.get("/{novel_id}/toc", response_model=TocResponse)
def fetch_toc(novel_id: str) -> TocResponse:
    try:
        result = get_table_of_contents(novel_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TocFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except TocParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return TocResponse(
        chapters=result["chapters"],
        volumes=result["volumes"],
        novel_author=result["novel_author"],
        novel_title=result["novel_title"],
    )


@router.put("/{novel_id}/toc-cache/{order}", response_model=ManualLinkResponse)
def set_manual_link(novel_id: str, order: int, payload: ManualLinkRequest) -> ManualLinkResponse:
    """Supply the link for a chapter that couldn't be resolved automatically.
    It's remembered (see `toc_cache`), so later fetches keep using it."""
    try:
        chapter_id = chapter_id_from_manual_link(novel_id, payload.link)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    url = f"{BASE_URL}/novel/{novel_id}/{chapter_id}.html"
    toc_cache.remember(
        novel_id,
        {order: {"title": payload.title, "chapter_id": chapter_id, "url": url, "manual": True}},
    )
    return ManualLinkResponse(chapter_id=chapter_id, url=url)


@router.delete("/{novel_id}/toc-cache/{chapter_id}", response_model=ForgetRecoveredResponse)
def forget_recovered_link(novel_id: str, chapter_id: str) -> ForgetRecoveredResponse:
    """Drop a remembered (recovered or manual) link, e.g. because it turned
    out to be wrong - the chapter goes back to unresolved on the next fetch."""
    return ForgetRecoveredResponse(deleted=toc_cache.forget(novel_id, chapter_id))
