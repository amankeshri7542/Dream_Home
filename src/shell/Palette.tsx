import { useEffect, useRef, useState } from "react";
import { useEditor } from "../editor/EditorProvider";
import { useSelectionActions } from "../editor/actions";
import { Icon } from "../ui/icons";
import { ToolButton } from "../ui/primitives";

const MODE_HINTS: Partial<Record<string, string>> = {
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
  if (!hint || selected || state.panel) return null;
  return (
    <p className="dh-mode-hint" role="note">
      <Icon.info size={16} aria-hidden />
      {hint}
    </p>
  );
}

function ModeTools({ rail }: { rail: boolean }) {
  const { state, dispatch, activeFloor } = useEditor();
  const common = {
    className: `dh-palette ${rail ? "dh-palette-rail" : ""}`,
    role: "toolbar",
    "aria-orientation": (rail ? "vertical" : "horizontal") as
      "vertical" | "horizontal",
    "data-chrome": "palette",
    ...(rail ? { "data-inset": "left" } : {}),
  };
  if (state.mode === "openings")
    return (
      <div {...common} aria-label="Door and window tools">
        <ToolButton
          icon={Icon.roomsList}
          label="Rooms"
          pressed={state.panel === "rooms"}
          onClick={() => dispatch({ type: "open-panel", panel: "rooms" })}
        />
        <ToolButton
          icon={Icon.auto}
          label="Automatic"
          disabled={!activeFloor.openings}
          title="Place every door and window on this floor automatically again"
          onClick={() =>
            dispatch({
              type: "confirm",
              confirm: {
                title: "Go back to automatic doors and windows?",
                body: "Every door and window on this floor will be placed automatically again. Undo brings your arrangement back.",
                confirmLabel: "Make them automatic",
                action: `reset-openings:${activeFloor.id}`,
              },
            })
          }
        />
      </div>
    );
  if (state.mode === "decorate")
    return (
      <div {...common} aria-label="Decorating tools">
        <ToolButton
          icon={Icon.roomsList}
          label="Rooms"
          pressed={state.panel === "rooms"}
          onClick={() => dispatch({ type: "open-panel", panel: "rooms" })}
        />
      </div>
    );
  if (state.mode === "outside")
    return (
      <div {...common} aria-label="Outside tools">
        <ToolButton
          icon={Icon.palette}
          label="House style"
          pressed={state.panel === "style"}
          onClick={() => dispatch({ type: "open-panel", panel: "style" })}
        />
        <ToolButton
          icon={Icon.tree}
          label="Garden"
          pressed={state.panel === "garden"}
          onClick={() => dispatch({ type: "open-panel", panel: "garden" })}
        />
        <ToolButton
          icon={Icon.fence}
          label="Ground & fence"
          caption="Ground"
          pressed={state.panel === "site"}
          onClick={() => dispatch({ type: "open-panel", panel: "site" })}
        />
      </div>
    );
  return null;
}

export function ToolPalette({ rail }: { rail: boolean }) {
  const { state, dispatch, project } = useEditor();
  if (state.mode !== "build") return <ModeTools rail={rail} />;
  const staged = project.stagedRooms?.length ?? 0;
  return (
    <div
      className={`dh-palette ${rail ? "dh-palette-rail" : ""}`}
      role="toolbar"
      aria-label="Building tools"
      aria-orientation={rail ? "vertical" : "horizontal"}
      data-chrome="palette"
      {...(rail ? { "data-inset": "left" } : {})}
    >
      <ToolButton
        icon={Icon.add}
        label="Add space"
        caption="Add space"
        className="dh-tool-primary"
        pressed={state.panel === "catalog"}
        onClick={() => dispatch({ type: "open-panel", panel: "catalog" })}
      />
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
      <ToolButton
        icon={Icon.roomsList}
        label="Rooms"
        pressed={state.panel === "rooms"}
        onClick={() => dispatch({ type: "open-panel", panel: "rooms" })}
      />
      <ToolButton
        icon={Icon.plot}
        label="My plot"
        pressed={state.panel === "plot"}
        onClick={() => dispatch({ type: "open-panel", panel: "plot" })}
      />
      <ToolButton
        icon={Icon.tray}
        label="Tray"
        aria-label={`Room tray, ${staged} ${staged === 1 ? "piece" : "pieces"}`}
        badge={staged}
        pressed={state.panel === "tray"}
        data-room-tray-drop
        onClick={() => dispatch({ type: "open-panel", panel: "tray" })}
      />
    </div>
  );
}

export function ActionDock() {
  const editor = useEditor();
  const { state, dispatch, selected } = editor;
  const actions = useSelectionActions();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
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
            <ToolButton
              icon={Icon.tray}
              label="Set aside"
              onClick={actions.setAside}
            />
          </>
        )}
        <div className="dh-dock-more">
          <ToolButton
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
          className="dh-menu"
          role="menu"
          aria-label={`More for ${selected.name}`}
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
