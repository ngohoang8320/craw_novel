# Bilinovel Crawler API (backend)

FastAPI backend wrapping the crawler business logic previously embedded in the
Streamlit app. Stateless REST API — all "session" state (selected chapters,
imported results) lives in the frontend.

## Setup

```
pip install -r requirements.txt
copy .env.example .env
```

## Run

```
uvicorn app.main:app --reload --port 8000
```

Interactive docs (Swagger UI) at `http://localhost:8000/docs`.

## Endpoints

### `GET /api/health`

```json
{"status": "ok"}
```

### `GET /api/novels/{novel_id}/toc`

Fetch the chapter list for a novel from bilinovel.com.

Response `200`:
```json
{
  "chapters": [
    {
      "chapter_id": "281543",
      "title": "...",
      "url": "https://www.bilinovel.com/novel/4699/281543.html",
      "order": 1,
      "locked": false
    }
  ]
}
```

- `400` — `novel_id` is empty.
- `502` — the table of contents page could not be fetched (network/timeout/bad status).
- `422` — the page loaded but its structure didn't match what the parser expects.

### `GET /api/novels/{novel_id}/captures?chapter_ids=281543,281553`

Bulk lookup of captured content for a set of chapters (comma-separated ids).

Response `200`:
```json
{
  "chapters": [
    {
      "chapter_id": "281543",
      "captured": true,
      "title": "...",
      "is_complete": true,
      "page_count": 1,
      "paragraph_count": 17,
      "char_count": 240,
      "paragraphs": ["...", "..."]
    },
    {"chapter_id": "999999", "captured": false}
  ]
}
```

### `DELETE /api/novels/{novel_id}/captures/{chapter_id}`

Deletes the captured JSON file for one chapter.

Response `200`:
```json
{"deleted": true}
```

### `POST /api/capture`

Called by the browser extension after it reads a chapter page. Merges the page
into the chapter's stored record (multi-page chapters accumulate across calls).

Request body:
```json
{
  "novel_id": "4699",
  "chapter_id": "281555",
  "title": "...",
  "page": 1,
  "is_last_page": false,
  "paragraphs": ["...", "..."],
  "captured_at": "2026-09-12T10:00:00.000Z"
}
```

Response `200`:
```json
{"ok": true, "pages_captured": 2, "is_complete": false}
```

`422` if a required field (`novel_id`, `chapter_id`, `paragraphs`) is missing or
the wrong type (standard FastAPI/Pydantic validation error response).
