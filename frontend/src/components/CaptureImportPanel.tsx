import { Button } from "./Button";
import { formatPageRanges } from "../lib/pageRanges";
import { groupByVolume } from "../lib/volumeGrouping";
import type { CapturedChapter, Chapter, VolumeLabel } from "../types";

interface CaptureImportPanelProps {
  selectedChapters: Chapter[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
  captures: CapturedChapter[];
  onImport: () => void;
  onRefresh: () => void;
  /** Sends the selected chapters (in order) to the Auto-Pilot extension.
   * Left to the caller so it can decide whether to also clear/keep a Batch
   * queue chain (see `autopilotBridge.ts`). */
  onSyncAutopilot: () => void;
}

export function CaptureImportPanel({
  selectedChapters,
  volumes,
  displayNumbers,
  captures,
  onImport,
  onRefresh,
  onSyncAutopilot,
}: CaptureImportPanelProps) {
  const capturedCount = captures.filter((c) => c.captured).length;
  const completeCount = captures.filter((c) => c.captured && c.is_complete).length;
  const groups = groupByVolume(selectedChapters, volumes);

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">
        Import content captured by the extension
      </h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Load the extension from the extension/ folder (see README), run the backend, then open each
        selected chapter in your real browser — the content is saved automatically. This app refreshes
        the captured status when you switch back to this tab, or you can refresh it manually below.
      </p>
      <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
        Captured: <strong>{capturedCount}/{selectedChapters.length}</strong> selected chapters (
        {completeCount} fully captured)
      </p>
      {selectedChapters.length > 0 && (
        <div className="mb-3 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-gray-400">
          {groups.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.title && (
                <div className="mt-2 mb-0.5 rounded bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 first:mt-0 dark:bg-gray-700 dark:text-gray-400">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((chapter) => {
                  const captured = captures.find((c) => c.chapter_id === chapter.chapter_id);
                  let status: string;
                  if (!captured || !captured.captured) {
                    status = "not captured yet";
                  } else if (captured.is_complete) {
                    status = "✅ complete";
                  } else if (captured.total_pages) {
                    const missing = captured.missing_pages ?? [];
                    status = `⚠️ ${captured.page_count ?? 0}/${captured.total_pages} pages${
                      missing.length > 0 ? ` — missing ${formatPageRanges(missing)}` : ""
                    }`;
                  } else {
                    const missing = captured.missing_pages ?? [];
                    status = `⚠️ ${captured.page_count ?? 0} page(s) so far, more may remain${
                      missing.length > 0 ? ` (gap at ${formatPageRanges(missing)})` : ""
                    }`;
                  }
                  return (
                    <li key={chapter.chapter_id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {displayNumbers.get(chapter.chapter_id) ?? chapter.order}. {chapter.title}
                      </span>
                      <span className="shrink-0">{status}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onClick={onImport} disabled={capturedCount === 0}>
          Import captured content ({capturedCount})
        </Button>
        <Button onClick={onRefresh} disabled={selectedChapters.length === 0}>
          🔄 Refresh captured status
        </Button>
        <Button
          onClick={onSyncAutopilot}
          disabled={selectedChapters.length === 0}
          title="Sends the selected chapters (in order) to the Auto-Pilot extension, which then automatically advances pages/chapters after the capture extension saves each one. Requires extension-autopilot to be loaded."
        >
          🚀 Sync to Auto-Pilot
        </Button>
      </div>
    </div>
  );
}
