import { Button } from "./Button";
import type { Chapter, VolumeLabel } from "../types";

interface ChapterListProps {
  chapters: Chapter[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
  selectedIds: Set<string>;
  onToggle: (chapterId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectGroup: (chapterIds: string[]) => void;
  onDeselectGroup: (chapterIds: string[]) => void;
  onForgetRecovered: (chapter: Chapter) => void;
}

interface VolumeRow {
  kind: "volume";
  key: string;
  title: string;
  chapterIds: string[];
}

interface ChapterRow {
  kind: "chapter";
  chapter: Chapter;
}

type Row = VolumeRow | ChapterRow;

/** Merge `chapters` (ascending by order) with `volumes` (ascending by
 * before_order) into a single render list: a volume's label is inserted
 * right before the first chapter whose order is >= its before_order, or at
 * the end if no such chapter remains (e.g. an all-locked trailing volume).
 * Each volume row also collects the chapter ids that render under it (up to
 * the next volume row), so a "select this group" button can target exactly
 * those chapters. */
function buildRows(chapters: Chapter[], volumes: VolumeLabel[]): Row[] {
  const rows: Row[] = [];
  let volumeIdx = 0;

  for (const chapter of chapters) {
    while (volumeIdx < volumes.length && volumes[volumeIdx].before_order <= chapter.order) {
      rows.push({ kind: "volume", key: `vol-${volumeIdx}`, title: volumes[volumeIdx].title, chapterIds: [] });
      volumeIdx++;
    }
    rows.push({ kind: "chapter", chapter });
  }
  while (volumeIdx < volumes.length) {
    rows.push({ kind: "volume", key: `vol-${volumeIdx}`, title: volumes[volumeIdx].title, chapterIds: [] });
    volumeIdx++;
  }

  let currentVolumeRow: VolumeRow | null = null;
  for (const row of rows) {
    if (row.kind === "volume") {
      currentVolumeRow = row;
    } else if (currentVolumeRow) {
      currentVolumeRow.chapterIds.push(row.chapter.chapter_id);
    }
  }

  return rows;
}

export function ChapterList({
  chapters,
  volumes,
  displayNumbers,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onSelectGroup,
  onDeselectGroup,
  onForgetRecovered,
}: ChapterListProps) {
  const rows = buildRows(chapters, volumes);

  return (
    <div className="flex h-[450px] flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Chapters</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={onSelectAll}>
            Select all
          </Button>
          <Button size="sm" onClick={onDeselectAll}>
            Deselect all
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
        {rows.map((row) =>
          row.kind === "volume" ? (
            <div
              key={row.key}
              className="mt-3 mb-1 flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 first:mt-0 dark:bg-gray-700/60"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {row.title}
              </span>
              <span className="flex gap-1">
                <Button size="sm" onClick={() => onSelectGroup(row.chapterIds)} disabled={row.chapterIds.length === 0}>
                  Select group
                </Button>
                <Button
                  size="sm"
                  onClick={() => onDeselectGroup(row.chapterIds)}
                  disabled={row.chapterIds.length === 0}
                >
                  Deselect group
                </Button>
              </span>
            </div>
          ) : (
            <div
              key={row.chapter.chapter_id}
              className="flex items-center gap-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.chapter.chapter_id)}
                  onChange={() => onToggle(row.chapter.chapter_id)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>
                  {displayNumbers.get(row.chapter.chapter_id) ?? row.chapter.order}. {row.chapter.title}
                </span>
                {row.chapter.recovered && (
                  <span
                    className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                    title="This chapter's link wasn't in the catalog page - it was recovered (or entered by hand) and is remembered for later fetches."
                  >
                    recovered
                  </span>
                )}
              </label>
              {row.chapter.recovered && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Discard this recovered link (the chapter goes back to Unresolved)"
                  onClick={() => onForgetRecovered(row.chapter)}
                  className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                >
                  ✕
                </Button>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
