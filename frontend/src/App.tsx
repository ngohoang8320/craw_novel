import { useState } from "react";
import { BatchQueuePanel } from "./components/BatchQueuePanel";
import { Button } from "./components/Button";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { NovelIdForm } from "./components/NovelIdForm";
import { NovelWorkspace } from "./components/NovelWorkspace";
import { ThemeToggle } from "./components/ThemeToggle";
import { useConfirmDialog } from "./hooks/useConfirmDialog";
import { useNovelToc } from "./hooks/useNovelToc";
import { useTheme } from "./hooks/useTheme";
import { clearAutopilotChain, syncAutopilotQueue } from "./lib/autopilotBridge";

const DEFAULT_NOVEL_ID = import.meta.env.VITE_DEFAULT_NOVEL_ID ?? "";

function App() {
  const [view, setView] = useState<"single" | "batch">("single");
  const [novelIdInput, setNovelIdInput] = useState(DEFAULT_NOVEL_ID);
  // The novel_id the workspace below is actually loaded for - kept separate
  // from `novelIdInput` (the live input box value) so editing the input
  // after fetching doesn't send API calls for the wrong (or empty) novel_id.
  const [loadedNovelId, setLoadedNovelId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { dialogState, confirm, closeDialog } = useConfirmDialog();
  const { theme, toggleTheme } = useTheme();
  const novel = useNovelToc(loadedNovelId);

  function handleFetchToc() {
    if (!novelIdInput.trim()) {
      setFetchError("Please enter a novel_id.");
      return;
    }
    setFetchError(null);
    setLoadedNovelId(novelIdInput.trim());
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100">
      <header className="relative border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto max-w-6xl px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bilinovel → EPUB Crawler</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Internal tool for building offline EPUBs from crawled chapters.
          </p>
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 sm:right-6">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-2 px-6 pt-4">
        <Button variant={view === "single" ? "primary" : "secondary"} onClick={() => setView("single")}>
          Single novel
        </Button>
        <Button variant={view === "batch" ? "primary" : "secondary"} onClick={() => setView("batch")}>
          Batch queue
        </Button>
      </div>

      <main className="mx-auto max-w-6xl space-y-4 p-6">
        {view === "batch" && (
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <BatchQueuePanel confirm={confirm} />
          </section>
        )}

        {view === "single" && (
          <>
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <NovelIdForm
                novelId={novelIdInput}
                onNovelIdChange={setNovelIdInput}
                onFetch={handleFetchToc}
                loading={novel.loading}
                error={fetchError ?? novel.error}
              />
            </section>

            {novel.toc.length > 0 && (
              <NovelWorkspace
                novelId={loadedNovelId ?? ""}
                toc={novel.toc}
                volumes={novel.volumes}
                novelAuthor={novel.novelAuthor}
                lockedChapters={novel.lockedChapters}
                unlockedChapters={novel.unlockedChapters}
                selectedIds={novel.selectedIds}
                selectedChapters={novel.selectedChapters}
                onToggle={novel.toggleChapter}
                onSelectAll={novel.selectAll}
                onDeselectAll={novel.deselectAll}
                onSelectGroup={novel.selectGroup}
                onDeselectGroup={novel.deselectGroup}
                onRetryUnresolved={novel.retryUnresolved}
                onSetManualLink={novel.setManualLink}
                onForgetRecovered={novel.forgetRecovered}
                confirm={confirm}
                onSyncAutopilot={() => {
                  clearAutopilotChain();
                  syncAutopilotQueue(loadedNovelId ?? "", novel.selectedChapters);
                }}
              />
            )}

            {novel.toc.length === 0 && (
              <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-600 dark:bg-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enter a novel_id above and click "Fetch" to get started.
                </p>
              </section>
            )}
          </>
        )}
      </main>

      <ConfirmDialog state={dialogState} onClose={closeDialog} />
    </div>
  );
}

export default App;
