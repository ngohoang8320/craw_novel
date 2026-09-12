"""Pydantic request/response models for the API."""
from pydantic import BaseModel


class Chapter(BaseModel):
    chapter_id: str
    title: str
    url: str | None
    order: int
    locked: bool


class TocResponse(BaseModel):
    chapters: list[Chapter]


class CapturedChapter(BaseModel):
    chapter_id: str
    captured: bool
    title: str | None = None
    is_complete: bool | None = None
    page_count: int | None = None
    paragraph_count: int | None = None
    char_count: int | None = None
    paragraphs: list[str] | None = None


class CapturesResponse(BaseModel):
    chapters: list[CapturedChapter]


class DeleteCaptureResponse(BaseModel):
    deleted: bool


class CaptureIngestRequest(BaseModel):
    novel_id: str
    chapter_id: str
    title: str = ""
    page: int = 1
    is_last_page: bool = False
    paragraphs: list[str]
    captured_at: str | None = None


class CaptureIngestResponse(BaseModel):
    ok: bool
    pages_captured: int
    is_complete: bool


class HealthResponse(BaseModel):
    status: str
