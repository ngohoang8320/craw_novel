import { groupByVolume } from "../lib/volumeGrouping";
import type { Chapter, VolumeLabel } from "../types";

interface LockedChaptersPanelProps {
  chapters: Chapter[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
}

export function LockedChaptersPanel({ chapters, volumes, displayNumbers }: LockedChaptersPanelProps) {
  const groups = groupByVolume(chapters, volumes);

  return (
    <div className="flex h-[450px] flex-col">
      <div className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        <span>⚠️</span>
        <span>Unresolved ({chapters.length})</span>
      </div>
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
                <p key={chapter.chapter_id} className="py-0.5 text-gray-700 dark:text-gray-300">
                  {displayNumbers.get(chapter.chapter_id) ?? chapter.order}. {chapter.title}
                </p>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
