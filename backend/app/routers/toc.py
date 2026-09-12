from fastapi import APIRouter, HTTPException

from app.crawler.toc import TocFetchError, TocParseError, get_table_of_contents
from app.schemas import TocResponse

router = APIRouter(prefix="/api/novels", tags=["toc"])


@router.get("/{novel_id}/toc", response_model=TocResponse)
def fetch_toc(novel_id: str) -> TocResponse:
    try:
        chapters = get_table_of_contents(novel_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TocFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except TocParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return TocResponse(chapters=chapters)
