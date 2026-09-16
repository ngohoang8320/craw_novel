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
