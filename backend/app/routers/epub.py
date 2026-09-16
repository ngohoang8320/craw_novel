"""Builds a downloadable EPUB from a set of already-captured/imported chapters.

The frontend already holds this content in memory (from the "Crawl results"
panel, populated by GET .../captures) so it's sent directly in the request
body - this endpoint is stateless, it doesn't read anything from disk itself.
"""
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response

from app.epub_builder import EpubBuildError, build_epub
from app.schemas import EpubBuildRequest

router = APIRouter(prefix="/api/novels", tags=["epub"])


@router.post("/{novel_id}/epub")
def build_epub_endpoint(novel_id: str, payload: EpubBuildRequest) -> Response:
    if not payload.chapters:
        raise HTTPException(status_code=400, detail="No chapters provided.")

    try:
        epub_bytes = build_epub(
            novel_id=novel_id,
            novel_title=payload.novel_title,
            novel_author=payload.novel_author,
            chapters=payload.chapters,
            cover_url=payload.cover_url,
        )
    except EpubBuildError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    display_name = payload.novel_title.strip() or novel_id
    ascii_fallback = "".join(c for c in display_name if c.isascii() and (c.isalnum() or c in " _-")).strip()
    ascii_fallback = ascii_fallback or novel_id

    headers = {
        "Content-Disposition": (
            f'attachment; filename="{ascii_fallback}.epub"; '
            f"filename*=UTF-8''{quote(display_name)}.epub"
        )
    }
    return Response(content=epub_bytes, media_type="application/epub+zip", headers=headers)
