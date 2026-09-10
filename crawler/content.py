"""Lấy nội dung 1 chapter trên bilinovel.com bằng Playwright (cần render JS).

QUAN TRỌNG - đã khảo sát thực tế (novel_id=4699, chapter 281555):
- Trang content nhúng biến JS `window.ReadParams` gồm url_previous/url_next/
  chapterid/page/... dùng để biết chapter đang ở trang mấy và trang kế tiếp.
- Nội dung nằm trong <div id="acontent"><p>...</p><p>...</p>...</div>
- Site chạy sau Cloudflare và có cơ chế chống bot: đã test cả `requests` lẫn
  Playwright/Chromium thật (kể cả ẩn navigator.webdriver, reload nhiều lần,
  chờ lâu) đều cho kết quả GIỐNG HỆT NHAU - nội dung bị cắt cụt giữa chừng,
  kết thúc bằng câu thông báo lỗi nhúng sẵn trong HTML (nghĩa: "Nội dung tải
  thất bại! Vui lòng làm mới hoặc đổi trình duyệt").
- Module này KHÔNG áp dụng kỹ thuật né tránh phát hiện bot (stealth plugin,
  xoay proxy...) để lách cơ chế trên - chỉ tải trang như trình duyệt thật tải
  bình thường. Nếu nội dung trả về bị cắt, hàm báo rõ qua field "blocked"
  thay vì âm thầm trả dữ liệu thiếu.
"""
import json
import os
import re
from datetime import datetime

from dotenv import load_dotenv
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://www.bilinovel.com").rstrip("/")

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIES_FILE = os.getenv("COOKIES_FILE", os.path.join(_PROJECT_ROOT, "cookies.local.json"))

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
PAGE_LOAD_TIMEOUT_MS = 30000
GOTO_RETRY_COUNT = 1  # thử lại thêm 1 lần nếu goto timeout (mạng chập chờn)
CONTENT_SELECTOR = "#acontent p"
FAIL_MARKER = "內容加載失敗"  # thông báo lỗi site tự nhúng khi nội dung không tải đủ

# Chờ nội dung "ổn định" thay vì chờ cố định 1 khoảng thời gian: poll số đoạn/độ
# dài text mỗi STABLE_POLL_INTERVAL_MS, coi là xong khi kết quả không đổi qua
# STABLE_REQUIRED_CHECKS lần liên tiếp, tối đa STABLE_MAX_WAIT_MS.
STABLE_POLL_INTERVAL_MS = 500
STABLE_REQUIRED_CHECKS = 2
STABLE_MAX_WAIT_MS = 10000

_PAGE_SUFFIX_RE = re.compile(r"_\d+$")


def _parse_cookie_expires(value) -> float:
    """Chuyển 'expires' trong file cookie (ISO 8601, số, hoặc None cho session
    cookie) sang định dạng Playwright cần (Unix timestamp giây, -1 = session)."""
    if value is None:
        return -1
    if isinstance(value, (int, float)):
        return float(value)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()


def load_local_cookies(path: str = COOKIES_FILE) -> list[dict]:
    """Đọc cookie đã export từ trình duyệt thật (vd qua DevTools > Application >
    Cookies) từ file JSON cục bộ, dùng để tái sử dụng phiên đã tự vượt qua kiểm
    tra Cloudflare của chính người dùng - KHÔNG phải kỹ thuật giả mạo/lách bot.

    File không tồn tại -> trả về [] (chạy bình thường, không cookie), không raise lỗi.
    File tồn tại nhưng sai định dạng -> raise ValueError rõ ràng.
    """
    if not os.path.isfile(path):
        return []

    with open(path, "r", encoding="utf-8") as f:
        try:
            raw_cookies = json.load(f)
        except json.JSONDecodeError as exc:
            raise ValueError(f"File cookie '{path}' không phải JSON hợp lệ: {exc}") from exc

    cookies = []
    for c in raw_cookies:
        try:
            cookies.append(
                {
                    "name": c["name"],
                    "value": c["value"],
                    "domain": c["domain"],
                    "path": c.get("path", "/"),
                    "expires": _parse_cookie_expires(c.get("expires")),
                    "httpOnly": bool(c.get("httpOnly", False)),
                    "secure": bool(c.get("secure", False)),
                    "sameSite": c.get("sameSite") or "Lax",
                }
            )
        except KeyError as exc:
            raise ValueError(
                f"File cookie '{path}' thiếu field bắt buộc {exc} ở 1 cookie."
            ) from exc

    return cookies


class ContentFetchError(Exception):
    """Raise khi không tải được trang (mạng, timeout)."""


class ContentParseError(Exception):
    """Raise khi tải được trang nhưng không tìm thấy nội dung (selector sai/đổi cấu trúc)."""


