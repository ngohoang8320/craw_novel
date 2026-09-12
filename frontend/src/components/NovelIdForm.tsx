interface NovelIdFormProps {
  novelId: string;
  onNovelIdChange: (value: string) => void;
  onFetch: () => void;
  loading: boolean;
  error: string | null;
}

export function NovelIdForm({ novelId, onNovelIdChange, onFetch, loading, error }: NovelIdFormProps) {
  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={novelId}
          onChange={(e) => onNovelIdChange(e.target.value)}
          placeholder="e.g. 4699"
          className="w-48 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={onFetch}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Fetching..." : "Fetch table of contents"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
