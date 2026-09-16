// Lists every novel Auto-Pilot has a synced queue/state for (there's no
// concept of a single "current" novel - the user may have synced more than
// one over time). Novels that are still running or waiting to run show up in
// the main list with a Stop button; ones that are stopped/done/error are
// tucked away in a collapsed "History" section instead, so a popup click
// isn't cluttered with runs that aren't actually doing anything anymore.
const INACTIVE_STATUSES = new Set(["stopped", "done", "error"]);

function buildRunBlock(all, novelId, { showStop }) {
  const state = all[`state_${novelId}`] || {};
  const queue = all[`queue_${novelId}`] || [];
  const idx = queue.findIndex((entry) => entry.chapter_id === state.currentChapterId);
  const position = idx >= 0 ? `${idx + 1}/${queue.length}` : `-/${queue.length}`;

  const block = document.createElement("div");
  block.className = "run";

  const rows = document.createElement("div");
  rows.innerHTML = `
    <div class="row"><span class="label">Novel:</span> <span class="value">${novelId}</span></div>
    <div class="row"><span class="label">Status:</span> <span class="value">${state.status ?? "idle"}</span></div>
    <div class="row"><span class="label">Position:</span> <span class="value">${position}</span></div>
  `;
  block.appendChild(rows);

  if (state.message) {
    const errorEl = document.createElement("div");
    errorEl.className = "error-message";
    errorEl.textContent = state.message;
    block.appendChild(errorEl);
  }

  if (showStop) {
    const stopBtn = document.createElement("button");
    stopBtn.textContent = "Stop";
    stopBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({
        [`state_${novelId}`]: { ...state, status: "stopped", updatedAt: Date.now() },
      });
      render();
    });
    block.appendChild(stopBtn);
  } else {
    const removeBtn = document.createElement("button");
    removeBtn.className = "secondary-btn";
    removeBtn.textContent = "Remove from history";
    removeBtn.addEventListener("click", async () => {
      await chrome.storage.local.remove([`state_${novelId}`, `queue_${novelId}`]);
      render();
    });
    block.appendChild(removeBtn);
  }

  return block;
}

async function render() {
  const all = await chrome.storage.local.get(null);
  const content = document.getElementById("content");
  const historySection = document.getElementById("historySection");
  const historyContent = document.getElementById("historyContent");
  const historyCount = document.getElementById("historyCount");

  const novelIds = Object.keys(all)
    .filter((key) => key.startsWith("state_"))
    .map((key) => key.slice("state_".length));

  const activeIds = [];
  const historyIds = [];
  for (const novelId of novelIds) {
    const status = (all[`state_${novelId}`] || {}).status;
    (INACTIVE_STATUSES.has(status) ? historyIds : activeIds).push(novelId);
  }

  content.innerHTML = "";
  if (activeIds.length === 0) {
    content.innerHTML = '<p id="empty">No active run right now - use "Sync to Auto-Pilot" in the web app first.</p>';
  } else {
    for (const novelId of activeIds) {
      content.appendChild(buildRunBlock(all, novelId, { showStop: true }));
    }
  }

  historyContent.innerHTML = "";
  for (const novelId of historyIds) {
    historyContent.appendChild(buildRunBlock(all, novelId, { showStop: false }));
  }
  historyCount.textContent = String(historyIds.length);
  historySection.hidden = historyIds.length === 0;
}

document.getElementById("clearHistoryBtn").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = [];
  for (const key of Object.keys(all)) {
    if (!key.startsWith("state_")) {
      continue;
    }
    const novelId = key.slice("state_".length);
    if (INACTIVE_STATUSES.has((all[key] || {}).status)) {
      keysToRemove.push(`state_${novelId}`, `queue_${novelId}`);
    }
  }
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  render();
});

render();
