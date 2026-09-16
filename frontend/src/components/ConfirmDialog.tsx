import { Button } from "./Button";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <p className="mb-5 text-sm text-gray-800 dark:text-gray-200">{message}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{cancelLabel}</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
