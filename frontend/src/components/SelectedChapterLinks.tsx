import type { Chapter } from "../types";

interface SelectedChapterLinksProps {
  chapters: Chapter[];
}

export function SelectedChapterLinks({ chapters }: SelectedChapterLinksProps) {
  if (chapters.length === 0) {
    return null;
  }

  return (
    <details className="mb-4 rounded border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        🔗 Links for the {chapters.length} selected chapters (to open in your browser)
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {chapters.map((chapter) => (
          <li key={chapter.chapter_id}>
            {chapter.order}.{" "}
            <a
              href={chapter.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              {chapter.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
