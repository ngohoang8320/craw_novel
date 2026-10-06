import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEpub, deleteCapture, fetchCaptures } from "../api/client";
import { buildGroupDisplayNumbers, coverUrlForTitle, groupByVolume, type VolumeGroup } from "../lib/volumeGrouping";
import type { CapturedChapter, Chapter, CrawlResult, VolumeLabel } from "../types";

/** Owns the capture-status / crawl-results / EPUB-build pipeline for one
 * novel - everything downstream of "which chapters are selected". Shared by
 * the single-novel view (where `selectedChapters` comes from user checkboxes)
 * and the Batch queue view's per-novel detail (where it's simply every
 * unlocked chapter, no manual picking there). `chapters` is the FULL chapter
 * list (locked + unlocked) - only used for per-group display numbering, so a
 * locked chapter's true position within its group isn't hidden. */
export function useNovelCapture(
  novelId: string,
  chapters: Chapter[],
  selectedChapters: Chapter[],
  volumes: VolumeLabel[],
) {
  const [captures, setCaptures] = useState<CapturedChapter[]>([]);
  const [results, setResults] = useState<Record<string, CrawlResult>>({});

  // A genuinely new novel starts fresh (re-running this hook for the same
  // novelId - e.g. a TOC "Retry" - keeps whatever was already imported).
  useEffect(() => {
    setCaptures([]);
    setResults({});
  }, [novelId]);

  const selectedIdsKey = selectedChapters.map((c) => c.chapter_id).join(",");
  const captureRequestRef = useRef(0);

  const refreshCaptures = useCallback(() => {
    const requestId = ++captureRequestRef.current;
    if (selectedChapters.length === 0) {
      setCaptures([]);
      return;
    }
    fetchCaptures(novelId, selectedChapters.map((c) => c.chapter_id)).then(({ chapters: captured }) => {
      // Ignore this response if a newer refresh was triggered meanwhile
      // (e.g. focus + selection change firing close together).
      if (requestId === captureRequestRef.current) {
        setCaptures(captured);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, selectedIdsKey]);

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
  // this hook's state - used by the single "✕" per chapter, and by "Delete
  // selected"/"Delete all" in Crawl results for re-crawling chapters whose
  // capture came out wrong (e.g. a broken image) - all three are the same
  // destructive action, just at different scopes.
  async function handleDeleteChapters(chapterIds: string[]) {
    await Promise.all(chapterIds.map((id) => deleteCapture(novelId, id)));
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
  // FULL chapter list (locked and unlocked alike) so every panel - Table of
  // contents, Unresolved, Crawl results - shows the same number for the same
  // chapter.
  const displayNumbers = useMemo(() => buildGroupDisplayNumbers(chapters, volumes), [chapters, volumes]);

  async function handleBuildEpub(author: string, groupsToBuild: VolumeGroup<CrawlResult>[]) {
    for (const g of groupsToBuild) {
      const title = g.title ?? novelId;
      const epubChapters = g.items.map((r) => ({ title: r.title, order: r.order, items: r.items }));

      const coverUrl = coverUrlForTitle(g.title, volumes);
      const blob = await buildEpub(novelId, title, author, epubChapters, coverUrl);
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

  return {
    captures,
    refreshCaptures,
    results,
    handleImport,
    handleDeleteChapters,
    handleDeleteChapter,
    resultGroups,
    displayNumbers,
    handleBuildEpub,
  };
}
