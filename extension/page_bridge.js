// Runs in the "main world" (the same JS context as the page) so it can read the
// window.ReadParams variable the page creates itself - an isolated-world content
// script can't see this variable. This script ONLY READS the DOM/JS variables
// already present on the page; it never navigates or opens any other page.
(function () {
  const CONTENT_SELECTOR = "#acontent p";
  const STABLE_CHECK_INTERVAL_MS = 400;
  const STABLE_REQUIRED_CHECKS = 3;
  const STABLE_MAX_WAIT_MS = 8000;
  const EVENT_NAME = "bilinovel-capture-ready";

  function getParagraphs() {
    return Array.from(document.querySelectorAll(CONTENT_SELECTOR))
      .map((p) => p.innerText.trim())
      .filter(Boolean);
  }

  function waitForStableContent(callback) {
    let lastSignature = null;
    let stableCount = 0;
    let elapsed = 0;

    const timer = setInterval(() => {
      const paragraphs = getParagraphs();
      const signature =
        paragraphs.length + ":" + paragraphs.reduce((n, p) => n + p.length, 0);

      if (signature === lastSignature) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastSignature = signature;
      elapsed += STABLE_CHECK_INTERVAL_MS;

      if (stableCount >= STABLE_REQUIRED_CHECKS || elapsed >= STABLE_MAX_WAIT_MS) {
        clearInterval(timer);
        callback(getParagraphs());
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

    waitForStableContent((paragraphs) => {
      console.log("[bilinovel-capture:main-world] content is stable, paragraph count =", paragraphs.length);
      if (paragraphs.length === 0) {
        console.warn("[bilinovel-capture:main-world] no paragraphs found in #acontent p - stopping.");
        return;
      }

      const nextHref = params.url_next || "";
      const nextIdRaw = nextHref.split("/").pop().replace(".html", "");
      const nextBaseId = nextIdRaw.replace(/_\d+$/, "");
      const isLastPage = !nextHref || nextBaseId !== params.chapterid;

      const payload = {
        novel_id: params.articleid,
        chapter_id: params.chapterid,
        title: (params.chaptername || "").trim(),
        page: parseInt(params.page || "1", 10),
        is_last_page: isLastPage,
        paragraphs: paragraphs,
        captured_at: new Date().toISOString(),
      };

      console.log("[bilinovel-capture:main-world] dispatching", EVENT_NAME, "event for the isolated-world content script");
      document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
    });
  }

  run();
})();
