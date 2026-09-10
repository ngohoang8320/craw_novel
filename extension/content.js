// Chạy trên trang chapter đang mở bằng trình duyệt thật của bạn. Chỉ ĐỌC LẠI
// nội dung đã render sẵn trên trang (giống như bạn tự xem bằng mắt), không tự
// điều hướng, không tự động mở trang nào khác.
(function () {
  const CONTENT_SELECTOR = "#acontent p";
  const STABLE_CHECK_INTERVAL_MS = 400;
  const STABLE_REQUIRED_CHECKS = 3;
  const STABLE_MAX_WAIT_MS = 8000;

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

  function capture() {
    const params = window.ReadParams;
    if (!params || !params.chapterid) {
      return; // khong phai trang chapter hop le (vd trang thong tin volume)
    }

    waitForStableContent((paragraphs) => {
      if (paragraphs.length === 0) {
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

      chrome.runtime.sendMessage({ type: "CAPTURE_CHAPTER", payload: payload });
    });
  }

  capture();
})();
