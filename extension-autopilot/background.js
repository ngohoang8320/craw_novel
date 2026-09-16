// Relays backend reads for content scripts (matches the existing capture
// extension's pattern of doing cross-origin fetches from the background
// service worker rather than directly from a content script).
const BACKEND_URL = "http://localhost:8000";

function fetchCaptureStatus(novelId, chapterId) {
  const url = `${BACKEND_URL}/api/novels/${encodeURIComponent(novelId)}/captures?chapter_ids=${encodeURIComponent(chapterId)}`;
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data && data.chapters && data.chapters[0]) || null)
    .catch((err) => {
      console.warn("[autopilot-bg] capture status fetch failed:", err);
      return null;
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "AUTOPILOT_GET_CAPTURE_STATUS") {
    return false;
  }

  fetchCaptureStatus(message.novel_id, message.chapter_id).then((entry) => {
    sendResponse({ entry });
  });

  return true; // sendResponse is called asynchronously
});
