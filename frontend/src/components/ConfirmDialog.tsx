export interface ConfirmDialogState {
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmDialogProps {
  state: ConfirmDialogState | null;
  onClose: () => void;
}

/** Generic, reusable confirm/cancel modal. Render once near the app root and
 * drive it via `useConfirmDialog()` from anywhere. */
export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  if (!state) {
    return null;
  }

  const { message, onConfirm, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = state;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <p className="mb-4 text-sm text-gray-800">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
              danger
                ? "rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                : "rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