class ChapterContentFetcher:
    """Quản lý 1 phiên trình duyệt Playwright dùng chung cho nhiều chapter,
    tránh phải mở/đóng trình duyệt cho từng chapter (tốn thời gian).

    Dùng như context manager:
        with ChapterContentFetcher() as fetcher:
            result = fetcher.fetch_chapter(url)
    """

    def __init__(self):
        self._pw = None
        self._browser = None
        self._context = None
        self.cookies_loaded_count = 0

    def __enter__(self) -> "ChapterContentFetcher":
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=True)
        self._context = self._browser.new_context(user_agent=USER_AGENT)

        cookies = load_local_cookies()
        if cookies:
            self._context.add_cookies(cookies)
        self.cookies_loaded_count = len(cookies)

        return self

    def __exit__(self, exc_type, exc, tb):
        if self._browser is not None:
            self._browser.close()
        if self._pw is not None:
            self._pw.stop()

    def fetch_chapter(self, url: str) -> dict:
        """Lấy nội dung 1 chapter, tự gộp các trang con nếu chapter bị chia nhiều trang.

        Returns:
            dict gồm:
                - paragraphs (list[str]): danh sách đoạn văn đã gộp từ mọi trang con.
                - page_count (int): số trang con đã tải.
                - blocked (bool): True nếu phát hiện dấu hiệu nội dung bị cắt bởi
                  cơ chế chống bot của site (xem FAIL_MARKER).

        Raises:
            ContentFetchError: lỗi mạng/timeout khi tải trang.
            ContentParseError: tải được trang nhưng không tìm thấy nội dung.
        """
        if self._context is None:
            raise RuntimeError(
                "ChapterContentFetcher phải được dùng trong khối 'with' (context manager)."
            )

        page = self._context.new_page()
        try:
            all_paragraphs: list[str] = []
            current_url = url
            visited: set[str] = set()
            page_count = 0
            blocked = False

            while current_url and current_url not in visited:
                visited.add(current_url)
                self._goto_with_retry(page, current_url)
                page_count += 1

                paragraphs = self._wait_for_stable_paragraphs(page)

                html = page.content()
                if FAIL_MARKER in html:
                    blocked = True

                if not paragraphs and page_count == 1:
                    raise ContentParseError(
                        f"Không tìm thấy nội dung (selector '{CONTENT_SELECTOR}') tại {current_url}. "
                        "Cấu trúc trang có thể đã thay đổi."
                    )
                all_paragraphs = self._merge_avoiding_overlap(all_paragraphs, paragraphs)

                read_params = page.evaluate("() => window.ReadParams || null") or {}
                current_url = self._next_page_url_if_same_chapter(read_params)

            return {
                "paragraphs": all_paragraphs,
                "page_count": page_count,
                "blocked": blocked,
            }
        finally:
            page.close()

    @staticmethod
    def _goto_with_retry(page, url: str) -> None:
        last_exc: Exception | None = None
        for attempt in range(GOTO_RETRY_COUNT + 1):
            try:
                page.goto(url, wait_until="load", timeout=PAGE_LOAD_TIMEOUT_MS)
                return
            except PlaywrightTimeoutError as exc:
                last_exc = exc
            except PlaywrightError as exc:
                raise ContentFetchError(f"Lỗi khi tải trang {url}: {exc}") from exc
        raise ContentFetchError(
            f"Timeout khi tải trang: {url} (đã thử {GOTO_RETRY_COUNT + 1} lần)"
        ) from last_exc

    @staticmethod
    def _wait_for_stable_paragraphs(page) -> list[str]:
        """Poll nội dung cho tới khi số đoạn + tổng độ dài text không đổi qua
        STABLE_REQUIRED_CHECKS lần liên tiếp, thay vì chờ cố định 1 khoảng thời
        gian - tránh vừa crawl thiếu (chờ chưa đủ) vừa crawl thừa/lặp (do đọc
        DOM giữa lúc trang đang cập nhật lại nội dung)."""
        elapsed_ms = 0
        last_signature = None
        stable_count = 0
        paragraphs: list[str] = []

        while elapsed_ms <= STABLE_MAX_WAIT_MS:
            paragraphs = [p.strip() for p in page.locator(CONTENT_SELECTOR).all_inner_texts() if p.strip()]
            signature = (len(paragraphs), sum(len(p) for p in paragraphs))

            if signature == last_signature:
                stable_count += 1
                if stable_count >= STABLE_REQUIRED_CHECKS:
                    break
            else:
                stable_count = 0
            last_signature = signature

            page.wait_for_timeout(STABLE_POLL_INTERVAL_MS)
            elapsed_ms += STABLE_POLL_INTERVAL_MS

        return paragraphs

    @staticmethod
    def _merge_avoiding_overlap(existing: list[str], new: list[str]) -> list[str]:
        """Nối `new` vào `existing`, tự cắt bỏ phần đầu của `new` nếu nó trùng
        với phần đuôi của `existing` (vd trang 2 của cùng chapter vô tình lặp
        lại vài đoạn cuối của trang 1)."""
        if not existing or not new:
            return existing + new

        max_overlap = min(len(existing), len(new))
        for overlap_len in range(max_overlap, 0, -1):
            if existing[-overlap_len:] == new[:overlap_len]:
                return existing + new[overlap_len:]
        return existing + new

    @staticmethod
    def _next_page_url_if_same_chapter(read_params: dict) -> str | None:
        """Trả về URL trang kế tiếp NẾU nó vẫn thuộc cùng chapter hiện tại
        (chapter bị chia nhiều trang), None nếu đã hết trang hoặc next trỏ
        sang chapter khác (không đi lố sang chapter sau trong hàm này)."""
        next_href = read_params.get("url_next")
        current_chapter_id = read_params.get("chapterid")
        if not next_href or not current_chapter_id:
            return None

        next_raw_id = next_href.rstrip("/").split("/")[-1].removesuffix(".html")
        next_base_id = _PAGE_SUFFIX_RE.sub("", next_raw_id)
        if next_base_id != current_chapter_id:
            return None

        return next_href if next_href.startswith("http") else f"{BASE_URL}{next_href}"


def fetch_single_chapter(url: str) -> dict:
    """Tiện ích test nhanh 1 chapter mà không cần quản lý context manager.
    Không dùng hàm này khi crawl nhiều chapter (sẽ mở/đóng browser mỗi lần, chậm)
    - hãy dùng ChapterContentFetcher trong trường hợp đó.
    """
    with ChapterContentFetcher() as fetcher:
        return fetcher.fetch_chapter(url)
