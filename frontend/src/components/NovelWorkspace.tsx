import { useNovelCapture } from "../hooks/useNovelCapture";
import type { Chapter, VolumeLabel } from "../types";
import { CaptureImportPanel } from "./CaptureImportPanel";
import { ChapterList } from "./ChapterList";
import type { ConfirmDialogState } from "./ConfirmDialog";
import { CrawlResultsList } from "./CrawlResultsList";
import { EpubBuildPanel } from "./EpubBuildPanel";
import { LockedChaptersPanel } from "./LockedChaptersPanel";
import { SelectedChapterLinks } from "./SelectedChapterLinks";

interface NovelWorkspaceProps {
  novelId: string;
  toc: Chapter[];
  volumes: VolumeLabel[];
  novelAuthor: string;
  lockedChapters: Chapter[];
  unlockedChapters: Chapter[];
  selectedIds: Set<string>;
  selectedChapters: Chapter[];
  onToggle: (chapterId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectGroup: (chapterIds: string[]) => void;
  onDeselectGroup: (chapterIds: string[]) => void;
  onRetryUnresolved: () => Promise<void>;
  onSetManualLink: (chapter: Chapter, link: string) => Promise<void>;
  onForgetRecovered: (chapter: Chapter) => void | Promise<void>;
  onSyncAutopilot: () => void;
  confirm: (state: ConfirmDialogState) => void;
}

/** The full per-novel workspace once its table of contents is loaded: the
 * chapter list (with selection and the Unresolved/Retry/manual-link panel),
 * the chapter links for the current selection, capture-status tracking +
 * import, crawl results, and EPUB building. Used as-is by both the
 * single-novel view and the Batch queue view's per-novel detail, so the two
 * never drift apart feature-wise. */
export function NovelWorkspace({
  novelId,
  toc,
  volumes,
  novelAuthor,
  lockedChapters,
  unlockedChapters,
  selectedIds,
  selectedChapters,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onSelectGroup,
  onDeselectGroup,
  onRetryUnresolved,
  onSetManualLink,
  onForgetRecovered,
  onSyncAutopilot,
  confirm,
}: NovelWorkspaceProps) {
  const {
    captures,
    refreshCaptures,
    results,
    handleImport,
    handleDeleteChapters,
    handleDeleteChapter,
    resultGroups,
    displayNumbers,
    handleBuildEpub,
  } = useNovelCapture(novelId, toc, selectedChapters, volumes);

  return (
    <>
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Table of contents{" "}
            <span className="font-normal text-gray-400 dark:text-gray-500">({toc.length} chapters)</span>
          </h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {selectedChapters.length}/{unlockedChapters.length} selected
          </span>
        </div>

        <div className="grid grid-cols-[3fr_1fr] gap-4">
          <ChapterList
            chapters={unlockedChapters}
            volumes={volumes}
            displayNumbers={displayNumbers}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            onSelectGroup={onSelectGroup}
            onDeselectGroup={onDeselectGroup}
            onForgetRecovered={(chapter) =>
              confirm({
                message: `Discard the recovered link for "${chapter.title}"? It goes back to Unresolved - use Retry to recover it again, or enter its link by hand. Any content already captured for it stays on disk.`,
                onConfirm: () => onForgetRecovered(chapter),
                confirmLabel: "Discard link",
                danger: true,
              })
            }
          />
          <LockedChaptersPanel
            chapters={lockedChapters}
            volumes={volumes}
            displayNumbers={displayNumbers}
            onRetry={onRetryUnresolved}
            onSetLink={onSetManualLink}
          />
        </div>

        {lockedChapters.length > 0 && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {lockedChapters.length} chapters excluded (unresolved link) - use Retry, or enter the link by hand (🔗),
            in the Unresolved panel.
          </p>
        )}

        <div className="mt-3">
          <SelectedChapterLinks chapters={selectedChapters} volumes={volumes} displayNumbers={displayNumbers} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <CaptureImportPanel
          selectedChapters={selectedChapters}
          volumes={volumes}
          displayNumbers={displayNumbers}
          captures={captures}
          onImport={handleImport}
          onRefresh={refreshCaptures}
          onSyncAutopilot={onSyncAutopilot}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <CrawlResultsList
          results={Object.values(results)}
          volumes={volumes}
          displayNumbers={displayNumbers}
          onDeleteAll={() => handleDeleteChapters(Object.keys(results))}
          onDeleteSelected={handleDeleteChapters}
          onDelete={handleDeleteChapter}
          confirm={confirm}
        />
      </section>

      {resultGroups.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <EpubBuildPanel
            groups={resultGroups}
            volumes={volumes}
            fallbackTitle={novelId}
            defaultAuthor={novelAuthor}
            onBuild={handleBuildEpub}
          />
        </section>
      )}
    </>
  );
}
