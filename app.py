import os
import random
import time

import streamlit as st
from dotenv import load_dotenv

from crawler.capture_store import flatten_pages, load_captured_chapter
from crawler.content import ChapterContentFetcher, ContentFetchError, ContentParseError
from crawler.toc import TocFetchError, TocParseError, get_table_of_contents

load_dotenv()

DEFAULT_NOVEL_ID = os.getenv("DEFAULT_NOVEL_ID", "")

st.set_page_config(page_title="Bilinovel Crawler", layout="wide")
st.title("Bilinovel -> EPUB Crawler (nội bộ)")

if "toc" not in st.session_state:
    st.session_state.toc = []

novel_id = st.text_input("Novel ID", value=DEFAULT_NOVEL_ID, placeholder="vd: 4699")

fetch_clicked = st.button("Lấy mục lục", type="primary")

if fetch_clicked:
    if not novel_id.strip():
        st.error("Vui lòng nhập novel_id.")
    else:
        with st.spinner(f"Đang lấy mục lục cho novel_id={novel_id}..."):
            try:
                toc = get_table_of_contents(novel_id.strip())
                # Xoá trạng thái checkbox cũ để tránh lẫn giữa các lần lấy mục lục khác nhau
                for key in list(st.session_state.keys()):
                    if key.startswith("chk_"):
                        del st.session_state[key]
                st.session_state.toc = toc
                st.success(f"Đã lấy được {len(toc)} chapter.")
            except (TocFetchError, TocParseError) as exc:
                st.error(f"Lỗi khi lấy mục lục: {exc}")
            except ValueError as exc:
                st.error(str(exc))

