// Runs in the "isolated world" (has access to chrome.runtime.*) - can't read
// window.ReadParams directly, so it only listens for the event dispatched by
// page_bridge.js (running in the main world), then forwards it to the
// background script.
(function () {
  const EVENT_NAME = "bilinovel-capture-ready";

  console.log("[bilinovel-capture] content script (isolated world) ready, listening for", EVENT_NAME);

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
      paragraph_count: payload.paragraphs ? payload.paragraphs.length : 0,
    });

    chrome.runtime.sendMessage({ type: "CAPTURE_CHAPTER", payload: payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[bilinovel-capture] sendMessage error (the background script may not be running):",
          chrome.runtime.lastError.message
        );
        return;
      }
      console.log("[bilinovel-capture] background responded:", response);
    });
  });
})();
