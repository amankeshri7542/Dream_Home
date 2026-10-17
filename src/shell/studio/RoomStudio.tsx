// The Room Studio: when a room is the hero, its tools live here — a header to
// step between rooms or go back home, and four tabs (Furniture, Colours,
// Layout, Doors). A tapped piece of furniture or a door swaps the tabs for its
// own controls, so sheets never stack. A short tray on phones, the side panel
// on desktop.
import { useRef, type ReactNode } from "react";
import { floorForGeometry } from "../../domain/core";
import { floorName, unitLabel } from "../../domain/display";
import { wallLabel } from "../../domain/openingCommands";
import { ROOM_META, type Room } from "../../domain/types";
import { friendlyError, useEditor } from "../../editor/EditorProvider";
import { neighbourRoom } from "../../editor/rooms";
import { ROOM_TABS, type RoomTab } from "../../editor/state";
import { Icon, roomIcon, type LucideIcon } from "../../ui/icons";
import { Button, IconButton } from "../../ui/primitives";
import { TalkButton } from "../../voice/TalkButton";
import { RoomInspector } from "../inspectors/RoomInspector";
import { DecorateRoomPanel, FurnitureInspector, Thumb } from "../modes/DecoratePanels";
import { OpeningInspector, RoomOpeningsPanel } from "../modes/OpeningsPanels";
import { ActionDock } from "../Palette";
import { Header, SheetHandle } from "../SheetParts";
import "./studio.css";

const TABS: Record<RoomTab, { label: string; icon: LucideIcon }> = {
  furniture: { label: "Furniture", icon: Icon.decorate },
  colours: { label: "Colours", icon: Icon.paint },
  layout: { label: "Layout", icon: Icon.resize },
  doors: { label: "Doors", icon: Icon.openings },
};
const kindLabel = (room: Room) => (room.kind === "utility" ? "Study or utility" : ROOM_META[room.kind].label);
const feet = (cm: number, unit: "ft" | "m") =>
  unit === "ft" ? String(Math.round(cm / 30.48)) : (Math.round(cm / 10) / 10).toString();

