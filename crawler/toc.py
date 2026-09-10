"""Lấy mục lục (danh sách chapter) của một truyện trên bilinovel.com.

Cấu trúc trang mục lục đã khảo sát thực tế (novel_id=4699):
- URL: {BASE_URL}/novel/{novel_id}/catalog
- Toàn bộ chapter (mọi volume) nằm trong 1 trang, không phân trang.
- Container: <div id="volumes" class="chapter-ol chapter-ol-catalog">
- Mỗi chapter: <li class="chapter-li jsChapter">
                 <a href="/novel/{novel_id}/{chapter_id}.html" class="chapter-li-a">
                   <span class="chapter-index">Tên chapter</span>
                 </a>
               </li>
- Header của từng volume dùng <li class="chapter-bar chapter-li"> (link vol_xxxx.html),
  không có class "jsChapter" nên không bị lẫn vào danh sách chapter.

Một số chapter không có href thật trong mục lục (href="javascript:cid(...)").
Đã kiểm tra thực tế: đây KHÔNG phải chapter VIP (trang content nhúng biến JS
`ReadParams` với `chapterisvip:'0'`) — trang mục lục chỉ đơn giản là không hiển thị
link, nhưng trang content của chapter liền sau có `ReadParams.url_previous` trỏ
đúng tới chapter còn thiếu. Module này tự động fetch thêm trang content của
chapter liền sau (và lùi dần nếu có nhiều chapter thiếu liên tiếp) để suy ra
link thật, thay vì đánh dấu "khóa" một cách sai lệch.
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
REQUEST_TIMEOUT = 15  # giây
REQUEST_DELAY_RANGE = (0.5, 1.0)  # giây, tránh spam request liên tục

# vd: var ReadParams={url_previous:'/novel/4699/281554.html',url_next:'...', ...}
_READ_PARAMS_RE = re.compile(r"var\s+ReadParams\s*=\s*\{(.*?)\}\s*;?\s*(?:</script>|$)", re.DOTALL)
_READ_PARAMS_FIELD_RE = re.compile(r"(\w+)\s*:\s*'([^']*)'")
_PAGE_SUFFIX_RE = re.compile(r"_\d+$")


class TocFetchError(Exception):
    """Raise khi không tải được trang (mục lục hoặc trang content dùng để resolve)."""


class TocParseError(Exception):
    """Raise khi tải được trang nhưng không tìm thấy cấu trúc mong đợi."""


def _fetch_html(url: str) -> str:
    time.sleep(random.uniform(*REQUEST_DELAY_RANGE))
    try:
        response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout as exc:
        raise TocFetchError(f"Timeout khi tải trang: {url}") from exc
    except requests.exceptions.RequestException as exc:
        raise TocFetchError(f"Lỗi kết nối khi tải trang {url}: {exc}") from exc

    if response.status_code != 200:
        raise TocFetchError(
            f"Trang {url} trả về status code {response.status_code}, mong đợi 200"
        )
    return response.text


def _extract_read_params(html: str) -> dict:
    """Parse biến JS `ReadParams` nhúng trong trang content chapter thành dict."""
    match = _READ_PARAMS_RE.search(html)
    if not match:
        return {}
    return dict(_READ_PARAMS_FIELD_RE.findall(match.group(1)))


def _chapter_id_from_href(href: str) -> str:
    raw = href.rstrip("/").split("/")[-1].removesuffix(".html")
    # href có thể trỏ tới 1 trang cụ thể trong chapter nhiều trang, vd "281554_2"
    return _PAGE_SUFFIX_RE.sub("", raw)


def _resolve_missing_chapters(chapters: list[dict], novel_id: str) -> None:
    """Suy ra url/chapter_id thật cho các chapter không có href trong mục lục,
    bằng cách đọc `ReadParams.url_previous` từ trang content của chapter liền sau
    (và lùi dần nếu có nhiều chapter thiếu liên tiếp nhau).

    Sửa trực tiếp trên các dict trong `chapters`. Nếu không resolve được (lỗi mạng,
    hoặc chapter thiếu nằm ở cuối truyện không có chapter nào theo sau), giữ
    nguyên "locked": True để báo hiệu chưa xác định được link.
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
        # chapters[run_end] là chapter đã biết link, nằm ngay sau dãy bị thiếu
        # (nếu run_end == n thì dãy thiếu nằm ở cuối truyện, không có gì để bám vào)

        if run_end < n:
            current_url = chapters[run_end]["url"]
            for k in range(run_end - 1, run_start - 1, -1):
                try:
                    html = _fetch_html(current_url)
                except TocFetchError:
                    break  # không lùi tiếp được nữa, các chapter còn lại trong dãy giữ nguyên "locked"

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
    """Lấy danh sách chapter của một truyện trên bilinovel.com.

    Args:
        novel_id: id của truyện, ví dụ "4699".

    Returns:
        list[dict] theo thứ tự đúng trong truyện, mỗi dict gồm:
            - chapter_id (str)
            - title (str)
            - url (str hoặc None nếu không xác định được link)
            - order (int, bắt đầu từ 1)
            - locked (bool): True nếu không xác định được link thật (đã cố resolve
              nhưng thất bại), False nếu có link hợp lệ.

    Raises:
        ValueError: novel_id rỗng.
        TocFetchError: không tải được trang mục lục (mạng, timeout, status code khác 200).
        TocParseError: tải được trang mục lục nhưng không tìm thấy cấu trúc mong đợi.
    """
    novel_id = str(novel_id).strip()
    if not novel_id:
        raise ValueError("novel_id không được để trống")

    url = f"{BASE_URL}/novel/{novel_id}/catalog"
    html = _fetch_html(url)

    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one("#volumes")
    if container is None:
        raise TocParseError(
            f"Không tìm thấy khung mục lục (#volumes) trên trang {url}. "
            "Cấu trúc trang có thể đã thay đổi hoặc novel_id không tồn tại."
        )

    chapter_links = container.select("li.chapter-li.jsChapter > a.chapter-li-a")
    if not chapter_links:
        raise TocParseError(
            f"Không tìm thấy chapter nào trong khung mục lục trên trang {url}. "
            "Selector 'li.chapter-li.jsChapter > a.chapter-li-a' có thể không còn đúng."
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
            # Href giả, cần resolve thêm ở bước sau (_resolve_missing_chapters)
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
