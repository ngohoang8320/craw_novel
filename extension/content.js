// Runs in the "isolated world" (has access to chrome.runtime.*) - can't read
// window.ReadParams directly, so it only listens for the event dispatched by
// page_bridge.js (running in the main world), then forwards it to the
// background script.
(function () {
  const EVENT_NAME = "bilinovel-capture-ready";
  const SEND_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 400;

  console.log("[bilinovel-capture] content script (isolated world) ready, listening for", EVENT_NAME);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // MV3 service workers can be asleep when this fires and Chrome sometimes
  // fails to wake them up in time for the very first message, closing the
  // port with "Could not establish connection" / "message port closed before
  // a response was received" even though nothing is actually wrong. Retrying
  // is safe here (not just papering over the error): the backend merges a
  // captured page by page number (routers/capture_ingest.py ->
  // save_captured_page), so re-sending the exact same payload just overwrites
  // that page with the same content - never a duplicate, never lost data.
  async function sendCaptureChapter(payload) {
    for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CAPTURE_CHAPTER", payload }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false, error: "no response" });
        });
      });

      if (response.ok) {
        console.log("[bilinovel-capture] background responded:", response);
        return;
      }

      console.warn(
        `[bilinovel-capture] sendMessage attempt ${attempt}/${SEND_ATTEMPTS} failed:`,
        response.error,
      );
      if (attempt < SEND_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }

    console.error("[bilinovel-capture] all sendMessage attempts failed - capture not saved for this page.");
  }

  document.addEventListener(EVENT_NAME, (event) => {
    const payload = event.detail;
    if (!payload) {
      console.warn("[bilinovel-capture] received event with no payload.");
      return;
    }

    console.log("[bilinovel-capture] received payload from page_bridge, sending CAPTURE_CHAPTER to background:", {
      novel_id: payload.novel_id,
      chapter_id: payload.chapter_id,
      page: payload.page,
      item_count: payload.items ? payload.items.length : 0,
    });

    sendCaptureChapter(payload);
  });
})();
