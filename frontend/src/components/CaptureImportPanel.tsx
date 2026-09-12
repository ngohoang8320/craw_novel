import type { CapturedChapter, Chapter } from "../types";

interface CaptureImportPanelProps {
  selectedChapters: Chapter[];
  captures: CapturedChapter[];
  onImport: () => void;
}

export function CaptureImportPanel({ selectedChapters, captures, onImport }: CaptureImportPanelProps) {
  const capturedCount = captures.filter((c) => c.captured).length;
  const completeCount = captures.filter((c) => c.captured && c.is_complete).length;

  return (
    <div className="mb-4 border-t border-gray-200 pt-4">
      <h2 className="mb-1 text-base font-semibold">Import content captured by the extension</h2>
      <p className="mb-2 text-xs text-gray-500">
        Load the extension from the extension/ folder (see README), run the backend, then open each
        selected chapter in your real browser — the content is saved automatically.
      </p>
      <p className="mb-2 text-sm">
        Captured: {capturedCount}/{selectedChapters.length} selected chapters ({completeCount} chapters
        fully captured).
      </p>
      <button
        type="button"
        onClick={onImport}
        disabled={capturedCount === 0}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Import captured content ({capturedCount} chapters)
      </button>
    </div>
  );
}
