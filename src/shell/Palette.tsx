import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEditor } from "../editor/EditorProvider";
import { useSelectionActions } from "../editor/actions";
import { Icon, roomIcon } from "../ui/icons";

const BathIcon = roomIcon("bathroom");
import { ToolButton } from "../ui/primitives";

const MODE_HINTS: Partial<Record<string, string>> = {
  build: "Tap any room to step inside",
  openings: "Tap a room to add a door or window",
  decorate: "Tap a room to decorate it",
  outside: "Style the outside or plant a garden",
};

/** A friendly next-step hint for the current mode. */
export function ModeHint() {
  const { state, selected } = useEditor();
  if (state.mode === "build" && state.tool === "move" && !state.lens)
    return (
      <p className="dh-mode-hint is-tool" role="note">
        <Icon.move size={16} aria-hidden />
        {selected
          ? "Drag the glowing piece to a new spot"
          : "Drag any room to a new spot"}
      </p>
    );
  const hint = MODE_HINTS[state.mode];
  if (!hint || selected || state.panel || state.focus) return null;
  return (
    <p className="dh-mode-hint" role="note">
      <Icon.info size={16} aria-hidden />
      {hint}
    </p>
  );
}

export function ActionDock() {
  const editor = useEditor();
  const { state, dispatch, selected } = editor;
  const actions = useSelectionActions();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Keyboard users land on the first item when the menu opens.
  useEffect(() => {
    if (more) menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [more]);
  /** Arrow keys move through the menu; Escape closes only the menu. */
  const menuKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setMore(false);
      moreButton.current?.focus();
    } else if (e.key === "Tab") setMore(false);
  };
  useEffect(() => {
    if (!more) return;
    const close = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [more]);
  if (!selected || state.mode === "explore") return null;
  const target = selected.target;
  const building = state.mode === "build";
  const room = building && target.kind === "room";
  const spatial =
    building &&
    (room || target.kind === "balcony" || target.kind === "vertical");
  // Leave any tool and close the plan, so what a menu item reveals is visible.
  const leaveTool = () => {
    if (state.lens) dispatch({ type: "lens", open: false });
    if (state.tool !== "select") dispatch({ type: "set-tool", tool: "select" });
  };
  return (
    // The menu lives beside the toolbar, not inside it: the toolbar scrolls
    // sideways on small phones, and a scroll box would clip the menu.
    <div className="dh-dock-wrap" ref={moreRef}>
      <div
        className="dh-dock"
        role="toolbar"
        aria-label={`${selected.name} actions`}
        data-chrome="dock"
        data-transform-state={state.tool === "select" ? "idle" : state.tool}
      >
        {spatial && (
          <>
            <ToolButton
              icon={Icon.move}
              label="Move"
              pressed={state.tool === "move"}
              onClick={() =>
                dispatch({
                  type: "set-tool",
                  tool: state.tool === "move" ? "select" : "move",
                  // Pieces move right in 3D; the floor plan stays one tap away.
                  lens: false,
                })
              }
            />
            <ToolButton
              icon={Icon.resize}
              label="Edit in 2D"
              pressed={state.tool === "resize"}
              onClick={() =>
                dispatch({
                  type: "set-tool",
                  tool: state.tool === "resize" ? "select" : "resize",
                })
              }
            />
          </>
        )}
        {room && state.tool === "select" && (
          <>
            <ToolButton
              icon={Icon.rotate}
              label="Rotate"
              onClick={actions.rotate}
            />
            <ToolButton
              icon={Icon.duplicate}
              label="Duplicate"
              onClick={actions.duplicate}
            />
          </>
        )}
        {room && (
          // Also the drop target while moving: drag the room here to keep it for later.
          <ToolButton
            icon={Icon.tray}
            label="Keep for later"
            caption="For later"
            data-room-tray-drop
            onClick={actions.setAside}
          />
        )}
        <div className="dh-dock-more">
          <ToolButton
            ref={moreButton}
            icon={Icon.more}
            label="More actions"
            caption="More"
            aria-expanded={more}
            aria-haspopup="menu"
            onClick={() => setMore(!more)}
          />
        </div>
        {state.tool !== "select" && (
          <ToolButton
            icon={Icon.check}
            label="Done"
            className="dh-tool-done"
            onClick={() => dispatch({ type: "set-tool", tool: "select" })}
          />
        )}
      </div>
      {more && (
        <div
          ref={menuRef}
          className="dh-menu"
          role="menu"
          aria-label={`More for ${selected.name}`}
          onKeyDown={menuKeys}
        >
          {spatial && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMore(false);
                leaveTool();
                actions.focus();
              }}
            >
              <Icon.focusRoom size={18} aria-hidden />
              Focus on {room ? "room" : "space"}
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMore(false);
              leaveTool();
              dispatch({ type: "sheet", snap: "expanded" });
            }}
          >
            <Icon.viewOptions size={18} aria-hidden />
            All details
          </button>
          {building && actions.canAddEnsuite && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMore(false);
                leaveTool();
                actions.addEnsuite();
              }}
            >
              <BathIcon size={18} aria-hidden />
              Add attached bathroom
            </button>
          )}
          {spatial && (
            <button
              role="menuitem"
              type="button"
              className="is-danger"
              onClick={() => {
                setMore(false);
                actions.requestRemove();
              }}
            >
              <Icon.remove size={18} aria-hidden />
              Remove…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