if st.session_state.toc:
    st.subheader(f"Mục lục ({len(st.session_state.toc)} chapter)")

    col1, col2 = st.columns(2)
    if col1.button("Chọn tất cả"):
        for chapter in st.session_state.toc:
            if not chapter.get("locked"):
                st.session_state[f"chk_{chapter['chapter_id']}"] = True
        st.rerun()
    if col2.button("Bỏ chọn tất cả"):
        for chapter in st.session_state.toc:
            if not chapter.get("locked"):
                st.session_state[f"chk_{chapter['chapter_id']}"] = False
        st.rerun()

    locked_chapters = [c for c in st.session_state.toc if c.get("locked")]
    unlocked_chapters = [c for c in st.session_state.toc if not c.get("locked")]

    list_col, locked_col = st.columns([3, 1])

    with list_col:
        with st.container(height=450):
            for chapter in unlocked_chapters:
                key = f"chk_{chapter['chapter_id']}"
                if key not in st.session_state:
                    st.session_state[key] = False
                st.checkbox(f"{chapter['order']}. {chapter['title']}", key=key)

    with locked_col:
        st.markdown(f"**⚠️ Chưa xác định link ({len(locked_chapters)})**")
        st.caption("Mục lục không có href, đã thử suy ra từ chapter liền kề nhưng thất bại")
        with st.container(height=450):
            if locked_chapters:
                for chapter in locked_chapters:
                    st.markdown(f"- {chapter['order']}. {chapter['title']}")
            else:
                st.caption("Không có chapter nào bị thiếu link.")

    selected_count = sum(
        1
        for chapter in unlocked_chapters
        if st.session_state.get(f"chk_{chapter['chapter_id']}")
    )
    st.markdown("---")
    st.info(
        f"Đang chọn: **{selected_count}/{len(unlocked_chapters)}** chapter "
        f"(không tính {len(locked_chapters)} chapter chưa xác định được link)"
    )

    selected_chapters = [
        c for c in unlocked_chapters if st.session_state.get(f"chk_{c['chapter_id']}")
    ]

    st.markdown("---")
    st.subheader("Crawl nội dung chapter đã chọn")
    st.caption(
        "Dùng Playwright (browser thật, không có kỹ thuật né chặn bot). "
        "Nếu site phát hiện request tự động, chapter đó sẽ hiện trạng thái 'blocked'."
    )
    if os.path.isfile(os.path.join(os.path.dirname(__file__), "cookies.local.json")):
        st.caption("🍪 Đã tìm thấy `cookies.local.json` — sẽ dùng cookie này khi crawl.")
    else:
        st.caption(
            "🍪 Chưa có `cookies.local.json` — crawl không kèm cookie "
            "(xem README nếu muốn dùng cookie từ trình duyệt thật của bạn)."
        )

    crawl_clicked = st.button(
        f"Crawl nội dung ({len(selected_chapters)} chapter đã chọn)",
        disabled=len(selected_chapters) == 0,
    )

    if crawl_clicked:
        results = {}
        progress = st.progress(0.0)
        status_text = st.empty()

        try:
            with ChapterContentFetcher() as fetcher:
                st.session_state.cookies_loaded_count = fetcher.cookies_loaded_count
                for idx, chapter in enumerate(selected_chapters, start=1):
                    status_text.text(
                        f"Đang crawl [{idx}/{len(selected_chapters)}]: {chapter['title']}"
                    )
                    try:
                        fetched = fetcher.fetch_chapter(chapter["url"])
                        results[chapter["chapter_id"]] = {
                            "title": chapter["title"],
                            "order": chapter["order"],
                            "page_count": fetched["page_count"],
                            "paragraph_count": len(fetched["paragraphs"]),
                            "char_count": sum(len(p) for p in fetched["paragraphs"]),
                            "blocked": fetched["blocked"],
                            "paragraphs": fetched["paragraphs"],
                            "error": None,
                        }
                    except (ContentFetchError, ContentParseError) as exc:
                        results[chapter["chapter_id"]] = {
                            "title": chapter["title"],
                            "order": chapter["order"],
                            "page_count": 0,
                            "paragraph_count": 0,
                            "char_count": 0,
                            "blocked": False,
                            "paragraphs": [],
                            "error": str(exc),
                        }
                    progress.progress(idx / len(selected_chapters))
                    time.sleep(random.uniform(0.5, 1.0))

            status_text.empty()
            st.session_state.crawled_content = results
            st.success(f"Đã crawl xong {len(selected_chapters)} chapter.")
        except ValueError as exc:
            status_text.empty()
            st.error(f"Lỗi cấu hình cookie: {exc}")

    st.markdown("---")
    st.subheader("Nhập nội dung đã capture từ extension")
    st.caption(
        "Cài extension trong thư mục extension/ (xem README), chạy `python capture_server.py`, "
        "rồi tự mở từng chapter đã chọn bằng trình duyệt thật — nội dung sẽ tự động được lưu vào data/."
    )

    capture_rows = [
        (c, load_captured_chapter(novel_id.strip(), c["chapter_id"])) for c in selected_chapters
    ]
    captured_count = sum(1 for _, captured in capture_rows if captured)
    complete_count = sum(1 for _, captured in capture_rows if captured and captured.get("is_complete"))
    st.caption(
        f"Đã capture: {captured_count}/{len(selected_chapters)} chapter đã chọn "
        f"({complete_count} chapter capture đủ trang)."
    )

    if st.button(f"Nạp nội dung đã capture ({captured_count} chapter)", disabled=captured_count == 0):
        results = dict(st.session_state.get("crawled_content") or {})
        for chapter, captured in capture_rows:
            if not captured:
                continue
            paragraphs = flatten_pages(captured)
            results[chapter["chapter_id"]] = {
                "title": chapter["title"],
                "order": chapter["order"],
                "page_count": len(captured.get("pages", {})),
                "paragraph_count": len(paragraphs),
                "char_count": sum(len(p) for p in paragraphs),
                "blocked": False,
                "paragraphs": paragraphs,
                "error": None,
            }
        st.session_state.crawled_content = results
        st.success(f"Đã nạp {captured_count} chapter từ dữ liệu capture.")

    if st.session_state.get("crawled_content"):
        st.markdown("### Kết quả crawl")
        if "cookies_loaded_count" in st.session_state:
            st.caption(f"🍪 Đã dùng {st.session_state.cookies_loaded_count} cookie khi crawl lần vừa rồi.")
        crawled = st.session_state.crawled_content
        blocked_count = sum(1 for r in crawled.values() if r["blocked"])
        error_count = sum(1 for r in crawled.values() if r["error"])

        if blocked_count:
            st.warning(
                f"{blocked_count} chapter bị chặn nội dung — site phát hiện request tự động "
                "và trả về nội dung cắt cụt (xem chi tiết trong từng chapter bên dưới)."
            )
        if error_count:
            st.error(f"{error_count} chapter bị lỗi khi crawl (mạng/timeout/không tìm thấy nội dung).")

        for chapter_id, r in sorted(crawled.items(), key=lambda kv: kv[1]["order"]):
            if r["error"]:
                status_icon = "❌"
            elif r["blocked"]:
                status_icon = "⚠️"
            else:
                status_icon = "✅"

            label = (
                f"{status_icon} {r['order']}. {r['title']} — "
                f"{r['paragraph_count']} đoạn, {r['char_count']} ký tự"
            )
            with st.expander(label):
                if r["error"]:
                    st.error(r["error"])
                else:
                    st.caption(f"page_count={r['page_count']} · blocked={r['blocked']}")
                    for paragraph in r["paragraphs"]:
                        st.write(paragraph)
else:
    st.caption("Nhập novel_id và bấm 'Lấy mục lục' để bắt đầu.")
