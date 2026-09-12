"""Generic, reusable confirmation popup.

Usage: call `confirm_dialog(...)` directly from the branch that handles a
button click - Streamlit opens the modal for the rest of the current script
run and keeps it open across reruns until Cancel/Confirm is pressed.

    if st.button("Delete"):
        confirm_dialog(
            message="Delete this item?",
            on_confirm=lambda: do_delete(item_id),
            confirm_label="Delete",
            danger=True,
        )
"""
from typing import Callable

import streamlit as st


@st.dialog("Confirm")
def confirm_dialog(
    message: str,
    on_confirm: Callable[[], None],
    *,
    confirm_label: str = "Confirm",
    cancel_label: str = "Cancel",
    danger: bool = False,
) -> None:
    """Show a confirm/cancel popup.

    Args:
        message: text shown in the dialog body.
        on_confirm: zero-argument callable invoked only if the user confirms.
        confirm_label: text for the confirm button.
        cancel_label: text for the cancel button.
        danger: if True, the confirm button is styled as the emphasized
            ("primary") action, for destructive operations.
    """
    st.write(message)
    cancel_col, confirm_col = st.columns(2)
    with cancel_col:
        if st.button(cancel_label, use_container_width=True):
            st.rerun()
    with confirm_col:
        if st.button(confirm_label, type="primary" if danger else "secondary", use_container_width=True):
            on_confirm()
            st.rerun()
