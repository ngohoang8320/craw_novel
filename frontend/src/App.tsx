import { useEffect, useMemo, useState } from "react";
import { deleteCapture, fetchCaptures, fetchToc } from "./api/client";
import { CaptureImportPanel } from "./components/CaptureImportPanel";
import { ChapterList } from "./components/ChapterList";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CrawlResultsList } from "./components/CrawlResultsList";
import { LockedChaptersPanel } from "./components/LockedChaptersPanel";
import { NovelIdForm } from "./components/NovelIdForm";
import { SelectedChapterLinks } from "./components/SelectedChapterLinks";
import { useConfirmDialog } from "./hooks/useConfirmDialog";
import type { CapturedChapter, Chapter, CrawlResult } from "./types";

const DEFAULT_NOVEL_ID = import.meta.env.VITE_DEFAULT_NOVEL_ID ?? "";

function App() {
  const [novelId, setNovelId] = useState(DEFAULT_NOVEL_ID);
  const [toc, setToc] = useState<Chapter[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CapturedChapter[]>([]);
  const [results, setResults] = useState<Record<string, CrawlResult>>({});

  const { dialogState, confirm, closeDialog } = useConfirmDialog();

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
      const { chapters } = await fetchToc(novelId.trim());
      setToc(chapters);
      setSelectedIds(new Set());
      setCaptures([]);
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

  const selectedIdsKey = selectedChapters.map((c) => c.chapter_id).join(",");

  // Re-check capture status whenever the selection (or novel) changes.
  useEffect(() => {
    if (selectedChapters.length === 0) {
      setCaptures([]);
      return;
    }
    let cancelled = false;
    fetchCaptures(novelId.trim(), selectedChapters.map((c) => c.chapter_id)).then(
      ({ chapters: captured }) => {
        if (!cancelled) {
          setCaptures(captured);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, selectedIdsKey]);

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
          paragraph_count: captured.paragraph_count ?? 0,
          char_count: captured.char_count ?? 0,
          paragraphs: captured.paragraphs ?? [],
          error: null,
        };
      }
      return next;
    });
  }

  async function handleDeleteChapter(chapterId: string) {
    await deleteCapture(novelId.trim(), chapterId);
    setResults((prev) => {
      const next = { ...prev };
      delete next[chapterId];
      return next;
    });
    setCaptures((prev) => prev.filter((c) => c.chapter_id !== chapterId));
  }

  function handleClearResults() {
    setResults({});
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Bilinovel -&gt; EPUB Crawler (internal)</h1>

      <NovelIdForm
        novelId={novelId}
        onNovelIdChange={setNovelId}
        onFetch={handleFetchToc}
        loading={fetchLoading}
        error={fetchError}
      />

      {toc.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Table of contents ({toc.length} chapters)</h2>

          <div className="mb-4 grid grid-cols-[3fr_1fr] gap-4">
            <ChapterList
              chapters={unlockedChapters}
              selectedIds={selectedIds}
              onToggle={toggleChapter}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
            />
            <LockedChaptersPanel chapters={lockedChapters} />
          </div>

          <p className="mb-4 rounded bg-blue-50 p-2 text-sm">
            Selected: <strong>{selectedChapters.length}/{unlockedChapters.length}</strong> chapters
            (excluding {lockedChapters.length} chapters with an unresolved link)
          </p>

          <SelectedChapterLinks chapters={selectedChapters} />

          <CaptureImportPanel
            selectedChapters={selectedChapters}
            captures={captures}
            onImport={handleImport}
          />

          <CrawlResultsList
            results={Object.values(results)}
            onClear={handleClearResults}
            onDelete={handleDeleteChapter}
            confirm={confirm}
          />
        </>
      )}

      {toc.length === 0 && (
        <p className="text-sm text-gray-500">Enter a novel_id and click 'Fetch table of contents' to get started.</p>
      )}

      <ConfirmDialog state={dialogState} onClose={closeDialog} />
    </div>
  );
}

export default App;
