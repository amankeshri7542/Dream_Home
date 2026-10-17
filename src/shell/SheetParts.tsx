// Pieces shared by the details sheet and the Room Studio: the drag handle
// that snaps the phone sheet between heights, and the title header.
import { useRef, type ReactNode } from "react";
import { useEditor } from "../editor/EditorProvider";
import type { SheetSnap } from "../editor/state";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";

export const ORDER: SheetSnap[] = ["peek", "medium", "expanded"];

export function SheetHandle({ desktop }: { desktop: boolean }) {
  const { state, dispatch } = useEditor();
  const start = useRef<{ y: number; id: number } | null>(null);
  if (desktop) return null;
  const index = Math.max(0, ORDER.indexOf(state.sheet));
  const step = (delta: number) => {
    const next = ORDER[Math.max(0, Math.min(ORDER.length - 1, index + delta))];
    dispatch({ type: "sheet", snap: next });
  };
  return (
    <div
      className="dh-sheet-handle"
      role="slider"
      tabIndex={0}
      aria-label="Details panel size"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={index}
      aria-valuetext={state.sheet}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          step(1);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          step(-1);
        }
      }}
      onPointerDown={(e) => {
        start.current = { y: e.clientY, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dy = e.clientY - s.y;
        if (Math.abs(dy) < 8) step(index === ORDER.length - 1 ? -2 : 1);
        else step(dy < 0 ? (dy < -160 ? 2 : 1) : dy > 160 ? -2 : -1);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <i />
    </div>
  );
}

export function Header({
  title,
  kicker,
  meta,
  icon,
  color,
  onBack,
  backLabel = "Back to the list",
  onClose,
  desktop,
}: {
  title: string;
  kicker?: string;
  meta?: string;
  icon?: ReactNode;
  color?: string;
  onBack?: () => void;
  backLabel?: string;
  /** What "Close details" does (default: close the panel). */
  onClose?: () => void;
  desktop: boolean;
}) {
  const { state, dispatch } = useEditor();
  const small = state.sheet === "peek";
  return (
    <div className="dh-inspector-head">
      {onBack && (
        <IconButton icon={Icon.left} tone="plain" label={backLabel} onClick={onBack} />
      )}
      {icon && (
        <span className="dh-chip-icon" style={color ? { background: color } : undefined}>
          {icon}
        </span>
      )}
      <div className="dh-inspector-title">
        {kicker && <span className="dh-kicker">{kicker}</span>}
        <h2>{title}</h2>
        {meta && <p className="dh-truncate dh-num">{meta}</p>}
      </div>
      {!desktop && (
        <IconButton
          icon={small ? Icon.expand : Icon.collapse}
          tone="plain"
          label={small ? "Show details" : "Show less"}
          onClick={() => dispatch({ type: "sheet", snap: small ? "medium" : "peek" })}
        />
      )}
      <IconButton
        icon={Icon.close}
        tone="plain"
        label="Close details"
        onClick={onClose ?? (() => dispatch({ type: "close-panel" }))}
      />
    </div>
  );
}

