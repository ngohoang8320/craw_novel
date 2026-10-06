import { useRef, useState } from "react";
import { fetchToc } from "../api/client";
import { syncAutopilotChain, syncAutopilotQueue } from "../lib/autopilotBridge";
import type { Chapter, VolumeLabel } from "../types";
import { BatchNovelDetail } from "./BatchNovelDetail";
import { Button } from "./Button";
import type { ConfirmDialogState } from "./ConfirmDialog";

type RowStatus = "pending" | "fetching" | "synced" | "error";

interface QueueRow {
  novelId: string;
  status: RowStatus;
  novelTitle?: string;
  novelAuthor?: string;
  chapters?: Chapter[];
  volumes?: VolumeLabel[];
  error?: string;
}

interface BatchQueuePanelProps {
  confirm: (state: ConfirmDialogState) => void;
}

/** Splits on commas, whitespace or newlines, trims, drops empties, and dedupes. */
function parseIds(text: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Fetches each queued novel's table of contents one at a time, auto-selects
 * every resolved chapter, and syncs it straight to the Auto-Pilot extension -
 * the same "Fetch" + "Select all" + "Sync to Auto-Pilot" steps the
 * single-novel view does, just repeated across several novel ids without
 * having to switch back and forth by hand. It also keeps Auto-Pilot's batch
 * chain in sync (see `syncAutopilotChain`), so once a novel's own queue is
 * fully captured, Auto-Pilot automatically opens the next queued novel's
 * first chapter instead of stopping - you only have to open the FIRST
 * novel's first chapter by hand to start the whole run. Each synced row can
 * also be expanded into the exact same workspace the single-novel view has
 * (`BatchNovelDetail`/`NovelWorkspace`) - chapter selection, Unresolved
 * retry/manual link, chapter links, capture status, crawl results and EPUB
 * building. */
export function BatchQueuePanel({ confirm }: BatchQueuePanelProps) {
  const [idsText, setIdsText] = useState("");
  const [rows, setRows] = useState<QueueRow[]>([]);
  // Mirrors `rows` so chain recomputation always sees the latest state
  // synchronously, without depending on React's batched state updates.
  const rowsRef = useRef<QueueRow[]>([]);
  const [running, setRunning] = useState(false);
  const stopRequested = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function setRowsAndRef(next: QueueRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  function updateRow(novelId: string, patch: Partial<QueueRow>) {
    setRowsAndRef(rowsRef.current.map((r) => (r.novelId === novelId ? { ...r, ...patch } : r)));
  }

  /** Pushes the batch chain to Auto-Pilot: EVERY row still in the queue (not
   * removed, not permanently errored), in order, each with its first
   * unlocked chapter's url if known yet or `null` otherwise. Including
   * not-yet-synced rows with a null url (rather than leaving them out) is
   * what lets Auto-Pilot wait for a later novel's fetch to finish instead of
   * giving up - without this, a short novel finishing capture before "Start
   * processing" reaches the next one in the queue would have nowhere to
   * advance to. */
  function pushChain() {
    const chain = rowsRef.current
      .filter((r) => r.status !== "error")
      .map((r) => ({
        novel_id: r.novelId,
        url: r.chapters?.find((c) => !c.locked)?.url ?? null,
      }));
    syncAutopilotChain(chain);
  }

  function addToQueue() {
    const newIds = parseIds(idsText);
    if (newIds.length === 0) {
      return;
    }
    const existing = new Set(rowsRef.current.map((r) => r.novelId));
    const additions: QueueRow[] = newIds
      .filter((id) => !existing.has(id))
      .map((novelId) => ({ novelId, status: "pending" }));
    setRowsAndRef([...rowsRef.current, ...additions]);
    setIdsText("");
  }

  async function processRow(novelId: string) {
    updateRow(novelId, { status: "fetching", error: undefined });
    try {
      const { chapters, volumes, novel_title, novel_author } = await fetchToc(novelId);
      const unlocked = chapters.filter((c) => !c.locked);
      syncAutopilotQueue(novelId, unlocked);
      updateRow(novelId, {
        status: "synced",
        novelTitle: novel_title ?? undefined,
        novelAuthor: novel_author ?? undefined,
        chapters,
        volumes,
      });
      pushChain();
    } catch (err) {
      updateRow(novelId, { status: "error", error: err instanceof Error ? err.message : String(err) });
      pushChain();
    }
  }

  async function startProcessing() {
    setRunning(true);
    stopRequested.current = false;
    // Push the chain's shape up front (every pending row, url still null) so
    // Auto-Pilot already knows a later novel is coming even before this loop
    // reaches it.
    pushChain();
    try {
      for (const row of rowsRef.current) {
        if (row.status !== "pending") {
          continue;
        }
        if (stopRequested.current) {
          break;
        }
        await processRow(row.novelId);
      }
    } finally {
      setRunning(false);
    }
  }

  function stopProcessing() {
    stopRequested.current = true;
  }

  function removeRow(novelId: string) {
    setRowsAndRef(rowsRef.current.filter((r) => r.novelId !== novelId));
    if (expandedId === novelId) {
      setExpandedId(null);
    }
    pushChain();
  }

  function handleDetailTocChange(
    novelId: string,
    chapters: Chapter[],
    volumes: VolumeLabel[],
    novelAuthor: string,
    novelTitle: string | null,
  ) {
    updateRow(novelId, { chapters, volumes, novelAuthor, novelTitle: novelTitle ?? undefined });
    pushChain();
  }

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">Batch queue</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Paste several novel ids (one per line, or separated by commas/spaces). Each one is fetched in
        turn, every resolved chapter is auto-selected, and the chapter list is synced straight to the
        Auto-Pilot extension - same as "Fetch" + "Select all" + "Sync to Auto-Pilot" in the single-novel
        view. A novel with unresolved chapters still gets queued - expand it ("📖 Manage") to retry or
        enter a link by hand. Once a novel's own queue finishes capturing, Auto-Pilot automatically opens
        the next synced novel's first chapter (it waits if that novel is still being fetched) - open the
        first novel's first chapter link below to kick off the whole run.
      </p>

      <textarea
        value={idsText}
        onChange={(e) => setIdsText(e.target.value)}
        placeholder={"4699\n1222\n..."}
        rows={3}
        className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      <div className="mb-3 flex gap-2">
        <Button onClick={addToQueue} disabled={!idsText.trim()}>
          Add to queue
        </Button>
        <Button variant="primary" onClick={startProcessing} disabled={running || pendingCount === 0}>
          {running ? "Processing..." : `Start processing (${pendingCount})`}
        </Button>
        {running && <Button onClick={stopProcessing}>Stop</Button>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Queue is empty.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const chapters = row.chapters ?? [];
            const unlockedChapters = chapters.filter((c) => !c.locked);
            const lockedCount = chapters.length - unlockedChapters.length;
            const firstChapterUrl = unlockedChapters[0]?.url ?? undefined;
            const isExpanded = expandedId === row.novelId;

            return (
              <li
                key={row.novelId}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{row.novelId}</span>
                    {row.novelTitle && (
                      <span className="ml-2 text-gray-600 dark:text-gray-400">{row.novelTitle}</span>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {row.status === "pending" && "Pending"}
                      {row.status === "fetching" && "Fetching..."}
                      {row.status === "synced" && (
                        <>
                          ✅ Synced {unlockedChapters.length} chapter(s)
                          {!!lockedCount && ` (${lockedCount} unresolved)`}
                          {firstChapterUrl && (
                            <>
                              {" — "}
                              <a
                                href={firstChapterUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                              >
                                open first chapter
                              </a>
                            </>
                          )}
                        </>
                      )}
                      {row.status === "error" && (
                        <span className="text-red-600 dark:text-red-400">⚠️ {row.error}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {row.status === "synced" && (
                      <Button size="sm" onClick={() => setExpandedId(isExpanded ? null : row.novelId)}>
                        {isExpanded ? "Hide" : "📖 Manage"}
                      </Button>
                    )}
                    {row.status === "error" && (
                      <Button size="sm" onClick={() => processRow(row.novelId)}>
                        Retry
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.novelId)}
                      className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    >
                      ✕
                    </Button>
                  </div>
                </div>

                {isExpanded && row.status === "synced" && (
                  <BatchNovelDetail
                    novelId={row.novelId}
                    confirm={confirm}
                    onTocChange={(chaps, vols, author, title) =>
                      handleDetailTocChange(row.novelId, chaps, vols, author, title)
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
