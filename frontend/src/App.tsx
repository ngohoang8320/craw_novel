import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEpub, deleteCapture, fetchCaptures, fetchToc } from "./api/client";
import { CaptureImportPanel } from "./components/CaptureImportPanel";
import { ChapterList } from "./components/ChapterList";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CrawlResultsList } from "./components/CrawlResultsList";
import { EpubBuildPanel } from "./components/EpubBuildPanel";
import { LockedChaptersPanel } from "./components/LockedChaptersPanel";
import { NovelIdForm } from "./components/NovelIdForm";
import { SelectedChapterLinks } from "./components/SelectedChapterLinks";
import { ThemeToggle } from "./components/ThemeToggle";
import { useConfirmDialog } from "./hooks/useConfirmDialog";
import { useTheme } from "./hooks/useTheme";
import { buildGroupDisplayNumbers, coverUrlForTitle, groupByVolume, type VolumeGroup } from "./lib/volumeGrouping";
import type { CapturedChapter, Chapter, CrawlResult, VolumeLabel } from "./types";

const DEFAULT_NOVEL_ID = import.meta.env.VITE_DEFAULT_NOVEL_ID ?? "";

function App() {
  const [novelId, setNovelId] = useState(DEFAULT_NOVEL_ID);
  // The novel_id the currently-loaded toc/captures/results actually belong to
  // (set only on a successful fetch) - kept separate from `novelId` (the live
  // input box value) so editing the input after fetching doesn't send API
  // calls for the wrong (or empty) novel_id.
  const [loadedNovelId, setLoadedNovelId] = useState("");
  const [toc, setToc] = useState<Chapter[]>([]);
  const [volumes, setVolumes] = useState<VolumeLabel[]>([]);
  const [novelAuthor, setNovelAuthor] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CapturedChapter[]>([]);
  const [results, setResults] = useState<Record<string, CrawlResult>>({});

  const { dialogState, confirm, closeDialog } = useConfirmDialog();
  const { theme, toggleTheme } = useTheme();

  const lockedChapters = useMemo(() => toc.filter((c) => c.locked), [toc]);
  const unlockedChapters = useMemo(() => toc.filter((c) => !c.locked), [toc]);
  const selectedChapters = useMemo(
    () => unlockedChapters.filter((c) => selectedIds.has(c.chapter_id)),
    [unlockedChapters, selectedIds],
  );

  async function handleFetchToc() {
    if (!novelId.trim()) {
      setFetchError("Please enter a novel_id.");
      return;
    }
    setFetchLoading(true);
    setFetchError(null);
    try {
      const { chapters, volumes, novel_author } = await fetchToc(novelId.trim());
      setLoadedNovelId(novelId.trim());
      setToc(chapters);
      setVolumes(volumes);
      setNovelAuthor(novel_author ?? "");
      setSelectedIds(new Set());
      setCaptures([]);
      setResults({});
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchLoading(false);
    }
  }

  function toggleChapter(chapterId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(unlockedChapters.map((c) => c.chapter_id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function selectGroup(chapterIds: string[]) {
    setSelectedIds((prev) => new Set([...prev, ...chapterIds]));
  }

  function deselectGroup(chapterIds: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of chapterIds) {
        next.delete(id);
      }
      return next;
    });
  }

  const selectedIdsKey = selectedChapters.map((c) => c.chapter_id).join(",");
  const captureRequestRef = useRef(0);

  const refreshCaptures = useCallback(() => {
    const requestId = ++captureRequestRef.current;
    if (selectedChapters.length === 0) {
      setCaptures([]);
      return;
    }
    fetchCaptures(loadedNovelId, selectedChapters.map((c) => c.chapter_id)).then(
      ({ chapters: captured }) => {
        // Ignore this response if a newer refresh was triggered meanwhile
        // (e.g. focus + selection change firing close together).
        if (requestId === captureRequestRef.current) {
          setCaptures(captured);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedNovelId, selectedIdsKey]);

  // Re-check capture status whenever the selection (or novel) changes.
  useEffect(() => {
    refreshCaptures();
  }, [refreshCaptures]);

  // The extension captures content in a separate browser tab (the chapter
  // page on bilinovel.com), so nothing here knows a new capture landed until
  // we ask again. Refresh whenever the user switches back to this tab.
  useEffect(() => {
    function handleFocus() {
      refreshCaptures();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshCaptures]);

  function handleImport() {
    setResults((prev) => {
      const next = { ...prev };
      for (const chapter of selectedChapters) {
        const captured = captures.find((c) => c.chapter_id === chapter.chapter_id);
        if (!captured || !captured.captured) {
          continue;
        }
        next[chapter.chapter_id] = {
          chapter_id: chapter.chapter_id,
          order: chapter.order,
          title: chapter.title,
          page_count: captured.page_count ?? 0,
          total_pages: captured.total_pages ?? null,
          is_complete: captured.is_complete ?? false,
          missing_pages: captured.missing_pages ?? [],
          paragraph_count: captured.paragraph_count ?? 0,
          image_count: captured.image_count ?? 0,
          char_count: captured.char_count ?? 0,
          items: captured.items ?? [],
          error: null,
        };
      }
      return next;
    });
  }

  // Deletes the captured data file(s) on the backend AND removes them from
  // this app's state - used by the single "✕" per chapter, and by
  // "Delete selected"/"Delete all" in Crawl results for re-crawling chapters
  // whose capture came out wrong (e.g. a broken image) - all three are the
  // same destructive action, just at different scopes.
  async function handleDeleteChapters(chapterIds: string[]) {
    await Promise.all(chapterIds.map((id) => deleteCapture(loadedNovelId, id)));
    setResults((prev) => {
      const next = { ...prev };
      for (const id of chapterIds) {
        delete next[id];
      }
      return next;
    });
    setCaptures((prev) => prev.filter((c) => !chapterIds.includes(c.chapter_id)));
  }

  async function handleDeleteChapter(chapterId: string) {
    await handleDeleteChapters([chapterId]);
  }

  const resultGroups = useMemo(
    () => groupByVolume(Object.values(results).filter((r) => !r.error), volumes),
    [results, volumes],
  );

  // Single source of truth for per-group chapter numbering, computed from the
  // FULL toc (locked and unlocked alike) so every panel - Table of contents,
  // Unresolved, Crawl results - shows the same number for the same chapter,
  // and a locked chapter's true position within its group isn't hidden.
  const displayNumbers = useMemo(() => buildGroupDisplayNumbers(toc, volumes), [toc, volumes]);

  async function handleBuildEpub(author: string, groupsToBuild: VolumeGroup<CrawlResult>[]) {
    for (const g of groupsToBuild) {
      const title = g.title ?? loadedNovelId;
      const chapters = g.items.map((r) => ({ title: r.title, order: r.order, items: r.items }));

      const coverUrl = coverUrlForTitle(g.title, volumes);
      const blob = await buildEpub(loadedNovelId, title, author, chapters, coverUrl);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title}.epub`;
      link.click();
      URL.revokeObjectURL(url);

      // Small delay so the browser doesn't throttle/block several automatic
      // downloads triggered back-to-back from one click.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100">
      <header className="relative border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bilinovel → EPUB Crawler</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Internal tool for building offline EPUBs from crawled chapters.
          </p>
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 sm:right-6">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-6">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <NovelIdForm
            novelId={novelId}
            onNovelIdChange={setNovelId}
            onFetch={handleFetchToc}
            loading={fetchLoading}
            error={fetchError}
          />
        </section>

        {toc.length > 0 && (
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
                  onToggle={toggleChapter}
                  onSelectAll={selectAll}
                  onDeselectAll={deselectAll}
                  onSelectGroup={selectGroup}
                  onDeselectGroup={deselectGroup}
                />
                <LockedChaptersPanel chapters={lockedChapters} volumes={volumes} displayNumbers={displayNumbers} />
              </div>

              {lockedChapters.length > 0 && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {lockedChapters.length} chapters excluded (unresolved link).
                </p>
              )}

              <div className="mt-3">
                <SelectedChapterLinks chapters={selectedChapters} volumes={volumes} displayNumbers={displayNumbers} />
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <CaptureImportPanel
                novelId={loadedNovelId}
                selectedChapters={selectedChapters}
                volumes={volumes}
                displayNumbers={displayNumbers}
                captures={captures}
                onImport={handleImport}
                onRefresh={refreshCaptures}
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
                  fallbackTitle={loadedNovelId}
                  defaultAuthor={novelAuthor}
                  onBuild={handleBuildEpub}
                />
              </section>
            )}
          </>
        )}

        {toc.length === 0 && (
          <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-600 dark:bg-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter a novel_id above and click "Fetch" to get started.
            </p>
          </section>
        )}
      </main>

      <ConfirmDialog state={dialogState} onClose={closeDialog} />
    </div>
  );
}

export default App;
