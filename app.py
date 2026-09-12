import os

import streamlit as st
from dotenv import load_dotenv

from crawler.capture_store import delete_captured_chapter, flatten_pages, load_captured_chapter
from crawler.toc import TocFetchError, TocParseError, get_table_of_contents
from ui.confirm_dialog import confirm_dialog

load_dotenv()

DEFAULT_NOVEL_ID = os.getenv("DEFAULT_NOVEL_ID", "")

st.set_page_config(page_title="Bilinovel Crawler", layout="wide")
st.title("Bilinovel -> EPUB Crawler (internal)")

if "toc" not in st.session_state:
    st.session_state.toc = []

novel_id = st.text_input("Novel ID", value=DEFAULT_NOVEL_ID, placeholder="e.g. 4699")

fetch_clicked = st.button("Fetch table of contents", type="primary")

if fetch_clicked:
    if not novel_id.strip():
        st.error("Please enter a novel_id.")
    else:
        with st.spinner(f"Fetching table of contents for novel_id={novel_id}..."):
            try:
                toc = get_table_of_contents(novel_id.strip())
                # Clear old checkbox state to avoid mixing selections between different fetches
                for key in list(st.session_state.keys()):
                    if key.startswith("chk_"):
                        del st.session_state[key]
                st.session_state.toc = toc
                st.success(f"Fetched {len(toc)} chapters.")
            except (TocFetchError, TocParseError) as exc:
                st.error(f"Error fetching table of contents: {exc}")
            except ValueError as exc:
                st.error(str(exc))

if st.session_state.toc:
    st.subheader(f"Table of contents ({len(st.session_state.toc)} chapters)")

    col1, col2 = st.columns(2)
    if col1.button("Select all"):
        for chapter in st.session_state.toc:
            if not chapter.get("locked"):
                st.session_state[f"chk_{chapter['chapter_id']}"] = True
        st.rerun()
    if col2.button("Deselect all"):
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
        st.markdown(f"**⚠️ Unresolved link ({len(locked_chapters)})**")
        st.caption("No href in the table of contents, and resolving via the neighboring chapter failed")
        with st.container(height=450):
            if locked_chapters:
                for chapter in locked_chapters:
                    st.markdown(f"- {chapter['order']}. {chapter['title']}")
            else:
                st.caption("No chapters with a missing link.")

    selected_count = sum(
        1
        for chapter in unlocked_chapters
        if st.session_state.get(f"chk_{chapter['chapter_id']}")
    )
    st.markdown("---")
    st.info(
        f"Selected: **{selected_count}/{len(unlocked_chapters)}** chapters "
        f"(excluding {len(locked_chapters)} chapters with an unresolved link)"
    )

    selected_chapters = [
        c for c in unlocked_chapters if st.session_state.get(f"chk_{c['chapter_id']}")
    ]

    if selected_chapters:
        with st.expander(f"🔗 Links for the {len(selected_chapters)} selected chapters (to open in your browser)"):
            for chapter in selected_chapters:
                st.markdown(f"{chapter['order']}. [{chapter['title']}]({chapter['url']})")

    st.markdown("---")
    st.subheader("Import content captured by the extension")
    st.caption(
        "Load the extension from the extension/ folder (see README), run `python capture_server.py`, "
        "then open each selected chapter in your real browser — the content is saved to data/ automatically."
    )

    capture_rows = [
        (c, load_captured_chapter(novel_id.strip(), c["chapter_id"])) for c in selected_chapters
    ]
    captured_count = sum(1 for _, captured in capture_rows if captured)
    complete_count = sum(1 for _, captured in capture_rows if captured and captured.get("is_complete"))
    st.caption(
        f"Captured: {captured_count}/{len(selected_chapters)} selected chapters "
        f"({complete_count} chapters fully captured)."
    )

    if st.button(f"Import captured content ({captured_count} chapters)", disabled=captured_count == 0):
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
                "paragraphs": paragraphs,
                "error": None,
            }
        st.session_state.crawled_content = results
        st.success(f"Imported {captured_count} chapters from captured data.")

    if st.session_state.get("crawled_content"):
        st.markdown("### Crawl results")

        if st.button("🗑️ Clear all crawl results"):
            st.session_state.crawled_content = {}
            st.rerun()

        crawled = st.session_state.crawled_content
        error_count = sum(1 for r in crawled.values() if r["error"])
        if error_count:
            st.error(f"{error_count} chapters failed (no valid captured data found).")

        def _remove_chapter(chapter_id_to_remove: str) -> None:
            delete_captured_chapter(novel_id.strip(), chapter_id_to_remove)
            remaining = dict(st.session_state.get("crawled_content") or {})
            remaining.pop(chapter_id_to_remove, None)
            st.session_state.crawled_content = remaining

        for chapter_id, r in sorted(crawled.items(), key=lambda kv: kv[1]["order"]):
            status_icon = "❌" if r["error"] else "✅"
            label = (
                f"{status_icon} {r['order']}. {r['title']} — "
                f"{r['paragraph_count']} paragraphs, {r['char_count']} chars"
            )
            expander_col, delete_col = st.columns([20, 1])
            with expander_col:
                with st.expander(label):
                    if r["error"]:
                        st.error(r["error"])
                    else:
                        st.caption(f"page_count={r['page_count']}")
                        for paragraph in r["paragraphs"]:
                            st.write(paragraph)
            with delete_col:
                if st.button("✕", key=f"del_{chapter_id}"):
                    confirm_dialog(
                        message=(
                            f"Delete chapter \"{r['title']}\" from the crawl results? "
                            "This also removes its captured data file from disk."
                        ),
                        on_confirm=lambda cid=chapter_id: _remove_chapter(cid),
                        confirm_label="Delete",
                        danger=True,
                    )
else:
    st.caption("Enter a novel_id and click 'Fetch table of contents' to get started.")
