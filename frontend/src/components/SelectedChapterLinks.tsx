import { groupByVolume } from "../lib/volumeGrouping";
import type { Chapter, VolumeLabel } from "../types";

interface SelectedChapterLinksProps {
  chapters: Chapter[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
}

export function SelectedChapterLinks({ chapters, volumes, displayNumbers }: SelectedChapterLinksProps) {
  if (chapters.length === 0) {
    return null;
  }

  const groups = groupByVolume(chapters, volumes);

  return (
    <details className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/40">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 select-none dark:text-gray-300">
        🔗 Links for {chapters.length} selected chapters (to open in your browser)
      </summary>
      <div className="mt-2 max-h-[450px] overflow-y-auto text-sm">
        {groups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {group.title && (
              <div className="mt-3 mb-1 rounded bg-gray-100 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 first:mt-0 dark:bg-gray-700 dark:text-gray-400">
                {group.title}
              </div>
            )}
            <ul className="space-y-1">
              {group.items.map((chapter) => (
                <li key={chapter.chapter_id}>
                  {displayNumbers.get(chapter.chapter_id) ?? chapter.order}.{" "}
                  <a
                    href={chapter.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {chapter.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
