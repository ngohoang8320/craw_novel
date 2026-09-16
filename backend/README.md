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
python -m uvicorn app.main:app --reload --port 8000
```

`uvicorn` is the ASGI server that loads and serves the FastAPI app — unlike the
old Streamlit script, there is no `python app.py` entry point. Invoking it as
`python -m uvicorn` avoids depending on Python's Scripts directory being on PATH
(plain `uvicorn app.main:app ...` works too once it is).

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
`items` holds text and image entries in reading order — `paragraph_count`/
`char_count` only count `"text"` items, `image_count` only counts `"image"`
items.

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
      "image_count": 2,
      "char_count": 240,
      "items": [
        {"type": "text", "text": "..."},
        {"type": "image", "src": "https://img3.readpai.com/..."},
        {"type": "text", "text": "..."}
      ]
    },
    {"chapter_id": "999999", "captured": false}
  ]
}
```

Chapters captured before image support was added are stored as plain lists of
paragraph strings; the API transparently normalizes those into `{"type": "text", ...}`
items, so old captures keep working without needing to be re-captured.

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
  "items": [
    {"type": "text", "text": "..."},
    {"type": "image", "src": "https://img3.readpai.com/..."}
  ],
  "captured_at": "2026-09-12T10:00:00.000Z"
}
```

Response `200`:
```json
{"ok": true, "pages_captured": 2, "is_complete": false}
```

`422` if a required field (`novel_id`, `chapter_id`, `items`) is missing or
the wrong type (standard FastAPI/Pydantic validation error response).

### `GET /api/image-proxy?url=https://img3.readpai.com/...`

Relays a chapter image with the `Referer` header its hotlink protection
expects (see `app/image_fetch.py`) — loading the URL directly from the
frontend's own origin gets a 403 from the image host. Returns the raw image
bytes with the upstream `Content-Type`.

- `400` — the URL's host isn't on the allowlist (`bilinovel.com`/`readpai.com`
  and subdomains only, to avoid this becoming an open proxy).
- `502` — the image host returned a non-200 status, or the request failed.

### `POST /api/novels/{novel_id}/epub`

Builds an EPUB from a set of chapters (normally the ones currently shown in
the frontend's "Crawl results" panel) and returns it as a file download.
Stateless — the full chapter content is sent in the request body, nothing is
read from disk here. Images are downloaded server-side (via the same Referer
trick as `/api/image-proxy`) and embedded in the EPUB so it works fully
offline; if any image fails to download, the whole build fails with a clear
error rather than silently producing an EPUB with missing pictures.

Request body:
```json
{
  "novel_title": "...",
  "novel_author": "...",
  "chapters": [
    {
      "title": "Chapter 1",
      "order": 1,
      "items": [
        {"type": "text", "text": "..."},
        {"type": "image", "src": "https://img3.readpai.com/..."}
      ]
    }
  ]
}
```

Response `200`: the `.epub` file, `Content-Type: application/epub+zip`, with
`Content-Disposition: attachment` so the browser saves it.

- `400` — `chapters` is empty.
- `502` — an embedded image could not be downloaded.
