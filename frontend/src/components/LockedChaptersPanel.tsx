import type { Chapter } from "../types";

interface LockedChaptersPanelProps {
  chapters: Chapter[];
}

export function LockedChaptersPanel({ chapters }: LockedChaptersPanelProps) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">⚠️ Unresolved link ({chapters.length})</p>
      <p className="mb-2 text-xs text-gray-500">
        No href in the table of contents, and resolving via the neighboring chapter failed
      </p>
      <div className="h-[450px] overflow-y-auto rounded border border-gray-200 p-2 text-sm">
        {chapters.length === 0 ? (
          <p className="text-gray-500">No chapters with a missing link.</p>
        ) : (
          chapters.map((chapter) => (
            <p key={chapter.chapter_id}>
              {chapter.order}. {chapter.title}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
