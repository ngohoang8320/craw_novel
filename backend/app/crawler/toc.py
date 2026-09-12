"""Fetch the table of contents (chapter list) for a novel on bilinovel.com.

Table of contents page structure, verified against the real site (novel_id=4699):
- URL: {BASE_URL}/novel/{novel_id}/catalog
- All chapters (every volume) live on a single page, no pagination.
- Container: <div id="volumes" class="chapter-ol chapter-ol-catalog">
- Each chapter: <li class="chapter-li jsChapter">
                  <a href="/novel/{novel_id}/{chapter_id}.html" class="chapter-li-a">
                    <span class="chapter-index">Chapter title</span>
                  </a>
                </li>
- Each volume's header uses <li class="chapter-bar chapter-li"> (link to vol_xxxx.html)
  and has no "jsChapter" class, so it doesn't get mixed into the chapter list.

Some chapters have no real href in the table of contents (href="javascript:cid(...)").
Verified in practice: these are NOT VIP chapters (the content page embeds a JS
variable `ReadParams` with `chapterisvip:'0'`) — the table of contents page simply
doesn't render the link, but the content page of the following chapter has
`ReadParams.url_previous` pointing to the missing one. This module automatically
fetches the content page of the following chapter (walking further back if
several chapters are missing in a row) to recover the real link, instead of
incorrectly labeling it "locked".
"""
import os
import random
import re
import time

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://www.bilinovel.com").rstrip("/")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}
REQUEST_TIMEOUT = 15  # seconds
REQUEST_DELAY_RANGE = (0.5, 1.0)  # seconds, avoids hammering the server

# e.g.: var ReadParams={url_previous:'/novel/4699/281554.html',url_next:'...', ...}
_READ_PARAMS_RE = re.compile(r"var\s+ReadParams\s*=\s*\{(.*?)\}\s*;?\s*(?:</script>|$)", re.DOTALL)
_READ_PARAMS_FIELD_RE = re.compile(r"(\w+)\s*:\s*'([^']*)'")
_PAGE_SUFFIX_RE = re.compile(r"_\d+$")


class TocFetchError(Exception):
    """Raised when a page (table of contents or a content page used for resolving) can't be fetched."""


class TocParseError(Exception):
    """Raised when a page loads but doesn't match the expected structure."""


def _fetch_html(url: str) -> str:
    time.sleep(random.uniform(*REQUEST_DELAY_RANGE))
    try:
        response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout as exc:
        raise TocFetchError(f"Timeout while fetching page: {url}") from exc
    except requests.exceptions.RequestException as exc:
        raise TocFetchError(f"Connection error while fetching page {url}: {exc}") from exc

    if response.status_code != 200:
        raise TocFetchError(
            f"Page {url} returned status code {response.status_code}, expected 200"
        )
    return response.text


def _extract_read_params(html: str) -> dict:
    """Parse the `ReadParams` JS variable embedded in a chapter content page into a dict."""
    match = _READ_PARAMS_RE.search(html)
    if not match:
        return {}
    return dict(_READ_PARAMS_FIELD_RE.findall(match.group(1)))


def _chapter_id_from_href(href: str) -> str:
    raw = href.rstrip("/").split("/")[-1].removesuffix(".html")
    # href may point to a specific page of a multi-page chapter, e.g. "281554_2"
    return _PAGE_SUFFIX_RE.sub("", raw)


def _resolve_missing_chapters(chapters: list[dict], novel_id: str) -> None:
    """Recover the real url/chapter_id for chapters with no href in the table of
    contents, by reading `ReadParams.url_previous` from the content page of the
    following chapter (walking further back if several chapters are missing in
    a row).

    Mutates the dicts in `chapters` in place. If resolving fails (network error,
    or the missing chapter is at the very end of the novel with nothing after
    it to anchor from), leaves "locked": True to signal that the link could
    not be determined.
    """
    n = len(chapters)
    i = 0
    while i < n:
        if chapters[i]["url"] is not None:
            i += 1
            continue

        run_start = i
        run_end = i
        while run_end < n and chapters[run_end]["url"] is None:
            run_end += 1
        # chapters[run_end] is the first chapter with a known link right after the
        # missing run (if run_end == n, the missing run is at the end of the novel,
        # with nothing to anchor from)

        if run_end < n:
            current_url = chapters[run_end]["url"]
            for k in range(run_end - 1, run_start - 1, -1):
                try:
                    html = _fetch_html(current_url)
                except TocFetchError:
                    break  # can't walk back further, remaining chapters in the run stay "locked"

                params = _extract_read_params(html)
                prev_href = params.get("url_previous")
                if not prev_href:
                    break

                chapter_id = _chapter_id_from_href(prev_href)
                resolved_url = f"{BASE_URL}/novel/{novel_id}/{chapter_id}.html"

                chapters[k]["chapter_id"] = chapter_id
                chapters[k]["url"] = resolved_url
                chapters[k]["locked"] = False
                current_url = resolved_url

        i = run_end + 1


def get_table_of_contents(novel_id: str) -> list[dict]:
    """Fetch the chapter list for a novel on bilinovel.com.

    Args:
        novel_id: the novel's id, e.g. "4699".

    Returns:
        list[dict] in the novel's correct reading order, each dict with:
            - chapter_id (str)
            - title (str)
            - url (str, or None if the link could not be determined)
            - order (int, starting at 1)
            - locked (bool): True if the real link could not be determined
              (resolving was attempted but failed), False if it has a valid link.

    Raises:
        ValueError: novel_id is empty.
        TocFetchError: the table of contents page could not be fetched (network,
            timeout, or a status code other than 200).
        TocParseError: the table of contents page loaded but didn't match the
            expected structure.
    """
    novel_id = str(novel_id).strip()
    if not novel_id:
        raise ValueError("novel_id must not be empty")

    url = f"{BASE_URL}/novel/{novel_id}/catalog"
    html = _fetch_html(url)

    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one("#volumes")
    if container is None:
        raise TocParseError(
            f"Could not find the table of contents container (#volumes) on page {url}. "
            "The page structure may have changed, or novel_id doesn't exist."
        )

    chapter_links = container.select("li.chapter-li.jsChapter > a.chapter-li-a")
    if not chapter_links:
        raise TocParseError(
            f"No chapters found in the table of contents container on page {url}. "
            "The selector 'li.chapter-li.jsChapter > a.chapter-li-a' may no longer be correct."
        )

    chapters = []
    order = 0
    for a_tag in chapter_links:
        href = (a_tag.get("href") or "").strip()
        if not href:
            continue

        order += 1
        span = a_tag.select_one("span.chapter-index")
        title = span.get_text(strip=True) if span else a_tag.get_text(strip=True)

        if href.startswith("javascript:"):
            # Fake href, needs resolving later (_resolve_missing_chapters)
            chapters.append(
                {
                    "chapter_id": f"unresolved_{order}",
                    "title": title,
                    "url": None,
                    "order": order,
                    "locked": True,
                }
            )
            continue

        chapter_id = _chapter_id_from_href(href)
        chapter_url = f"{BASE_URL}/novel/{novel_id}/{chapter_id}.html"

        chapters.append(
            {
                "chapter_id": chapter_id,
                "title": title,
                "url": chapter_url,
                "order": order,
                "locked": False,
            }
        )

    _resolve_missing_chapters(chapters, novel_id)

    return chapters
