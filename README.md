# Bilinovel Crawler (internal)

Internal, local-only tool that crawls novels from bilinovel.com to prepare an EPUB build.

## Setup

```
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` if needed (can be left blank, has defaults):

```
BASE_URL=https://www.bilinovel.com
DEFAULT_NOVEL_ID=4699
```

## Run

```
streamlit run app.py
```

Open the URL Streamlit prints (default http://localhost:8501).

## Current status

- Enter a `novel_id`, click "Fetch table of contents" to get the chapter list from
  `https://www.bilinovel.com/novel/{novel_id}/catalog`.
- Select/deselect chapters with checkboxes, with "Select all" / "Deselect all" buttons.
- Use the **browser extension** (see below) to capture content while reading in
  your real browser, then click "Import captured content" in the app.
- **No EPUB build feature yet** (to be added later).

## Why an extension instead of crawling directly

The content pages on bilinovel.com run behind Cloudflare and have an automated-
request detection mechanism: when a request looks suspicious, the page returns
content that is **truncated and/or has its paragraphs shuffled**, along with an
embedded error message — even when crawling with a real browser under a tool's
control (verified with Playwright/Chromium). Because of this, the tool no longer
crawls automatically; instead, a browser extension reads back the content already
rendered in the real browser you're using to read — there's nothing for the site
to detect as a bot.

### Using the browser extension to capture content

**Install the extension (Chrome/Edge):**
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**, and select the `extension/` folder in this project.

**Run the capture server (in a separate terminal, alongside `streamlit run app.py`):**
```
python capture_server.py
```
The server runs at `http://127.0.0.1:8765`; captured data is saved to `data/`.

**How to use it:**
1. Run `streamlit run app.py`, fetch the table of contents, select chapters as usual.
2. Open the "🔗 Links for the selected chapters" panel in the app, and click each
   link to open it in your browser (with the extension installed) — each time a
   chapter page loads, the extension reads the content and sends it to the
   server (the extension icon shows a green "OK" badge on success, or a red
   "ERR" badge on failure — make sure the capture server is running first).
3. For chapters split across multiple pages, open each page in turn (click
   "next page" on the site) — the extension captures each page, and the server
   merges them in the correct order automatically.
4. Back in the Streamlit app, click "Import captured content" to load the data
   into the tool.

**Notes:**
- The extension **never opens any page itself** — it only reads back a page you
  opened yourself.
- `data/` holds captured novel content and is already in `.gitignore` (not committed).

## Technical notes

- `crawler/toc.py` uses `requests` + `BeautifulSoup` (no JS rendering needed) to
  fetch the table of contents. Some chapters have no href in the table of
  contents (they look VIP-locked but aren't) — the module resolves the real link
  via `ReadParams.url_previous` embedded in the neighboring chapter's content page.
- All chapters of a novel (every volume) live on a single `/catalog` page, no
  pagination — verified with novel_id=4699 (213 chapters).
- `extension/page_bridge.js` runs in the "main world" (it can read the page's
  `window.ReadParams`, which a regular isolated-world content script can't see),
  and dispatches a DOM event that `extension/content.js` (isolated world, has
  access to `chrome.runtime`) forwards to `background.js`, which sends it to
  `capture_server.py`.
- There's a random 0.5-1s delay between requests to the table of contents page,
  and a reasonable timeout, to reduce the risk of getting IP-blocked.
- Requires Python 3.9+ (uses `str.removesuffix`).
