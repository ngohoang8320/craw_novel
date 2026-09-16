"""Pydantic request/response models for the API."""
from typing import Literal

from pydantic import BaseModel


class Chapter(BaseModel):
    chapter_id: str
    title: str
    url: str | None
    order: int
    locked: bool


class VolumeLabel(BaseModel):
    """A volume/group header from the table of contents, display-only - it
    carries no id or action, just a title and where to insert it."""

    title: str
    before_order: int
    cover_url: str | None = None


class TocResponse(BaseModel):
    chapters: list[Chapter]
    volumes: list[VolumeLabel] = []
    novel_author: str | None = None


class ContentItem(BaseModel):
    """One piece of chapter content, in reading order. `text` is set for
    type "text", `src` (an image URL) is set for type "image". `local_path`
    (image items only) is set once the image has been downloaded to local
    disk at capture time (path relative to DATA_DIR) - lets the EPUB builder
    read it straight from disk instead of re-fetching a URL that may have
    gone dead by build time."""

    type: Literal["text", "image"]
    text: str | None = None
    src: str | None = None
    local_path: str | None = None


class CapturedChapter(BaseModel):
    chapter_id: str
    captured: bool
    title: str | None = None
    is_complete: bool | None = None
    page_count: int | None = None
    total_pages: int | None = None
    missing_pages: list[int] = []
    paragraph_count: int | None = None
    image_count: int | None = None
    char_count: int | None = None
    items: list[ContentItem] | None = None


class CapturesResponse(BaseModel):
    chapters: list[CapturedChapter]


class DeleteCaptureResponse(BaseModel):
    deleted: bool


class CaptureIngestRequest(BaseModel):
    novel_id: str
    chapter_id: str
    title: str = ""
    page: int = 1
    total_pages: int | None = None
    is_last_page: bool = False
    items: list[ContentItem]
    captured_at: str | None = None


class CaptureIngestResponse(BaseModel):
    ok: bool
    pages_captured: int
    is_complete: bool


class EpubChapterInput(BaseModel):
    title: str
    order: int
    items: list[ContentItem]


class EpubBuildRequest(BaseModel):
    novel_title: str
    novel_author: str = ""
    cover_url: str | None = None
    chapters: list[EpubChapterInput]


class HealthResponse(BaseModel):
    status: str
