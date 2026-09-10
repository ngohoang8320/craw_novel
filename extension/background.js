const SERVER_URL = "http://localhost:8765/capture";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CAPTURE_CHAPTER") {
    return false;
  }

  const tabId = sender.tab ? sender.tab.id : undefined;

  fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.payload),
  })
    .then((res) => res.json())
    .then((data) => {
      if (tabId !== undefined) {
        chrome.action.setBadgeBackgroundColor({ color: "#2e7d32", tabId });
        chrome.action.setBadgeText({ text: "OK", tabId });
      }
      sendResponse({ ok: true, data: data });
    })
    .catch((err) => {
      if (tabId !== undefined) {
        chrome.action.setBadgeBackgroundColor({ color: "#c62828", tabId });
        chrome.action.setBadgeText({ text: "ERR", tabId });
      }
      sendResponse({ ok: false, error: String(err) });
    });

  return true; // bao cho Chrome biet sendResponse se goi bat dong bo
});
