import { useEffect, useRef } from "react";
import { friendlyError, useEditor } from "../editor/EditorProvider";
import { useSelectionActions } from "../editor/actions";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { resetFloorOpenings } from "./modes/OpeningsPanels";

export function Notifications() {
  const editor = useEditor();
  const { state, dispatch, error, setError } = editor;
  const notice = state.notice;
  const showError = !!error && !state.selection && !state.panel;
  return (
    <div
      className="dh-notify"
      role="status"
      aria-label="Notifications"
      aria-live="polite"
      data-chrome="notifications"
    >
      {showError ? (
        <div className="dh-toast is-error" key="error">
          <Icon.warning size={20} aria-hidden />
          <span>{friendlyError(error)}</span>
          <IconButton
            icon={Icon.close}
            tone="plain"
            label="Dismiss notification"
            onClick={() => setError("")}
          />
        </div>
      ) : (
        notice && (
          <div className={`dh-toast is-${notice.tone}`} key={notice.id}>
            {notice.tone === "success" ? (
              <Icon.valid size={20} aria-hidden />
            ) : notice.tone === "error" ? (
              <Icon.warning size={20} aria-hidden />
            ) : (
              <Icon.info size={20} aria-hidden />
            )}
            <span>{notice.text}</span>
            {notice.undo && editor.canUndo && (
              <button
                type="button"
                className="dh-toast-action"
                onClick={() => {
                  editor.undo();
                  dispatch({ type: "dismiss-notice" });
                }}
              >
                Undo
              </button>
            )}
            <IconButton
              icon={Icon.close}
              tone="plain"
              label="Dismiss notification"
              onClick={() => dispatch({ type: "dismiss-notice" })}
            />
          </div>
        )
      )}
    </div>
  );
}

export function ConfirmDialog() {
  const { state, dispatch } = useEditor();
  const actions = useSelectionActions();
  const editor = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const confirm = state.confirm;
  useEffect(() => {
    if (confirm && !ref.current?.open) ref.current?.showModal();
    if (!confirm && ref.current?.open) ref.current.close();
  }, [confirm]);
  if (!confirm) return null;
  const run = (action?: string) => {
    dispatch({ type: "confirm", confirm: null });
    if (action === "remove") actions.remove();
    if (action === "set-aside") actions.setAside();
    if (action?.startsWith("reset-openings:"))
      resetFloorOpenings(editor, action.slice("reset-openings:".length));
  };
  return (
    <dialog
      ref={ref}
      className="dh-confirm"
      aria-label={confirm.title}
      onCancel={(e) => {
        e.preventDefault();
        dispatch({ type: "confirm", confirm: null });
      }}
    >
      <h2>{confirm.title}</h2>
      <p>{confirm.body}</p>
      <div className="dh-confirm-actions">
        {confirm.safeLabel && (
          <Button variant="primary" autoFocus onClick={() => run(confirm.safeAction)}>
            {confirm.safeLabel}
          </Button>
        )}
        <Button
          variant="danger"
          autoFocus={!confirm.safeLabel}
          onClick={() => run(confirm.action)}
        >
          {confirm.confirmLabel}
        </Button>
        <Button variant="ghost" onClick={() => run()}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
