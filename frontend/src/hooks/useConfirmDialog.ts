import { useCallback, useState } from "react";
import type { ConfirmDialogState } from "../components/ConfirmDialog";

/** Manages the state for a single, app-wide <ConfirmDialog/>.
 *
 *   const { dialogState, confirm, closeDialog } = useConfirmDialog();
 *   ...
 *   <button onClick={() => confirm({ message: "Delete?", onConfirm: doDelete, danger: true })}>x</button>
 *   ...
 *   <ConfirmDialog state={dialogState} onClose={closeDialog} />
 */
export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<ConfirmDialogState | null>(null);

  const confirm = useCallback((state: ConfirmDialogState) => {
    setDialogState(state);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState(null);
  }, []);

  return { dialogState, confirm, closeDialog };
}
