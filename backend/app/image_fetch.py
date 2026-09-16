"""Fetches bilinovel/readpai chapter images with the Referer their hotlink
protection expects.

Verified directly: an image URL returns 403 with no Referer and 200 with
`Referer: https://www.bilinovel.com/`. Shared by the browser-facing image
proxy (routers/image_proxy.py) and the EPUB builder (which embeds the actual
image bytes) so both use the exact same fetch/allowlist logic.

This is unrelated to the anti-bot protection on chapter *content* pages (which
detects automated clients and returns shuffled/truncated text) - image hosts
here only check the Referer header, a much simpler mechanism that any browser
satisfies just by rendering an <img> tag on the actual site.
"""
import os
from urllib.parse import urlparse

import requests

BASE_URL = os.getenv("BASE_URL", "https://www.bilinovel.com").rstrip("/")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15  # seconds

# Only relay/embed images from hosts actually used by bilinovel.com's chapter
# pages - never fetch arbitrary URLs, which would turn this into an open proxy
# (SSRF risk).
_ALLOWED_HOST_SUFFIXES = ("bilinovel.com", "readpai.com")


class ImageNotAllowedError(Exception):
    """Raised when a URL's host isn't on the allowlist."""


class ImageFetchError(Exception):
    """Raised on a network failure or a non-200 response from the image host."""


def is_allowed_image_host(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in _ALLOWED_HOST_SUFFIXES)


def fetch_image(url: str) -> tuple[bytes, str]:
    """Fetch one image with the expected Referer.

    Returns:
        (content_bytes, content_type)

    Raises:
        ImageNotAllowedError: the URL's host isn't on the allowlist.
        ImageFetchError: network failure, timeout, or a non-200 response.
    """
    if not is_allowed_image_host(url):
        raise ImageNotAllowedError(f"Image host not allowed: {url}")

    try:
        upstream = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Referer": f"{BASE_URL}/"},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        raise ImageFetchError(f"Could not fetch image {url}: {exc}") from exc

    if upstream.status_code != 200:
        raise ImageFetchError(f"Image host returned status code {upstream.status_code} for {url}")

    content_type = upstream.headers.get("Content-Type", "application/octet-stream")
    return upstream.content, content_type


def extension_for(content_type: str, url: str) -> str:
    """Guess a file extension from the Content-Type header, falling back to
    the URL's own extension. Shared by the EPUB builder and the capture-time
    image downloader so both name files the same way."""
    if "png" in content_type:
        return ".png"
    if "gif" in content_type:
        return ".gif"
    if "webp" in content_type:
        return ".webp"
    lower_url = url.lower()
    if lower_url.endswith((".png", ".gif", ".webp", ".jpeg")):
        return "." + lower_url.rsplit(".", 1)[-1]
    return ".jpg"


_EXTENSION_CONTENT_TYPES = {
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def content_type_for_path(path: str) -> str:
    """Reverse of `extension_for`, for reading a locally-stored image back
    (no Content-Type header available from disk, only the extension we
    already chose when saving it)."""
    _, ext = os.path.splitext(path)
    return _EXTENSION_CONTENT_TYPES.get(ext.lower(), "application/octet-stream")
