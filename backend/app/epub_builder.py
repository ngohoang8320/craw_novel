"""Assembles captured chapter content (text + images) into a downloadable EPUB.

Images are embedded as real files inside the EPUB (downloaded server-side via
`app.image_fetch`, which sends the Referer their hotlink protection expects)
rather than kept as remote links - e-readers can't be expected to follow
hotlink-protected remote URLs, and the whole point of an EPUB is to work
fully offline.
"""
import html
import io
import os

from ebooklib import epub

from app.config import DATA_DIR
from app.image_fetch import (
    ImageFetchError,
    ImageNotAllowedError,
    content_type_for_path,
    extension_for,
    fetch_image,
)
from app.schemas import EpubChapterInput


class EpubBuildError(Exception):
    """Raised when the EPUB could not be assembled (e.g. an image failed to download)."""


def _read_local_image(local_path: str) -> tuple[bytes, str] | None:
    """Read a capture-time-downloaded image from disk, if it's actually
    there. Returns None (never raises) so the caller can fall back to a live
    network fetch - the local copy is an optimization, not a guarantee."""
    absolute_path = os.path.join(DATA_DIR, local_path)
    if not os.path.isfile(absolute_path):
        return None
    with open(absolute_path, "rb") as f:
        return f.read(), content_type_for_path(absolute_path)


def build_epub(
    novel_id: str,
    novel_title: str,
    novel_author: str,
    chapters: list[EpubChapterInput],
    cover_url: str | None = None,
) -> bytes:
    """Build an EPUB from the given chapters.

    Args:
        novel_id: used only as a fallback identifier/filename seed.
        novel_title: book title.
        novel_author: book author (may be empty).
        chapters: chapter content, in any order (sorted here by `.order`).
        cover_url: the volume's cover image URL, if any (from the table of
            contents' "volumes" data) - downloaded and embedded as the EPUB's
            cover.

    Returns:
        The finished .epub file as bytes. A chapter image or cover that can't
        be obtained either locally or over the network (confirmed dead on the
        site itself, not just a hotlink-protection quirk) is skipped rather
        than failing the whole build - a chapter image is replaced with an
        "[image unavailable]" marker, a missing cover is simply omitted.
    """
    book = epub.EpubBook()
    book.set_identifier(f"bilinovel-{novel_id}")
    book.set_title(novel_title or novel_id)
    book.set_language("zh")
    if novel_author:
        book.add_author(novel_author)

    if cover_url:
        try:
            cover_content, cover_content_type = fetch_image(cover_url)
            book.set_cover(f"cover{extension_for(cover_content_type, cover_url)}", cover_content)
        except (ImageFetchError, ImageNotAllowedError) as exc:
            # A missing/broken cover shouldn't sink the whole book - the
            # actual chapter content is what matters, so just skip it.
            print(f"[epub_builder] could not download cover image, skipping cover: {exc}")

    spine: list = ["nav"]
    toc = []

    for chapter in sorted(chapters, key=lambda c: c.order):
        file_name = f"chap_{chapter.order:04d}.xhtml"
        html_parts = [f"<h1>{html.escape(chapter.title)}</h1>"]

        for idx, item in enumerate(chapter.items):
            if item.type == "text" and item.text:
                html_parts.append(f"<p>{html.escape(item.text)}</p>")
            elif item.type == "image" and item.src:
                local = _read_local_image(item.local_path) if item.local_path else None
                if local is not None:
                    content, content_type = local
                else:
                    try:
                        content, content_type = fetch_image(item.src)
                    except (ImageFetchError, ImageNotAllowedError) as exc:
                        # Neither the local backup nor a live network fetch
                        # worked - confirmed dead on the site itself in some
                        # cases (e.g. img3.readpai.com 404ing on its own old
                        # images), nothing we can do about that. Skip just
                        # this image rather than failing the whole book.
                        print(
                            f'[epub_builder] could not embed an image for chapter "{chapter.title}", skipping it: {exc}'
                        )
                        html_parts.append("<p><em>[image unavailable]</em></p>")
                        continue

                image_name = f"images/chap_{chapter.order:04d}_{idx}{extension_for(content_type, item.src)}"
                book.add_item(
                    epub.EpubImage(
                        uid=f"img_{chapter.order}_{idx}",
                        file_name=image_name,
                        media_type=content_type,
                        content=content,
                    )
                )
                html_parts.append(f'<img src="{image_name}" alt="" />')

        chapter_doc = epub.EpubHtml(
            title=chapter.title,
            file_name=file_name,
            lang="zh",
            content="".join(html_parts),
        )
        book.add_item(chapter_doc)
        spine.append(chapter_doc)
        toc.append(chapter_doc)

    book.toc = toc
    book.spine = spine
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    buffer = io.BytesIO()
    epub.write_epub(buffer, book)
    return buffer.getvalue()