export function RoomStudio({ desktop }: { desktop: boolean }) {
  const editor = useEditor();
  const { state, dispatch, project, selected, unit, error, setError } = editor;
  const focus = state.focus;
  const floor = focus ? project.floors.find((f) => f.id === focus.floorId) : undefined;
  const room = floor?.rooms.find((r) => r.id === focus!.roomId);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  if (!focus || !floor || !room) return null;
  const small = !desktop && state.sheet === "peek";

  const step = (dir: 1 | -1) => {
    const next = neighbourRoom(project, room.id, dir);
    if (next) dispatch({ type: "enter-room", ...next });
  };
  const errorBox = error ? (
    <div className="dh-inline-error" role="alert">
      <Icon.warning size={18} aria-hidden />
      <span>{friendlyError(error)}</span>
      <IconButton icon={Icon.close} tone="plain" label="Dismiss error" onClick={() => setError("")} />
    </div>
  ) : null;
  const backToRoom = () => dispatch({ type: "select", target: { kind: "room", floorId: floor.id, id: room.id } });

  let body: ReactNode;
  let piece = false;
  if (selected?.furniture && selected.room) {
    piece = true;
    body = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker={selected.room.name}
          icon={<Thumb id={selected.furniture.catalogId} label={selected.name} />}
          onBack={backToRoom}
          backLabel={`Back to ${room.name}`}
          onClose={backToRoom}
        />
        {errorBox}
        <FurnitureInspector />
      </>
    );
  } else if (selected?.opening && selected.wall) {
    piece = true;
    body = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker={room.name}
          meta={wallLabel(floorForGeometry(project, floor.id), selected.wall, project.plot)}
          icon={<Icon.openings size={20} aria-hidden />}
          onBack={backToRoom}
          backLabel={`Back to ${room.name}`}
          onClose={backToRoom}
        />
        {errorBox}
        <OpeningInspector />
      </>
    );
  } else {
    const tab = state.roomTab;
    body = (
      <>
        <div className="dh-studio-tabs" role="tablist" aria-label={`Edit ${room.name}`}>
          {ROOM_TABS.map((t) => {
            const T = TABS[t];
            return (
              <button
                key={t}
                type="button"
                role="tab"
                id={`dh-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="dh-studio-panel"
                tabIndex={tab === t ? 0 : -1}
                onClick={() => dispatch({ type: "room-tab", tab: t })}
                onKeyDown={(e) => {
                  const i = ROOM_TABS.indexOf(t);
                  const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
                  if (to === null) return;
                  e.preventDefault();
                  const next = ROOM_TABS[(to + ROOM_TABS.length) % ROOM_TABS.length];
                  dispatch({ type: "room-tab", tab: next });
                  document.getElementById(`dh-tab-${next}`)?.focus();
                }}
              >
                <T.icon size={18} aria-hidden />
                {T.label}
              </button>
            );
          })}
        </div>
        {errorBox}
        <div className="dh-studio-panel" role="tabpanel" id="dh-studio-panel" aria-labelledby={`dh-tab-${tab}`}>
          {tab === "furniture" || tab === "colours" ? (
            <DecorateRoomPanel room={room} floorId={floor.id} part={tab} />
          ) : tab === "layout" ? (
            <div className="dh-inspector-body">
              {/* While moving or resizing, the bar floats above the tucked-down tray. */}
              {state.tool === "select" && <ActionDock />}
              <RoomInspector />
            </div>
          ) : (
            <>
              <RoomOpeningsPanel room={room} floorId={floor.id} />
              {floor.openings && (
                <Button
                  variant="ghost"
                  icon={Icon.auto}
                  full
                  onClick={() =>
                    dispatch({
                      type: "confirm",
                      confirm: {
                        title: "Go back to automatic doors and windows?",
                        body: "Every door and window on this floor will be placed automatically again. Undo brings your arrangement back.",
                        confirmLabel: "Make them automatic",
                        action: `reset-openings:${floor.id}`,
                      },
                    })
                  }
                >
                  Make doors & windows automatic
                </Button>
              )}
            </>
          )}
        </div>
      </>
    );
  }
  const RoomGlyph = roomIcon(room.kind, room.name);
  return (
    <aside
      className={`dh-inspector dh-studio ${desktop ? "is-panel" : "is-sheet"}`}
      aria-label={`${room.name} studio`}
      data-snap={desktop ? "panel" : state.sheet}
      data-chrome="sheet"
      {...(desktop ? { "data-inset": "right" } : {})}
    >
      <SheetHandle desktop={desktop} />
      <div
        className="dh-studio-head"
        // A sideways swipe on the header steps to the next room.
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x,
            dy = e.clientY - s.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
        }}
      >
        <IconButton icon={Icon.home} tone="plain" label="Back to home" onClick={() => dispatch({ type: "leave-room" })} />
        {!small && <IconButton icon={Icon.left} tone="plain" label="Previous room" onClick={() => step(-1)} />}
        <span className="dh-chip-icon" style={{ background: ROOM_META[room.kind].color }} aria-hidden>
          <RoomGlyph size={20} />
        </span>
        <div className="dh-studio-title" aria-live="polite">
          <h2>{room.name}</h2>
          <p className="dh-num">
            {[
              ...(ROOM_META[room.kind].label !== room.name ? [kindLabel(room)] : []),
              `${feet(room.bounds.w, unit)} × ${feet(room.bounds.d, unit)} ${unitLabel(unit)}`,
              ...(project.floors.length > 1 ? [floorName(project.floors.indexOf(floor))] : []),
            ].join(" · ")}
          </p>
        </div>
        {/* On desktop, Talk is in the top bar. */}
        {!desktop && <TalkButton place="header" />}
        <IconButton
          icon={Icon.sunlight}
          tone="plain"
          label={`Sunlight in ${room.name}`}
          onClick={() => dispatch({ type: "overlay", overlay: "sunlight" })}
        />
        <IconButton
          icon={Icon.photo}
          tone="plain"
          label={`Take a photo of ${room.name}`}
          onClick={() => dispatch({ type: "overlay", overlay: "photo" })}
        />
        {small ? (
          // Tucked down beside the floor plan: one tap brings the tools back.
          <IconButton icon={Icon.expand} tone="plain" label="Show details" onClick={() => dispatch({ type: "sheet", snap: "medium" })} />
        ) : (
          <IconButton icon={Icon.right} tone="plain" label="Next room" onClick={() => step(1)} />
        )}
      </div>
      <div className="dh-inspector-scroll" key={piece ? `piece:${selected?.target.id}` : `tab:${state.roomTab}:${room.id}`}>
        {body}
      </div>
    </aside>
  );
}
