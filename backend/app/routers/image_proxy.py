"""Proxies chapter images so the browser sends the Referer the image CDN expects.

See app.image_fetch for why this is needed - this router just adapts
`fetch_image` to an HTTP endpoint the frontend's <img> tags can point at.
"""
from fastapi import APIRouter, HTTPException, Query, Response

from app.image_fetch import ImageFetchError, ImageNotAllowedError, fetch_image

router = APIRouter(prefix="/api", tags=["image-proxy"])


@router.get("/image-proxy")
def proxy_image(url: str = Query(..., description="Original image URL to relay")) -> Response:
    try:
        content, content_type = fetch_image(url)
    except ImageNotAllowedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImageFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(content=content, media_type=content_type)
