import { useEffect, useRef } from "react";
import { useNovelToc } from "../hooks/useNovelToc";
import { syncAutopilotQueue } from "../lib/autopilotBridge";
import type { Chapter, VolumeLabel } from "../types";
import type { ConfirmDialogState } from "./ConfirmDialog";
import { NovelWorkspace } from "./NovelWorkspace";

interface BatchNovelDetailProps {
  novelId: string;
  confirm: (state: ConfirmDialogState) => void;
  /** Reports this novel's TOC back up to the Batch queue row whenever it
   * changes (initial load, Retry, manual link, discard) - keeps the row's
   * summary (counts, title, first-chapter link used for the Auto-Pilot
   * chain) in sync with whatever this detail view resolves. */
  onTocChange: (chapters: Chapter[], volumes: VolumeLabel[], novelAuthor: string, novelTitle: string | null) => void;
}

/** Per-novel workspace shown inline inside a Batch queue row - identical to
 * the single-novel view (via the shared `NovelWorkspace`/`useNovelToc`), the
 * only differences being that every resolved chapter is auto-selected on
 * first load (batch philosophy: queue everything, don't make the user
 * re-pick it), and re-syncing to Auto-Pilot here does NOT clear the batch
 * chain (unlike the single-novel view's button), since this novel is
 * presumably still part of one. */
export function BatchNovelDetail({ novelId, confirm, onTocChange }: BatchNovelDetailProps) {
  const novel = useNovelToc(novelId);
  const didAutoSelect = useRef(false);

  useEffect(() => {
    if (!didAutoSelect.current && novel.toc.length > 0) {
      novel.selectAll();
      didAutoSelect.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel.toc]);

  useEffect(() => {
    if (novel.toc.length > 0) {
      onTocChange(novel.toc, novel.volumes, novel.novelAuthor, novel.novelTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel.toc, novel.volumes, novel.novelAuthor, novel.novelTitle]);

  if (novel.loading && novel.toc.length === 0) {
    return <p className="border-t border-gray-200 pt-3 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">Loading...</p>;
  }

  if (novel.error && novel.toc.length === 0) {
    return <p className="border-t border-gray-200 pt-3 text-sm text-red-600 dark:border-gray-700 dark:text-red-400">{novel.error}</p>;
  }

  if (novel.toc.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
      <NovelWorkspace
        novelId={novelId}
        toc={novel.toc}
        volumes={novel.volumes}
        novelAuthor={novel.novelAuthor}
        lockedChapters={novel.lockedChapters}
        unlockedChapters={novel.unlockedChapters}
        selectedIds={novel.selectedIds}
        selectedChapters={novel.selectedChapters}
        onToggle={novel.toggleChapter}
        onSelectAll={novel.selectAll}
        onDeselectAll={novel.deselectAll}
        onSelectGroup={novel.selectGroup}
        onDeselectGroup={novel.deselectGroup}
        onRetryUnresolved={novel.retryUnresolved}
        onSetManualLink={novel.setManualLink}
        onForgetRecovered={novel.forgetRecovered}
        confirm={confirm}
        onSyncAutopilot={() => syncAutopilotQueue(novelId, novel.selectedChapters)}
      />
    </div>
  );
}
