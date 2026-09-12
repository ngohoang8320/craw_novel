import type { Chapter } from "../types";

interface ChapterListProps {
  chapters: Chapter[];
  selectedIds: Set<string>;
  onToggle: (chapterId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function ChapterList({ chapters, selectedIds, onToggle, onSelectAll, onDeselectAll }: ChapterListProps) {
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onDeselectAll}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Deselect all
        </button>
      </div>
      <div className="h-[450px] overflow-y-auto rounded border border-gray-200 p-2">
        {chapters.map((chapter) => (
          <label key={chapter.chapter_id} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.has(chapter.chapter_id)}
              onChange={() => onToggle(chapter.chapter_id)}
            />
            <span>
              {chapter.order}. {chapter.title}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
