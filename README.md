# Bilinovel Crawler (internal)

Internal, local-only tool that crawls novels from bilinovel.com to prepare an
EPUB build. Two parts, run as separate processes:

- **`backend/`** — FastAPI REST API wrapping the crawler logic. See `backend/README.md`
  for the full endpoint list and request/response samples.
- **`frontend/`** — React + Vite + TypeScript + Tailwind UI that calls the backend.

## Run

Terminal 1 (backend, port 8000):
```
cd backend
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

(`uvicorn` is the ASGI server that runs the FastAPI app — FastAPI has no
built-in `python app.py` entry point. Running it as `python -m uvicorn` works
regardless of whether Python's Scripts directory is on PATH.)

Terminal 2 (frontend, port 5173):
```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Current status

- Enter a `novel_id`, click "Fetch table of contents" to get the chapter list.
- Select/deselect chapters with checkboxes, with "Select all" / "Deselect all" buttons.
- Use the **browser extension** (see below) to capture content while reading in
  your real browser, then click "Import captured content" in the app.
- **No EPUB build feature yet** (to be added later).

## Why a browser extension instead of crawling directly

The content pages on bilinovel.com run behind Cloudflare and have an automated-
request detection mechanism: when a request looks suspicious, the page returns
content that is **truncated and/or has its paragraphs shuffled**, along with an
embedded error message — even when crawling with a real browser under a tool's
control (verified with Playwright/Chromium). Because of this, the tool doesn't
crawl chapter content automatically; instead, a browser extension reads back
the content already rendered in the real browser you're using to read — there's
nothing for the site to detect as a bot.

### Using the browser extension to capture content

**Install the extension (Chrome/Edge):**
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**, and select the `extension/` folder in this project.

The extension posts captured content straight to the backend at
`http://localhost:8000/api/capture` — no separate capture server needed, so
just make sure the backend (above) is running.

**How to use it:**
1. Run the backend and frontend (above), fetch the table of contents, select
   chapters as usual.
2. Open the "🔗 Links for the selected chapters" panel in the app, and click each
   link to open it in your browser (with the extension installed) — each time a
   chapter page loads, the extension reads the content and sends it to the
   backend (the extension icon shows a green "OK" badge on success, or a red
   "ERR" badge on failure).
3. For chapters split across multiple pages, open each page in turn (click
   "next page" on the site) — the extension captures each page, and the backend
   merges them in the correct order automatically.
4. Back in the app, click "Import captured content" to load the data into the tool.

**Notes:**
- The extension **never opens any page itself** — it only reads back a page you
  opened yourself.
- `backend/data/` holds captured novel content and is in `.gitignore` (not committed).

## Technical notes

- `backend/app/crawler/toc.py` uses `requests` + `BeautifulSoup` (no JS rendering
  needed) to fetch the table of contents. Some chapters have no href in the
  table of contents (they look VIP-locked but aren't) — the module resolves the
  real link via `ReadParams.url_previous` embedded in the neighboring chapter's
  content page.
- All chapters of a novel (every volume) live on a single `/catalog` page, no
  pagination — verified with novel_id=4699 (213 chapters).
- `extension/page_bridge.js` runs in the "main world" (it can read the page's
  `window.ReadParams`, which a regular isolated-world content script can't see),
  and dispatches a DOM event that `extension/content.js` (isolated world, has
  access to `chrome.runtime`) forwards to `background.js`, which POSTs to the
  backend's `/api/capture` endpoint.
- There's a random 0.5-1s delay between requests to the table of contents page,
  and a reasonable timeout, to reduce the risk of getting IP-blocked.
- Requires Python 3.9+ (uses `str.removesuffix`) and Node.js 18+.
