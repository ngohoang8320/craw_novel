import { useState } from "react";
import { imageProxyUrl } from "../api/client";
import { formatPageRanges } from "../lib/pageRanges";
import { groupByVolume } from "../lib/volumeGrouping";
import type { CrawlResult, VolumeLabel } from "../types";
import { Button } from "./Button";
import type { ConfirmDialogState } from "./ConfirmDialog";

interface CrawlResultsListProps {
  results: CrawlResult[];
  volumes: VolumeLabel[];
  displayNumbers: Map<string, number>;
  onDeleteAll: () => void;
  onDeleteSelected: (chapterIds: string[]) => void;
  onDelete: (chapterId: string) => void;
  confirm: (state: ConfirmDialogState) => void;
}

function ResultItem({
  result,
  displayNumber,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onDelete,
  confirm,
}: {
  result: CrawlResult;
  displayNumber: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onDelete: (chapterId: string) => void;
  confirm: (state: ConfirmDialogState) => void;
}) {
  const statusIcon = result.error ? "❌ " : "";
  const incomplete = !result.error && !result.is_complete;
  const missing = result.missing_pages ?? [];
  const pageProgress = result.total_pages
    ? `${result.page_count}/${result.total_pages} pages`
    : `${result.page_count} page(s) captured, total unknown`;
  const missingLabel = missing.length > 0 ? `missing page${missing.length > 1 ? "s" : ""} ${formatPageRanges(missing)}` : "";

  return (
    <div
      className={`flex items-start gap-2 rounded-md border-b border-gray-100 px-1 py-2 dark:border-gray-700 ${
        isExpanded ? "active border-l-2 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleExpand}
          className={`text-left text-sm hover:underline ${
            isExpanded ? "font-medium text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {statusIcon}
          {displayNumber}. {result.title} — {result.paragraph_count} paragraphs, {result.image_count} images,{" "}
          {result.char_count} chars
        </button>
        {incomplete && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            ⚠️ Incomplete — {pageProgress}
            {missingLabel && ` (${missingLabel})`}
          </span>
        )}
        {isExpanded && (
          <div className="mt-2 max-h-[450px] overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            {result.error ? (
              <p className="text-red-600 dark:text-red-400">{result.error}</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">page_count={result.page_count}</p>
                {incomplete && (
                  <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    ⚠️ This chapter's capture is incomplete ({pageProgress}
                    {missingLabel && `, ${missingLabel}`}) — keep clicking "next page" in your browser and re-import
                    before building an EPUB.
                  </p>
                )}
                {result.items.map((item, idx) =>
                  item.type === "image" && item.src ? (
                    <img key={idx} src={imageProxyUrl(item.src)} alt="" className="mb-2 max-w-full rounded" />
                  ) : (
                    <p key={idx} className="mb-2 text-gray-700 dark:text-gray-300">
                      {item.text}
                    </p>
                  ),
                )}
              </>
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        title="Delete this chapter"
        onClick={() =>
          confirm({
            message: `Delete chapter "${result.title}" from the crawl results? This also removes its captured data file from disk.`,
            onConfirm: () => onDelete(result.chapter_id),
            confirmLabel: "Delete",
            danger: true,
          })
        }
        className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        ✕
      </Button>
    </div>
  );
}

export function CrawlResultsList({
  results,
  volumes,
  displayNumbers,
  onDeleteAll,
  onDeleteSelected,
  onDelete,
  confirm,
}: CrawlResultsListProps) {
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (results.length === 0) {
    return null;
  }

  const errorCount = results.filter((r) => r.error).length;
  const incompleteCount = results.filter((r) => !r.error && !r.is_complete).length;
  const groups = groupByVolume(results, volumes);
  const resultIds = results.map((r) => r.chapter_id);
  const selectedCount = resultIds.filter((id) => selectedIds.has(id)).length;

  function toggleExpand(chapterId: string) {
    setExpandedChapterId((prev) => (prev === chapterId ? null : chapterId));
  }

  function toggleSelect(chapterId: string) {
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
    setSelectedIds(new Set(resultIds));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function deleteSelected() {
    const ids = resultIds.filter((id) => selectedIds.has(id));
    confirm({
      message: `Delete ${ids.length} selected chapter(s)? This removes their captured data file(s) from disk - visit those chapters again in your browser to re-capture them.`,
      onConfirm: () => {
        onDeleteSelected(ids);
        setSelectedIds(new Set());
      },
      confirmLabel: "Delete",
      danger: true,
    });
  }

  function deleteAll() {
    confirm({
      message: `Delete all ${results.length} chapter(s) shown here? This removes their captured data file(s) from disk - visit those chapters again in your browser to re-capture them.`,
      onConfirm: onDeleteAll,
      confirmLabel: "Delete all",
      danger: true,
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Crawl results <span className="font-normal text-gray-400 dark:text-gray-500">({results.length})</span>
        </h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={selectAll}>
            Select all
          </Button>
          <Button size="sm" onClick={deselectAll}>
            Deselect all
          </Button>
          <Button variant="danger" size="sm" onClick={deleteSelected} disabled={selectedCount === 0}>
            🗑️ Delete selected ({selectedCount})
          </Button>
          <Button variant="danger" size="sm" onClick={deleteAll}>
            🗑️ Delete all
          </Button>
        </div>
      </div>
      {errorCount > 0 && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">
          {errorCount} chapters failed (no valid captured data found).
        </p>
      )}
      {incompleteCount > 0 && (
        <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
          ⚠️ {incompleteCount} chapters are incomplete (missing trailing pages) — see each chapter below.
        </p>
      )}
      <div className="max-h-[600px] overflow-y-auto pr-1">
        {groups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {group.title && (
              <div className="mt-3 mb-1 rounded bg-gray-50 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 first:mt-0 dark:bg-gray-700/60 dark:text-gray-400">
                {group.title}
              </div>
            )}
            {group.items.map((result) => (
              <ResultItem
                key={result.chapter_id}
                result={result}
                displayNumber={displayNumbers.get(result.chapter_id) ?? result.order}
                isExpanded={expandedChapterId === result.chapter_id}
                isSelected={selectedIds.has(result.chapter_id)}
                onToggleExpand={() => toggleExpand(result.chapter_id)}
                onToggleSelect={() => toggleSelect(result.chapter_id)}
                onDelete={onDelete}
                confirm={confirm}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
