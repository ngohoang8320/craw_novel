import { useEffect, useMemo, useState } from "react";
import { fetchToc, forgetRecoveredLink, setManualChapterLink } from "../api/client";
import type { Chapter, VolumeLabel } from "../types";

/** Owns a novel's table of contents end-to-end - the fetch itself, the
 * per-chapter selection, and the three ways a locked chapter gets resolved
 * (Retry, manual link, discard). Fetches automatically whenever `novelId`
 * changes - used both by the single-novel view and, per row, by the Batch
 * queue view's novel detail, so both get the exact same TOC behavior instead
 * of two separate implementations drifting apart. `novelId` is expected to
 * go from null to a real id at most once per hook instance (neither caller
 * ever "unloads" a novel back to null), so there's nothing to reset back to
 * empty for. */
export function useNovelToc(novelId: string | null) {
  const [toc, setToc] = useState<Chapter[]>([]);
  const [volumes, setVolumes] = useState<VolumeLabel[]>([]);
  const [novelAuthor, setNovelAuthor] = useState("");
  const [novelTitle, setNovelTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!novelId) {
      return;
    }
    let cancelled = false;
    // Kicking off the fetch itself - there's no event to set these from instead.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true);
    // oxlint-disable-next-line react/set-state-in-effect
    setError(null);
    fetchToc(novelId)
      .then(({ chapters, volumes, novel_author, novel_title }) => {
        if (cancelled) {
          return;
        }
        setToc(chapters);
        setVolumes(volumes);
        setNovelAuthor(novel_author ?? "");
        setNovelTitle(novel_title ?? null);
        setSelectedIds(new Set());
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  const lockedChapters = useMemo(() => toc.filter((c) => c.locked), [toc]);
  const unlockedChapters = useMemo(() => toc.filter((c) => !c.locked), [toc]);
  const selectedChapters = useMemo(
    () => unlockedChapters.filter((c) => selectedIds.has(c.chapter_id)),
    [unlockedChapters, selectedIds],
  );

  // Re-runs the table-of-contents fetch IN PLACE - unlike the initial fetch,
  // it keeps the selection. Links recovered on earlier fetches are
  // remembered by the backend, so this only retries the chapters that are
  // still unresolved (and can only add links, never lose one).
  async function retryUnresolved() {
    if (!novelId) {
      return;
    }
    const { chapters, volumes, novel_author, novel_title } = await fetchToc(novelId);
    setToc(chapters);
    setVolumes(volumes);
    setNovelAuthor(novel_author ?? "");
    setNovelTitle(novel_title ?? null);
  }

  async function setManualLink(chapter: Chapter, link: string) {
    if (!novelId) {
      return;
    }
    // Same extraction the backend does (last number before an optional _page
    // / .html) - used only to catch a link that duplicates another chapter
    // before it gets remembered; the backend still validates the link itself.
    const idMatch = link.match(/(\d+)(?:_\d+)?(?:\.html)?\/?\s*$/);
    if (idMatch && toc.some((c) => c.order !== chapter.order && c.chapter_id === idMatch[1])) {
      throw new Error("Another chapter in this table of contents already uses that link.");
    }
    const { chapter_id, url } = await setManualChapterLink(novelId, chapter.order, chapter.title, link);
    setToc((prev) =>
      prev.map((c) => (c.order === chapter.order ? { ...c, chapter_id, url, locked: false, recovered: true } : c)),
    );
  }

  // Discards a recovered/manual link: the chapter goes back to unresolved
  // (Retry or a manual link can then redo it). Captured data already saved
  // for that chapter_id is left alone.
  async function forgetRecovered(chapter: Chapter) {
    if (!novelId) {
      return;
    }
    try {
      await forgetRecoveredLink(novelId, chapter.chapter_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setToc((prev) =>
      prev.map((c) =>
        c.chapter_id === chapter.chapter_id
          ? { ...c, chapter_id: `unresolved_${c.order}`, url: null, locked: true, recovered: false }
          : c,
      ),
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(chapter.chapter_id);
      return next;
    });
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

  return {
    toc,
    volumes,
    novelAuthor,
    novelTitle,
    loading,
    error,
    lockedChapters,
    unlockedChapters,
    selectedIds,
    selectedChapters,
    retryUnresolved,
    setManualLink,
    forgetRecovered,
    toggleChapter,
    selectAll,
    deselectAll,
    selectGroup,
    deselectGroup,
  };
}
