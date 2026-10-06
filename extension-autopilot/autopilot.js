// Runs in the isolated world on every bilinovel.com chapter page. Watches for
// the (separate) capture extension to finish saving the current page, then -
// after a randomized human-like delay - navigates to the next page (within
// the same chapter) or the next chapter in the synced queue (skipping over
// any chapter the user didn't select). Does nothing on a page whose chapter
// isn't in the synced queue, so manual browsing/capturing is never affected.
//
// Once a novel's own queue finishes, it also checks `batch_chain` (set by the
// web app's Batch queue view via webapp_bridge.js) for the next novel to
// start - letting several novels queued from the batch view run back-to-back
// without opening each one's first chapter by hand.
(function () {
  const CAPTURE_READY_EVENT = "bilinovel-capture-ready"; // dispatched by the capture extension
  const NEXTURL_EVENT = "bilinovel-autopilot-nexturl";
  const REQUEST_NEXTURL_EVENT = "bilinovel-autopilot-request-nexturl";
  const BATCH_CHAIN_KEY = "batch_chain";
  const MIN_DELAY_MS = 1500;
  const MAX_DELAY_MS = 2500;
  const CAPTURE_TIMEOUT_MS = 15000;
  const NEXTURL_TIMEOUT_MS = 5000;
  const BATCH_CHAIN_POLL_INTERVAL_MS = 1000;
  const BATCH_CHAIN_POLL_TIMEOUT_MS = 300000; // 5 minutes

  // Registered immediately, before any async storage reads below, so a
  // capture-ready event firing while we're still checking the queue isn't
  // missed.
  const captureReadyPromise = new Promise((resolve) => {
    document.addEventListener(CAPTURE_READY_EVENT, (event) => resolve(event.detail), { once: true });
  });

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomDelay() {
    return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  }

  // Bounded (unlike a plain wait) so a page_bridge.js that never responds -
  // script error, page not fully loaded, anything - can't hang the whole run
  // forever. Resolves to null on timeout, same as "couldn't read the URL".
  function fetchNextUrl() {
    return new Promise((resolve) => {
      let settled = false;

      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        document.removeEventListener(NEXTURL_EVENT, handler);
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        resolve(value);
      }

      function handler(event) {
        finish(event.detail ? event.detail.url_next : null);
      }

      document.addEventListener(NEXTURL_EVENT, handler);
      const pollTimer = setInterval(() => {
        document.dispatchEvent(new CustomEvent(REQUEST_NEXTURL_EVENT));
      }, 200);
      const timeoutTimer = setTimeout(() => finish(null), NEXTURL_TIMEOUT_MS);
      document.dispatchEvent(new CustomEvent(REQUEST_NEXTURL_EVENT));
    });
  }

  function getNovelIdFromUrl() {
    const match = location.pathname.match(/^\/novel\/(\d+)\//);
    return match ? match[1] : null;
  }

  function getChapterIdFromUrl() {
    const match = location.pathname.match(/\/(\d+)(?:_\d+)?\.html$/);
    return match ? match[1] : null;
  }

  async function getQueue(novelId) {
    const key = `queue_${novelId}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  }

  async function getState(novelId) {
    const key = `state_${novelId}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || { status: "idle" };
  }

  async function setState(novelId, patch) {
    const key = `state_${novelId}`;
    const existing = await getState(novelId);
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    await chrome.storage.local.set({ [key]: next });
    return next;
  }

  function getCaptureStatus(novelId, chapterId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "AUTOPILOT_GET_CAPTURE_STATUS", novel_id: novelId, chapter_id: chapterId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("[autopilot] status message failed:", chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(response ? response.entry : null);
        },
      );
    });
  }

  // bilinovel-capture-ready fires as soon as the capture extension has
  // EXTRACTED the content - not once it's actually saved (that POST to the
  // backend happens afterward, asynchronously, in a completely separate
  // extension). So the first confirmation check can easily run before the
  // save has landed. A short head-start delay before the FIRST check lets
  // that near-certain save (usually well under 500ms on localhost) land
  // first, so the common case needs zero retries instead of wasting 1-2
  // round trips; the retry loop stays as a safety net for the slow case.
  // Total worst-case wait is unchanged (~4s) from before this head-start was
  // added, just front-loaded instead of spent on near-guaranteed-to-fail
  // early attempts.
  // `page_count` is a COUNT of pages captured, not the highest page number -
  // if earlier pages were captured out of order, page_count could already be
  // >= page even though `page` itself was never captured, so this checks
  // `missing_pages` (computed server-side) instead, which correctly reflects
  // whether this exact page number is missing regardless of gaps elsewhere.
  async function confirmPageCapturedWithRetries(novelId, chapterId, page, attempts = 7, intervalMs = 500) {
    await sleep(500);
    for (let i = 0; i < attempts; i++) {
      const entry = await getCaptureStatus(novelId, chapterId);
      const missingPages = (entry && entry.missing_pages) || [];
      if (entry && entry.captured && !missingPages.includes(page)) {
        return true;
      }
      await sleep(intervalMs);
    }
    return false;
  }

  async function isChapterAlreadyComplete(novelId, chapterId) {
    const entry = await getCaptureStatus(novelId, chapterId);
    return !!(entry && entry.captured && entry.is_complete);
  }

  // Walks the queue forward from `fromIdx` looking for the next chapter that
  // ISN'T already fully captured - lets a re-sync that mixes already-done
  // chapters with new ones skip straight past the done ones instead of
  // reloading and re-waiting on each one.
  async function findNextIncompleteEntry(novelId, queue, fromIdx) {
    for (let idx = fromIdx; idx < queue.length; idx++) {
      if (!(await isChapterAlreadyComplete(novelId, queue[idx].chapter_id))) {
        return queue[idx];
      }
    }
    return null;
  }

  // Called right after a novel's queue is marked "done". If that novel is
  // part of a batch chain and has a next entry, navigates there to continue
  // automatically; otherwise does nothing (same as before this existed).
  //
  // The next entry's `url` can be null for a short while: the Batch queue
  // view pushes the chain's SHAPE (every queued novel, in order) as soon as
  // processing starts, but fills in each entry's url only once THAT novel's
  // own TOC fetch/sync finishes - which can easily still be running if this
  // novel is short and finishes capturing fast. So this polls for a bit
  // instead of giving up the instant it sees a not-yet-ready entry.
  async function advanceToNextQueuedNovel(novelId) {
    const deadline = Date.now() + BATCH_CHAIN_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = await chrome.storage.local.get(BATCH_CHAIN_KEY);
      const chain = result[BATCH_CHAIN_KEY] || [];
      const idx = chain.findIndex((entry) => entry.novel_id === novelId);
      if (idx === -1) {
        return; // this novel isn't (or is no longer) part of a chain
      }
      const next = chain[idx + 1];
      if (!next) {
        return; // this is the last novel in the chain
      }
      if (next.url) {
        console.log(`[autopilot] novel ${novelId} finished - advancing to the next queued novel (${next.novel_id}).`);
        window.location.href = next.url;
        return;
      }
      console.log(`[autopilot] waiting for novel ${next.novel_id}'s queue to be ready...`);
      await sleep(BATCH_CHAIN_POLL_INTERVAL_MS);
    }
    console.warn(`[autopilot] gave up waiting for the next queued novel after finishing ${novelId}.`);
  }

  async function run() {
    const novelId = getNovelIdFromUrl();
    const chapterId = getChapterIdFromUrl();
    if (!novelId || !chapterId) {
      return;
    }

    const queue = await getQueue(novelId);
    const currentIdx = queue.findIndex((entry) => entry.chapter_id === chapterId);
    if (currentIdx === -1) {
      console.log("[autopilot] this chapter isn't in the synced queue - leaving this page alone.");
      return;
    }

    const state = await getState(novelId);
    if (state.status === "stopped" || state.status === "done" || state.status === "error") {
      console.log(`[autopilot] run status is "${state.status}" - doing nothing until re-synced/restarted.`);
      return;
    }

    // If this chapter was already fully captured before (e.g. a re-sync that
    // mixes already-done chapters with new ones), skip it entirely instead
    // of waiting for a pointless re-capture.
    if (await isChapterAlreadyComplete(novelId, chapterId)) {
      console.log(`[autopilot] chapter ${chapterId} is already complete - skipping ahead.`);
      const nextEntry = await findNextIncompleteEntry(novelId, queue, currentIdx + 1);
      if (!nextEntry) {
        await setState(novelId, { status: "done" });
        console.log("[autopilot] queue finished (remaining chapters were already complete).");
        await advanceToNextQueuedNovel(novelId);
        return;
      }
      await setState(novelId, { status: "running", currentChapterId: nextEntry.chapter_id, message: null });
      window.location.href = nextEntry.url;
      return;
    }

    await setState(novelId, { status: "running", currentChapterId: chapterId, message: null });
    console.log(`[autopilot] watching chapter ${chapterId} for capture completion...`);

    const captureDetail = await Promise.race([captureReadyPromise, sleep(CAPTURE_TIMEOUT_MS).then(() => null)]);
    if (!captureDetail) {
      await setState(novelId, {
        status: "error",
        message: "Timed out waiting for the capture extension - is it installed and enabled?",
      });
      console.warn("[autopilot] timed out waiting for bilinovel-capture-ready.");
      return;
    }

    const confirmed = await confirmPageCapturedWithRetries(novelId, captureDetail.chapter_id, captureDetail.page);
    if (!confirmed) {
      await setState(novelId, {
        status: "error",
        message: `Backend didn't confirm chapter ${captureDetail.chapter_id} page ${captureDetail.page} was saved.`,
      });
      console.warn("[autopilot] backend did not confirm the capture - stopping.");
      return;
    }

    // Re-check right before the delay and again right before navigating, in
    // case the user hit Stop in the popup while we were waiting/confirming.
    if ((await getState(novelId)).status === "stopped") {
      console.log("[autopilot] stopped by user - not navigating.");
      return;
    }

    await sleep(randomDelay());

    if ((await getState(novelId)).status === "stopped") {
      console.log("[autopilot] stopped by user during delay - not navigating.");
      return;
    }

    if (!captureDetail.is_last_page) {
      const urlNext = await fetchNextUrl();
      if (urlNext) {
        window.location.href = urlNext;
      } else {
        await setState(novelId, { status: "error", message: "Could not read the next page URL from this chapter." });
      }
      return;
    }

    const nextEntry = await findNextIncompleteEntry(novelId, queue, currentIdx + 1);
    if (!nextEntry) {
      await setState(novelId, { status: "done" });
      console.log("[autopilot] queue finished.");
      await advanceToNextQueuedNovel(novelId);
      return;
    }

    window.location.href = nextEntry.url;
  }

  run();
})();
