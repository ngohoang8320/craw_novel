import { useState } from "react";
import type { CrawlResult } from "../types";
import type { ConfirmDialogState } from "./ConfirmDialog";

interface CrawlResultsListProps {
  results: CrawlResult[];
  onClear: () => void;
  onDelete: (chapterId: string) => void;
  confirm: (state: ConfirmDialogState) => void;
}

function ResultItem({
  result,
  onDelete,
  confirm,
}: {
  result: CrawlResult;
  onDelete: (chapterId: string) => void;
  confirm: (state: ConfirmDialogState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusIcon = result.error ? "❌" : "✅";

  return (
    <div className="flex items-start gap-2 border-b border-gray-100 py-2">
      <div className="flex-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-left text-sm hover:underline"
        >
          {statusIcon} {result.order}. {result.title} — {result.paragraph_count} paragraphs,{" "}
          {result.char_count} chars
        </button>
        {expanded && (
          <div className="mt-2 rounded bg-gray-50 p-2 text-sm">
            {result.error ? (
              <p className="text-red-600">{result.error}</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-500">page_count={result.page_count}</p>
                {result.paragraphs.map((paragraph, idx) => (
                  <p key={idx} className="mb-2">
                    {paragraph}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        title="Delete this chapter"
        onClick={() =>
          confirm({
            message: `Delete chapter "${result.title}" from the crawl results? This also removes its captured data file from disk.`,
            onConfirm: () => onDelete(result.chapter_id),
            confirmLabel: "Delete",
            danger: true,
          })
        }
        className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600"
      >
        ✕
      </button>
    </div>
  );
}

export function CrawlResultsList({ results, onClear, onDelete, confirm }: CrawlResultsListProps) {
  if (results.length === 0) {
    return null;
  }

  const errorCount = results.filter((r) => r.error).length;
  const sorted = [...results].sort((a, b) => a.order - b.order);

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Crawl results</h2>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          🗑️ Clear all crawl results
        </button>
      </div>
      {errorCount > 0 && (
        <p className="mb-2 text-sm text-red-600">
          {errorCount} chapters failed (no valid captured data found).
        </p>
      )}
      <div>
        {sorted.map((result) => (
          <ResultItem key={result.chapter_id} result={result} onDelete={onDelete} confirm={confirm} />
        ))}
      </div>
    </div>
  );
}
