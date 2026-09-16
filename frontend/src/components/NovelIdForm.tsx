import { Button } from './Button';

interface NovelIdFormProps {
	novelId: string;
	onNovelIdChange: (value: string) => void;
	onFetch: () => void;
	loading: boolean;
	error: string | null;
}

export function NovelIdForm({
	novelId,
	onNovelIdChange,
	onFetch,
	loading,
	error
}: NovelIdFormProps) {
	return (
		<div className="flex justify-between items-center space-x-4">
			<label htmlFor="novel-id-input" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
				<div className="mb-2">Novel ID</div>
				<input
					id="novel-id-input"
					type="text"
					value={novelId}
					onChange={(e) => onNovelIdChange(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && onFetch()}
					placeholder="Example: 4699"
					className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<div className="flex gap-2">
				<Button variant="primary" onClick={onFetch} disabled={loading} className="min-w-[120px]">
					{loading ? 'Fetching...' : 'Fetch'}
				</Button>
			</div>
			{error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
		</div>
	);
}
