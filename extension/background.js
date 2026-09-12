const SERVER_URL = "http://localhost:8765/capture";

console.log("[bilinovel-capture] background service worker started, SERVER_URL =", SERVER_URL);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CAPTURE_CHAPTER") {
    return false;
  }

  console.log("[bilinovel-capture] background received CAPTURE_CHAPTER from tab", sender.tab && sender.tab.id);

  const tabId = sender.tab ? sender.tab.id : undefined;

  fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.payload),
  })
    .then((res) => {
      console.log("[bilinovel-capture] fetch to capture_server returned status", res.status);
      return res.json();
    })
    .then((data) => {
      console.log("[bilinovel-capture] capture_server responded:", data);
      if (tabId !== undefined) {
        chrome.action.setBadgeBackgroundColor({ color: "#2e7d32", tabId });
        chrome.action.setBadgeText({ text: "OK", tabId });
      }
      sendResponse({ ok: true, data: data });
    })
    .catch((err) => {
      console.error(
        "[bilinovel-capture] fetch to capture_server FAILED (is the server running on port 8765?):",
        err
      );
      if (tabId !== undefined) {
        chrome.action.setBadgeBackgroundColor({ color: "#c62828", tabId });
        chrome.action.setBadgeText({ text: "ERR", tabId });
      }
      sendResponse({ ok: false, error: String(err) });
    });

  return true; // tell Chrome/Edge that sendResponse will be called asynchronously
});
