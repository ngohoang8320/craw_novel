import { useState } from "react";
import { imageProxyUrl } from "../api/client";
import { coverUrlForTitle, type VolumeGroup } from "../lib/volumeGrouping";
import type { VolumeLabel } from "../types";
import { Button } from "./Button";

interface EpubBuildPanelProps<T extends { order: number; is_complete: boolean }> {
  groups: VolumeGroup<T>[];
  volumes: VolumeLabel[];
  fallbackTitle: string;
  defaultAuthor: string;
  onBuild: (author: string, groups: VolumeGroup<T>[]) => Promise<void>;
}

export function EpubBuildPanel<T extends { order: number; is_complete: boolean }>({
  groups,
  volumes,
  fallbackTitle,
  defaultAuthor,
  onBuild,
}: EpubBuildPanelProps<T>) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTitles, setSelectedTitles] = useState<Set<string | null>>(
    () => new Set(groups.map((g) => g.title)),
  );

  function toggleGroup(title: string | null) {
    setSelectedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }

  function selectAllGroups() {
    setSelectedTitles(new Set(groups.map((g) => g.title)));
  }

  function deselectAllGroups() {
    setSelectedTitles(new Set());
  }

  async function runBuild(groupsToBuild: VolumeGroup<T>[]) {
    setBuilding(true);
    setError(null);
    try {
      await onBuild(author.trim(), groupsToBuild);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuilding(false);
    }
  }

  const selectedGroups = groups.filter((g) => selectedTitles.has(g.title));
  const selectedChapterCount = selectedGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">Build EPUB</h2>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        One EPUB file is built per group below, named after that group's title (chapters with no
        group use "{fallbackTitle}"). Build a single group with its own button, or check the groups
        you want and build them together below.
      </p>
      <div className="mb-2 flex justify-end gap-2">
        <Button size="sm" onClick={selectAllGroups}>
          Select all groups
        </Button>
        <Button size="sm" onClick={deselectAllGroups}>
          Deselect all groups
        </Button>
      </div>
      <ul className="mb-3 max-h-[400px] divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
        {groups.map((group, idx) => {
          const coverUrl = coverUrlForTitle(group.title, volumes);
          const incompleteCount = group.items.filter((item) => !item.is_complete).length;
          return (
            <li key={idx} className="flex items-center gap-3 p-2">
              <input
                type="checkbox"
                checked={selectedTitles.has(group.title)}
                onChange={() => toggleGroup(group.title)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
              {coverUrl ? (
                <img src={imageProxyUrl(coverUrl)} alt="" className="h-12 w-9 rounded object-cover shadow-sm" />
              ) : (
                <span className="h-12 w-9 rounded bg-gray-100 dark:bg-gray-700" />
              )}
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {group.title ?? fallbackTitle}{" "}
                <span className="text-gray-400 dark:text-gray-500">({group.items.length} chapters)</span>
                {incompleteCount > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    ⚠️ {incompleteCount} incomplete
                  </span>
                )}
              </span>
              <Button size="sm" onClick={() => runBuild([group])} disabled={building || group.items.length === 0}>
                Build
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Author (optional)"
          className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <Button
          variant="success"
          onClick={() => runBuild(selectedGroups)}
          disabled={building || selectedChapterCount === 0}
        >
          {building
            ? "Building..."
            : `Build ${selectedGroups.length} EPUB${selectedGroups.length === 1 ? "" : "s"} (${selectedChapterCount} chapters)`}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
