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
- Each volume's header uses <li class="chapter-bar chapter-li"><a ...><h3>Volume title</h3></a></li>
  (link to vol_xxxx.html) and has no "jsChapter" class, so it doesn't get mixed
  into the chapter list; its <h3> text is extracted separately as a display-only
  volume label (see `get_table_of_contents`'s "volumes" return value).
- Right after the header, a <li class="volume-cover chapter-li"> holds the
  volume's cover image:
    <li class="volume-cover chapter-li">
      <a class="volume-cover-img">
        <img src="/images/book-cover-no.svg" data-src="https://img3.readpai.com/cover/..." class="lazyload" />
      </a>
    </li>
  `src` is always the generic lazyload placeholder graphic, never real content -
  the actual cover URL is in `data-src` (present in the initial HTML, same as
  chapter content images). Attached to the preceding volume entry as `cover_url`.

The catalog page's header also has the novel's author:
    <nav class="btn-group">
      <h1 class="btn-group-cell book-title ...">Book title</h1>
      <h2 class="book-author" ...>作者：Author name</h2>
    </nav>
`.book-author`'s text is prefixed with the "作者" (author) label and a colon,
which is stripped off to get just the name.

Some chapters have no real href in the table of contents (href="javascript:cid(...)").
Verified in practice: these are NOT VIP chapters (the content page embeds a JS
variable `ReadParams` with `chapterisvip:'0'`) — the table of contents page simply
doesn't render the link, but the content page of the following chapter has
`ReadParams.url_previous` pointing to the missing one. This module automatically
fetches the content page of the following chapter (walking further back if
several chapters are missing in a row) to recover the real link, instead of
incorrectly labeling it "locked". A missing chapter at the very end of the
novel has no following chapter to read from, so its link is taken from the
catalog page's `og:novel:latest_chapter_url` meta instead.
"""
import os
import random
import re
import time

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from app.crawler import toc_cache

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


_AUTHOR_LABEL_RE = re.compile(r"^作者\s*[:：]\s*")


def _extract_novel_author(soup: BeautifulSoup) -> str | None:
    """Extract the novel's author from the catalog page's book info block
    (`<h2 class="book-author">作者：Name</h2>`), stripping the "作者" (author)
    label. Returns None if the element isn't present."""
    el = soup.select_one(".book-author")
    if el is None:
        return None
    text = _AUTHOR_LABEL_RE.sub("", el.get_text(strip=True)).strip()
    return text or None


def _chapter_id_from_href(href: str) -> str:
    raw = href.rstrip("/").split("/")[-1].removesuffix(".html")
    # href may point to a specific page of a multi-page chapter, e.g. "281554_2"
    return _PAGE_SUFFIX_RE.sub("", raw)


# A chapter link typed in by hand: a bare id ("47565"), a filename
# ("47565.html", "47565_2.html"), a path ("/novel/1222/47565.html") or a full
# URL. Anything else (e.g. a "vol_47523.html" volume page) doesn't match.
_MANUAL_LINK_RE = re.compile(
    r"^(?:https?://[^/\s]+)?(?:/novel/(?P<novel>\d+)/)?(?P<chapter>\d+)(?:_\d+)?(?:\.html)?/?$"
)


def chapter_id_from_manual_link(novel_id: str, link: str) -> str:
    """Extract the chapter_id from a link/id typed in by hand.

    Raises:
        ValueError: `link` isn't a recognizable chapter link, or points at a
            different novel than `novel_id`.
    """
    match = _MANUAL_LINK_RE.match(link.strip())
    if not match:
        raise ValueError(
            'Not a chapter link. Use a chapter id ("47565") or a chapter URL '
            '("https://www.bilinovel.com/novel/1222/47565.html").'
        )
    if match.group("novel") and match.group("novel") != str(novel_id):
        raise ValueError(f"That link is for novel {match.group('novel')}, not novel {novel_id}.")
    return match.group("chapter")


def _apply_recovered_cache(chapters: list[dict], cached: dict[int, dict]) -> None:
    """Fill still-locked chapters from links recovered on a previous fetch
    (see `toc_cache`), so they don't have to be recovered over the network
    again. An entry is only applied if the chapter at that `order` still has
    the same title, and never if its chapter_id is already taken by another
    chapter (e.g. the site has since put a real link in the catalog)."""
    used_ids = {c["chapter_id"] for c in chapters if not c["locked"]}
    for chapter in chapters:
        if not chapter["locked"]:
            continue
        entry = cached.get(chapter["order"])
        if not entry or entry.get("title") != chapter["title"]:
            continue
        chapter_id = entry.get("chapter_id")
        if not chapter_id or chapter_id in used_ids:
            continue
        chapter["chapter_id"] = chapter_id
        chapter["url"] = entry["url"]
        chapter["locked"] = False
        chapter["recovered"] = True
        used_ids.add(chapter_id)


def _resolve_missing_chapters(
    chapters: list[dict], novel_id: str, latest_chapter_href: str | None = None
) -> None:
    """Recover the real url/chapter_id for chapters with no href in the table of
    contents, by reading `ReadParams.url_previous` from the content page of the
    following chapter (walking further back if several chapters are missing in
    a row).

    A missing run at the very END of the novel has no following chapter to
    anchor from. For that case, `latest_chapter_href` - the catalog page's own
    `og:novel:latest_chapter_url` meta, which always names the novel's real
    last chapter - is used as the anchor for the final chapter, and the rest
    of the run (if any) is then walked back from it like usual.

    Mutates the dicts in `chapters` in place. If resolving fails (network error,
    or a trailing missing run with no `latest_chapter_href` available), leaves
    "locked": True to signal that the link could not be determined.
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
        # with nothing after it to read url_previous from)

        latest_chapter_id = _chapter_id_from_href(latest_chapter_href) if latest_chapter_href else None
        # Guard: the meta must point at a chapter not already in the list -
        # if it names one we already resolved, it isn't the missing chapter
        # (e.g. stale/mismatched meta), so don't assign a duplicate id.
        if (
            run_end == n
            and latest_chapter_id
            and all(c["chapter_id"] != latest_chapter_id for c in chapters)
        ):
            last = n - 1
            chapter_id = latest_chapter_id
            chapters[last]["chapter_id"] = chapter_id
            chapters[last]["url"] = f"{BASE_URL}/novel/{novel_id}/{chapter_id}.html"
            chapters[last]["locked"] = False
            # The rest of the run (if any) can now be walked back from this
            # anchor, same as a run in the middle of the novel.
            run_end = last
            if run_start == last:
                break

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


def get_table_of_contents(novel_id: str) -> dict:
    """Fetch the chapter list for a novel on bilinovel.com.

    Args:
        novel_id: the novel's id, e.g. "4699".

    Returns:
        dict with:
            - "chapters": list[dict] in the novel's correct reading order, each with:
                - chapter_id (str)
                - title (str)
                - url (str, or None if the link could not be determined)
                - order (int, starting at 1)
                - locked (bool): True if the real link could not be determined
                  (resolving was attempted but failed), False if it has a valid link.
                - recovered (bool): True if the link did not come straight from
                  the catalog page but was recovered (or remembered from an
                  earlier fetch, or entered by hand - see `toc_cache`).
            - "volumes": list[dict], one per volume-header (<h3>) found in the
              table of contents, display-only (no id/url/action), each with:
                - title (str): the volume header text.
                - before_order (int): the "order" of the chapter this header
                  precedes. A caller rendering chapters should insert this
                  label immediately before the first chapter whose order is
                  >= before_order (or at the end, if none is left).
                - cover_url (str, or None if the volume has no cover image).
            - "novel_author": str or None - the novel's author, from the
              catalog page's book info block (None if not present).

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

    li_elements = container.select("li.chapter-li")
    if not li_elements:
        raise TocParseError(
            f"No entries found in the table of contents container on page {url}. "
            "The selector 'li.chapter-li' may no longer be correct."
        )

    chapters = []
    volumes = []
    order = 0

    for li in li_elements:
        classes = li.get("class") or []

        if "jsChapter" in classes:
            a_tag = li.select_one("a.chapter-li-a")
            href = (a_tag.get("href") or "").strip() if a_tag else ""
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
                        "recovered": False,
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
                    "recovered": False,
                }
            )

        elif "chapter-bar" in classes:
            h3 = li.select_one("h3")
            title = h3.get_text(strip=True) if h3 else ""
            if title:
                volumes.append({"title": title, "before_order": order + 1, "cover_url": None})

        elif "volume-cover" in classes:
            img = li.select_one("img")
            cover_src = (img.get("data-src") or "").strip() if img else ""
            if cover_src and volumes and volumes[-1]["cover_url"] is None:
                volumes[-1]["cover_url"] = (
                    cover_src if cover_src.startswith("http") else f"{BASE_URL}{cover_src}"
                )

        # else: a summary blurb or other decoration - neither a chapter nor
        # a header/cover we care about, so skip it.

    if not chapters:
        raise TocParseError(
            f"No chapters found in the table of contents container on page {url}. "
            "The selector 'li.chapter-li.jsChapter' may no longer be correct."
        )

    # The catalog page's own <meta property="og:novel:latest_chapter_url"> names
    # the novel's real last chapter - the only way to recover it when its
    # table-of-contents href is a fake "javascript:cid(...)" link.
    latest_meta = soup.select_one('meta[property="og:novel:latest_chapter_url"]')
    latest_chapter_href = (latest_meta.get("content") or "").strip() if latest_meta else None

    # Reuse links recovered on earlier fetches first, so only the chapters
    # that are STILL missing cost network requests - and so a chapter that
    # was recovered once can't disappear again because of a flaky request.
    _apply_recovered_cache(chapters, toc_cache.load_recovered(novel_id))
    still_locked_orders = {c["order"] for c in chapters if c["locked"]}

    _resolve_missing_chapters(chapters, novel_id, latest_chapter_href or None)

    # Remember whatever was recovered just now (skipping any chapter_id that
    # ended up on more than one chapter - that link can't be trusted).
    id_counts: dict[str, int] = {}
    for c in chapters:
        id_counts[c["chapter_id"]] = id_counts.get(c["chapter_id"], 0) + 1
    newly_recovered = {}
    for c in chapters:
        if c["order"] in still_locked_orders and not c["locked"]:
            c["recovered"] = True
            if id_counts[c["chapter_id"]] == 1:
                newly_recovered[c["order"]] = {
                    "title": c["title"],
                    "chapter_id": c["chapter_id"],
                    "url": c["url"],
                    "manual": False,
                }
    toc_cache.remember(novel_id, newly_recovered)

    novel_author = _extract_novel_author(soup)

    return {"chapters": chapters, "volumes": volumes, "novel_author": novel_author}
