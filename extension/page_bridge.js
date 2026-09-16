// Runs in the "main world" (the same JS context as the page) so it can read the
// window.ReadParams variable the page creates itself - an isolated-world content
// script can't see this variable. This script ONLY READS the DOM/JS variables
// already present on the page; it never navigates or opens any other page.
(function () {
  const CONTENT_SELECTOR = "#acontent";
  // Matches paragraphs and content images, in document order (querySelectorAll
  // always returns matches in document order regardless of selector). Content
  // images use class "imagecontent". Their real URL is always present as a
  // static data-src attribute, so there's no need to wait for lazysizes to
  // actually load the pixels before reading it.
  const ITEM_SELECTOR = "p, img.imagecontent";
  const STABLE_CHECK_INTERVAL_MS = 400;
  const STABLE_REQUIRED_CHECKS = 3;
  const STABLE_MAX_WAIT_MS = 8000;
  const EVENT_NAME = "bilinovel-capture-ready";
  // From page 2 onward the site appends a "(current/total)" suffix to the
  // chapter title somewhere on the page - page 1 never shows it, so the total
  // page count can only be learned this way. The exact element that carries
  // it hasn't been confirmed, so this checks every place the title could
  // plausibly appear (both ASCII and fullwidth parens, since this is a
  // Chinese site) and uses whichever one matches first.
  const PAGE_SUFFIX_RE = /[(（]\s*(\d+)\s*\/\s*(\d+)\s*[)）]/;

  function parseTotalPages(params) {
    const candidates = [
      document.title,
      document.querySelector("#atitle")?.textContent,
      params.chaptername,
    ];
    for (const text of candidates) {
      if (!text) continue;
      const match = PAGE_SUFFIX_RE.exec(text);
      if (match) {
        return parseInt(match[2], 10);
      }
    }
    return null;
  }

  // The site injects decoy paragraphs to poison naive scrapers: each <p> gets
  // a unique "data-k<random>" attribute, and a handful of them are targeted by
  // a page-specific CSS rule (e.g. "#acontent p[data-k462423800] { position:
  // absolute; transform: scale(0); }") that visually collapses them to
  // nothing while leaving them in the DOM with normal text. Since the
  // attribute value is random per page load, it can't be matched directly -
  // instead this checks whether the paragraph is actually visible to a real
  // reader (size, visibility, opacity). Only applied to <p> (not <img>) since
  // content images use data-src/lazysizes and can legitimately have zero
  // rendered size before their pixels load.
  function isParagraphHiddenAsDecoy(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.visibility === "collapse") {
      return true;
    }
    if (parseFloat(style.opacity) === 0) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return true;
    }
    return false;
  }

  // `checkDecoy` gates the expensive per-paragraph isParagraphHiddenAsDecoy
  // check (getComputedStyle + getBoundingClientRect, forces layout) - it's
  // only needed once, on the FINAL extraction, not on every 400ms poll tick
  // while waiting for the page to stabilize. This is safe because decoy CSS
  // is baked into the page's initial HTML (a <style> block already present
  // on load) and never changes while the page sits still, so a paragraph's
  // decoy-hidden status can't flip between ticks - checking it once at the
  // end gives the exact same result as checking it on every tick, just
  // without the repeated layout cost on chapters with many paragraphs.
  function getContentItems(checkDecoy) {
    const container = document.querySelector(CONTENT_SELECTOR);
    if (!container) {
      return [];
    }

    const items = [];
    for (const el of container.querySelectorAll(ITEM_SELECTOR)) {
      // Skip anything not actually visible on the page - the site hides
      // illustration images by default behind a "spoiler" toggle (a
      // "剧透"/reveal vs "隐藏"/hide setting for 插图 chapters, "隐藏" selected
      // by default) by putting them in a display:none container. Capturing
      // only what's visible means we record exactly what the reader sees, and
      // if they click "剧透" to reveal the images before this runs, those
      // become visible (offsetParent !== null) and get captured too.
      if (el.offsetParent === null) {
        continue;
      }

      if (el.tagName === "P") {
        if (checkDecoy && isParagraphHiddenAsDecoy(el)) {
          continue;
        }
        const text = el.innerText.trim();
        if (text) {
          items.push({ type: "text", text });
        }
      } else if (el.tagName === "IMG") {
        const src = el.dataset.src || el.getAttribute("src") || "";
        if (src) {
          items.push({ type: "image", src });
        }
      }
    }
    return items;
  }

  function waitForStableContent(callback) {
    let lastSignature = null;
    let stableCount = 0;
    let elapsed = 0;

    const timer = setInterval(() => {
      // Cheap check while polling (no decoy filtering) - decoy items are a
      // fixed, unchanging subset once the page has loaded, so a signature
      // that's stable including them is exactly as reliable a "content has
      // stopped changing" signal, without paying the layout cost every tick.
      const items = getContentItems(false);
      const signature =
        items.length +
        ":" +
        items.reduce((n, item) => n + (item.text ? item.text.length : item.src.length), 0);

      if (signature === lastSignature) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastSignature = signature;
      elapsed += STABLE_CHECK_INTERVAL_MS;

      if (stableCount >= STABLE_REQUIRED_CHECKS || elapsed >= STABLE_MAX_WAIT_MS) {
        clearInterval(timer);
        // Full check (with decoy filtering) exactly once, now that the
        // content has settled.
        callback(getContentItems(true));
      }
    }, STABLE_CHECK_INTERVAL_MS);
  }

  function run() {
    console.log("[bilinovel-capture:main-world] script running, checking window.ReadParams...");
    const params = window.ReadParams;
    if (!params || !params.chapterid) {
      console.log("[bilinovel-capture:main-world] ReadParams.chapterid not found - stopping.", params);
      return;
    }
    console.log("[bilinovel-capture:main-world] ReadParams OK, chapterid=", params.chapterid, "page=", params.page);

    waitForStableContent((items) => {
      const textCount = items.filter((i) => i.type === "text").length;
      const imageCount = items.filter((i) => i.type === "image").length;
      console.log(
        "[bilinovel-capture:main-world] content is stable, text items =",
        textCount,
        "image items =",
        imageCount,
      );
      if (items.length === 0) {
        console.warn("[bilinovel-capture:main-world] no text or image items found in #acontent - stopping.");
        return;
      }

      const nextHref = params.url_next || "";
      const nextIdRaw = nextHref.split("/").pop().replace(".html", "");
      const nextBaseId = nextIdRaw.replace(/_\d+$/, "");
      const isLastPage = !nextHref || nextBaseId !== params.chapterid;
      const totalPages = parseTotalPages(params);
      console.log("[bilinovel-capture:main-world] parsed total_pages =", totalPages);

      const payload = {
        novel_id: params.articleid,
        chapter_id: params.chapterid,
        title: (params.chaptername || "").trim(),
        page: parseInt(params.page || "1", 10),
        total_pages: totalPages,
        is_last_page: isLastPage,
        items: items,
        captured_at: new Date().toISOString(),
      };

      console.log("[bilinovel-capture:main-world] dispatching", EVENT_NAME, "event for the isolated-world content script");
      document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
    });
  }

  run();
})();
