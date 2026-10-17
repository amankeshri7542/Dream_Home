import type { ReactNode } from "react";
import Plan from "../components/Plan";
import type { TrayPointer } from "../components/RoomTray";
import { transformComponent } from "../domain/model";
import { restoreStagedRoom, setAsideRoom } from "../domain/tray";
import { floorName } from "../domain/display";
import type { Rect } from "../domain/types";
import { useEditor } from "../editor/EditorProvider";
import { targetForId } from "../editor/selection";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/primitives";

export function PlanLens({
  desktop,
  primary,
  trayDrag,
  trayDrop,
  onTrayDropHandled,
  underlay,
  unsure,
  check,
}: {
  /** Checking a builder's plan: its photo under the rooms, the rooms to check, and the panel. */
  underlay?: { href: string; rect: Rect } | null;
  unsure?: string[];
  check?: ReactNode;
  desktop: boolean;
  primary: boolean;
  trayDrag: TrayPointer | null;
  trayDrop: (TrayPointer & { key: number }) | null;
  onTrayDropHandled: () => void;
}) {
  const editor = useEditor();
  const { project, activeFloor, state, dispatch, run, unit } = editor;
  if ((!state.lens && !primary) || state.mode === "explore") return null;
  const tool = state.tool;
  const hint =
    tool !== "select"
      ? "Drag a room to move it, or pull a dot to resize it. Drop a room on another to swap them."
      : state.tray.selected
          ? "Tap an empty spot to place the piece."
          : "Tap a space to select it.";
  const changeOnPlan = (id: string, bounds: Rect, kind: "move" | "resize") => {
    const name =
      targetForId(project, id, activeFloor.id) &&
      activeFloor.rooms.find((r) => r.id === id)?.name;
    run(
      transformComponent(project, activeFloor.id, id, bounds, kind),
      `${kind === "resize" ? "Resize" : "Move"} ${name ?? "space"}`,
      { notice: kind === "resize" ? "Resized! Undo is always here." : "Moved! Undo is always here." },
    );
  };
  return (
    <section
      className={`dh-lens plan-pane ${desktop ? "is-docked" : "is-overlay"} ${primary ? "is-primary" : ""}`}
      aria-label="Floor plan"
      data-chrome="lens"
      {...(desktop && !primary ? { "data-inset": "left" } : {})}
    >
      <div className="dh-lens-head">
        <span className="dh-lens-title">
          <Icon.floorPlan size={18} aria-hidden />
          <strong>{floorName(project.floors.indexOf(activeFloor))}</strong>
          {desktop && <small>{hint}</small>}
        </span>
        {!desktop && project.floors.length > 1 && (
          <span className="dh-lens-floors">
            <IconButton
              icon={Icon.floorDown}
              tone="plain"
              label="Floor below"
              disabled={project.floors.indexOf(activeFloor) === 0}
              onClick={() =>
                dispatch({
                  type: "choose-floor",
                  floor: project.floors[project.floors.indexOf(activeFloor) - 1].id,
                })
              }
            />
            <IconButton
              icon={Icon.floorUp}
              tone="plain"
              label="Floor above"
              disabled={project.floors.indexOf(activeFloor) === project.floors.length - 1}
              onClick={() =>
                dispatch({
                  type: "choose-floor",
                  floor: project.floors[project.floors.indexOf(activeFloor) + 1].id,
                })
              }
            />
          </span>
        )}
        {!desktop && (
          <IconButton
            icon={Icon.viewOptions}
            tone="plain"
            label="Plan view options"
            pressed={state.viewOptions}
            onClick={() => dispatch({ type: "view-options", open: !state.viewOptions })}
          />
        )}
        {!primary && (
          <IconButton
            icon={Icon.close}
            tone="plain"
            label="Close floor plan"
            onClick={() => dispatch({ type: "lens", open: false })}
          />
        )}
      </div>
      <div className="dh-lens-body">
        <Plan
          project={project}
          floor={activeFloor}
          selected={editor.selected?.target.id ?? null}
          onSelect={(id) => {
            if (!id) return dispatch({ type: "select", target: null });
            const target = targetForId(project, id, activeFloor.id);
            if (target) dispatch({ type: "select", target });
          }}
          view={state.view}
          language="en"
          unit={unit}
          editable={tool !== "select"}
          tool={tool}
          onMove={changeOnPlan}
          stagedRoomId={state.tray.selected}
          stagedUnitId={state.tray.unit === "auto" ? undefined : state.tray.unit || null}
          onPlaceStaged={(id, bounds) => {
            onTrayDropHandled();
            if (
              run(
                restoreStagedRoom(project, id, activeFloor.id, {
                  position: { x: bounds.x, z: bounds.z },
                  unitId: state.tray.unit === "auto" ? undefined : state.tray.unit || null,
                }),
                "Place a kept room back",
              )
            ) {
              dispatch({ type: "tray-select", id: null });
              dispatch({ type: "close-panel" });
              dispatch({ type: "select", target: { kind: "room", floorId: activeFloor.id, id } });
              dispatch({ type: "notify", text: "Piece placed. Move or resize it to make it yours.", tone: "success" });
            }
          }}
          onSetAside={(id) => {
            const name = activeFloor.rooms.find((r) => r.id === id)?.name ?? "Room";
            if (run(setAsideRoom(project, activeFloor.id, id), `Keep ${name} for later`, { select: null }))
              dispatch({ type: "open-panel", panel: "tray" });
          }}
          trayDrag={trayDrag}
          trayDrop={trayDrop}
          onTrayDropHandled={onTrayDropHandled}
          underlay={underlay}
          unsure={unsure}
        />
      </div>
      {check}
    </section>
  );
}
