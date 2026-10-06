// Runs on the web app's own page (http://localhost:5173/*). Listens for the
// app dispatching a "bilinovel-autopilot-sync" event with the ordered list of
// selected chapters, and stores it for autopilot.js (running on
// bilinovel.com pages) to read. chrome.storage.local is a per-extension
// bucket shared across all of this extension's contexts regardless of which
// page/origin they run on, so no messaging round-trip is needed here.
(function () {
  const EVENT_NAME = "bilinovel-autopilot-sync";
  const CHAIN_EVENT_NAME = "bilinovel-autopilot-chain";

  document.addEventListener(EVENT_NAME, (event) => {
    const detail = event.detail;
    if (!detail || !detail.novel_id || !Array.isArray(detail.queue)) {
      console.warn("[autopilot] received malformed sync event:", detail);
      return;
    }

    const novelId = detail.novel_id;
    chrome.storage.local.set(
      {
        [`queue_${novelId}`]: detail.queue,
        [`state_${novelId}`]: { status: "idle", currentChapterId: null, message: null, updatedAt: Date.now() },
      },
      () => {
        console.log(`[autopilot] synced ${detail.queue.length} chapters for novel ${novelId}.`);
      },
    );
  });

  // The ordered list of {novel_id, url} Auto-Pilot should move through
  // automatically: once a novel's own queue finishes, it opens the next
  // entry's url instead of just stopping. Sent whole (replacing whatever was
  // there before) - empty/absent clears it, so a plain single-novel sync
  // never gets unexpectedly chained to an old batch run.
  document.addEventListener(CHAIN_EVENT_NAME, (event) => {
    const detail = event.detail;
    if (!detail || !Array.isArray(detail.chain)) {
      console.warn("[autopilot] received malformed chain event:", detail);
      return;
    }
    chrome.storage.local.set({ batch_chain: detail.chain }, () => {
      console.log(`[autopilot] batch chain updated: ${detail.chain.length} novel(s).`);
    });
  });
})();
