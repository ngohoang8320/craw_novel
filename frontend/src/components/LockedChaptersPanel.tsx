import { useState } from "react";
import { groupByVolume } from "../lib/volumeGrouping";
import type { Chapter, VolumeLabel } from "../types";
import { Button } from "./Button";

interface LockedChaptersPanelProps {
  chapters: Chapter[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
  /** Re-runs the table-of-contents fetch in place (keeps selection and imported
   * results) - links recovered earlier are remembered, so only the chapters
   * still missing are retried. Throws on failure. */
  onRetry: () => Promise<void>;
  /** Supplies a chapter's link by hand. Throws (with a user-facing message) if
   * the link is rejected. */
  onSetLink: (chapter: Chapter, link: string) => Promise<void>;
}

export function LockedChaptersPanel({
  chapters,
  volumes,
  displayNumbers,
  onRetry,
  onSetLink,
}: LockedChaptersPanelProps) {
  const groups = groupByVolume(chapters, volumes);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await onRetry();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  function toggleEditor(chapterId: string) {
    setSaveError(null);
    setDraft("");
    setEditingId((prev) => (prev === chapterId ? null : chapterId));
  }

  async function saveLink(chapter: Chapter) {
    if (!draft.trim()) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSetLink(chapter, draft.trim());
      setEditingId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[450px] flex-col">
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          <span>⚠️</span>
          <span>Unresolved ({chapters.length})</span>
        </div>
        <Button
          size="sm"
          onClick={retry}
          disabled={retrying || chapters.length === 0}
          title="Try to recover the missing links again. Links found earlier are remembered, so only the missing chapters are retried - your selection and imported results are kept."
        >
          {retrying ? "Retrying..." : "🔄 Retry"}
        </Button>
      </div>
      {retryError && <p className="mb-1 text-xs text-red-600 dark:text-red-400">{retryError}</p>}
      <div className="flex-1 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/40 p-2 text-sm dark:border-amber-800 dark:bg-amber-900/20">
        {chapters.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500">None.</p>
        ) : (
          groups.map((group, groupIdx) => (
            <div key={groupIdx}>
              {group.title && (
                <div className="mt-2 mb-0.5 rounded bg-amber-100/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 first:mt-0 dark:bg-amber-900/30 dark:text-amber-400">
                  {group.title}
                </div>
              )}
              {group.items.map((chapter) => (
                <div key={chapter.chapter_id}>
                  <div className="flex items-start justify-between gap-1 py-0.5">
                    <p className="min-w-0 text-gray-700 dark:text-gray-300">
                      {displayNumbers.get(chapter.chapter_id) ?? chapter.order}. {chapter.title}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Enter this chapter's link by hand"
                      onClick={() => toggleEditor(chapter.chapter_id)}
                    >
                      🔗
                    </Button>
                  </div>
                  {editingId === chapter.chapter_id && (
                    <div className="mb-1 flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveLink(chapter)}
                        placeholder="Chapter link or id"
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <div className="flex gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => saveLink(chapter)}
                          disabled={saving || !draft.trim()}
                        >
                          {saving ? "Saving..." : "Set"}
                        </Button>
                        <Button size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                      {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
