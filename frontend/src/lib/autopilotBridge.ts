import type { Chapter } from "../types";

export const AUTOPILOT_SYNC_EVENT = "bilinovel-autopilot-sync";

export interface AutopilotQueueEntry {
  chapter_id: string;
  url: string;
  order: number;
}

/** Pushes the given chapters (in order) to the Auto-Pilot extension's
 * content script (extension-autopilot/webapp_bridge.js), which forwards them
 * to the extension's background script to drive automatic page/chapter
 * navigation. Chapters without a resolved `url` are skipped - Auto-Pilot has
 * nowhere to navigate them to. */
export function syncAutopilotQueue(novelId: string, chapters: Chapter[]): void {
  const queue: AutopilotQueueEntry[] = chapters
    .filter((c): c is Chapter & { url: string } => c.url !== null)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ chapter_id: c.chapter_id, url: c.url, order: c.order }));

  document.dispatchEvent(
    new CustomEvent(AUTOPILOT_SYNC_EVENT, {
      detail: { novel_id: novelId, queue },
    }),
  );
}

export const AUTOPILOT_CHAIN_EVENT = "bilinovel-autopilot-chain";

export interface AutopilotChainEntry {
  novel_id: string;
  // null while this novel's own TOC fetch/sync (from the Batch queue view)
  // hasn't finished yet - Auto-Pilot waits for it to show up instead of
  // giving up, so finishing an earlier, fast novel never races ahead of a
  // later one that's still being fetched.
  url: string | null;
}

/** Tells Auto-Pilot the order to move through several novels' queues - once a
 * novel's own queue finishes, it opens the next entry's `url` (that novel's
 * first synced chapter) automatically instead of just stopping. Pass the
 * full chain every time it changes (including entries not synced yet, with
 * `url: null`) - it replaces whatever was stored before. Used by the Batch
 * queue view - a plain single-novel sync should call `clearAutopilotChain()`
 * instead, so it never inherits a leftover chain from an earlier batch run. */
export function syncAutopilotChain(chain: AutopilotChainEntry[]): void {
  document.dispatchEvent(new CustomEvent(AUTOPILOT_CHAIN_EVENT, { detail: { chain } }));
}

/** Clears any batch chain Auto-Pilot is holding, so finishing this novel's
 * queue just stops instead of jumping to a novel queued in an earlier batch
 * run. */
export function clearAutopilotChain(): void {
  syncAutopilotChain([]);
}
