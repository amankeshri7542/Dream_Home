import { useRef, type ReactNode } from "react";
import { friendlyError, useEditor } from "../editor/EditorProvider";
import type { SheetSnap } from "../editor/state";
import { ROOM_META, type RoomKind } from "../domain/types";

/** What a room is for, in friendly words ("Utility" also covers studies and offices). */
const kindLabel = (kind: RoomKind) => (kind === "utility" ? "Study or utility" : ROOM_META[kind].label);
import { floorName, length, unitLabel } from "../domain/display";
import { Icon, roomIcon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
import { RoomInspector } from "./inspectors/RoomInspector";
import { PlotInspector } from "./inspectors/PlotInspector";
import { SpacesList } from "./inspectors/SpacesList";
import { SpaceDetails } from "./inspectors/SpaceDetails";
import { TrayPanel } from "./inspectors/TrayPanel";
import { CatalogPanel } from "./catalog/CatalogPanel";
import { OpeningInspector, RoomOpeningsPanel } from "./modes/OpeningsPanels";
import { DecorateRoomPanel, FurnitureInspector, Thumb } from "./modes/DecoratePanels";
import { GardenPanel, LandscapeInspector, SitePanel, StylePanel } from "./modes/OutsidePanels";
import { wallLabel } from "../domain/openingCommands";
import { floorForGeometry } from "../domain/core";
import type { TrayPointer } from "../components/RoomTray";

const ORDER: SheetSnap[] = ["peek", "medium", "expanded"];
/** Whole feet (or tenths of a metre) read more easily than 17.1 × 9.2. */
const friendlyLength = (cm: number, unit: "ft" | "m") =>
  unit === "ft" ? String(Math.round(cm / 30.48)) : (Math.round(cm / 10) / 10).toString();

function SheetHandle({ desktop }: { desktop: boolean }) {
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

function Header({
  title,
  kicker,
  meta,
  icon,
  color,
  onBack,
  desktop,
}: {
  title: string;
  kicker?: string;
  meta?: string;
  icon?: ReactNode;
  color?: string;
  onBack?: () => void;
  desktop: boolean;
}) {
  const { state, dispatch } = useEditor();
  const small = state.sheet === "peek";
  return (
    <div className="dh-inspector-head">
      {onBack && (
        <IconButton icon={Icon.left} tone="plain" label="Back to the list" onClick={onBack} />
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
        onClick={() => dispatch({ type: "close-panel" })}
      />
    </div>
  );
}

export function Inspector({
  desktop,
  onTrayDrag,
  onTrayDrop,
}: {
  desktop: boolean;
  onTrayDrag: (pointer: TrayPointer | null) => void;
  onTrayDrop: (pointer: TrayPointer) => void;
}) {
  const editor = useEditor();
  const { state, dispatch, selected, unit, project, error, setError } = editor;
  const open = !!selected || !!state.panel;
  if (!open || state.mode === "explore") return null;
  let content: ReactNode = null;
  let label = "Details";
  const errorBox = error ? (
    <div className="dh-inline-error" role="alert">
      <Icon.warning size={18} aria-hidden />
      <span>{friendlyError(error)}</span>
      <IconButton icon={Icon.close} tone="plain" label="Dismiss error" onClick={() => setError("")} />
    </div>
  ) : null;

  const back = (to: typeof state.selection) => () => dispatch({ type: "select", target: to });
  if (state.panel === "catalog" && !selected) {
    label = "Add space";
    content = <CatalogPanel />;
  } else if (selected?.opening && selected.floor && selected.wall) {
    const room = selected.floor.rooms.find((r) =>
      wallLabel(floorForGeometry(project, selected.floor!.id), selected.wall!).includes(r.name),
    );
    label = selected.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker={floorName(project.floors.indexOf(selected.floor))}
          meta={wallLabel(floorForGeometry(project, selected.floor.id), selected.wall)}
          icon={<Icon.openings size={20} aria-hidden />}
          onBack={room ? back({ kind: "room", floorId: selected.floor.id, id: room.id }) : undefined}
        />
        {errorBox}
        <OpeningInspector />
      </>
    );
  } else if (selected?.furniture && selected.room && selected.floor) {
    label = selected.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker={selected.room.name}
          icon={<Thumb id={selected.furniture.catalogId} label={selected.name} />}
          onBack={back({ kind: "room", floorId: selected.floor.id, id: selected.room.id })}
        />
        {errorBox}
        <FurnitureInspector />
      </>
    );
  } else if (selected?.landscape) {
    label = selected.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker="Garden"
          icon={<Thumb id={selected.landscape.kind} label={selected.name} />}
          onBack={() => dispatch({ type: "open-panel", panel: "garden" })}
        />
        {errorBox}
        <LandscapeInspector />
      </>
    );
  } else if (selected?.room && selected.floor && state.mode !== "build") {
    const room = selected.room;
    const RoomGlyph = roomIcon(room.kind, room.name);
    label = room.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={room.name}
          kicker={state.mode === "decorate" ? "Decorate" : "Doors & windows"}
          meta={`${kindLabel(room.kind)} · ${floorName(project.floors.indexOf(selected.floor))}`}
          icon={<RoomGlyph size={20} aria-hidden />}
          color={ROOM_META[room.kind].color}
          onBack={state.panel === "rooms" ? () => dispatch({ type: "select", target: null }) : undefined}
        />
        {errorBox}
        {state.mode === "decorate" ? (
          <DecorateRoomPanel room={room} floorId={selected.floor.id} />
        ) : (
          <RoomOpeningsPanel room={room} floorId={selected.floor.id} />
        )}
      </>
    );
  } else if (state.panel === "style" || state.panel === "garden" || state.panel === "site") {
    label =
      state.panel === "style" ? "House style" : state.panel === "garden" ? "Garden" : "Ground & fence";
    content = (
      <>
        <Header desktop={desktop} title={label} kicker="Outside" />
        {errorBox}
        {state.panel === "style" ? <StylePanel /> : state.panel === "garden" ? <GardenPanel /> : <SitePanel />}
      </>
    );
  } else if (state.panel === "tray") {
    label = "Room tray";
    content = <TrayPanel onDrag={onTrayDrag} onDrop={onTrayDrop} />;
  } else if (selected?.room && selected.floor) {
    const room = selected.room;
    const RoomGlyph = roomIcon(room.kind, room.name);
    label = room.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={room.name}
          kicker={
            project.floors.length > 1
              ? floorName(project.floors.indexOf(selected.floor))
              : undefined
          }
          meta={[
            ...(ROOM_META[room.kind].label !== room.name ? [kindLabel(room.kind)] : []),
            `${friendlyLength(room.bounds.w, unit)} × ${friendlyLength(room.bounds.d, unit)} ${unitLabel(unit)}`,
          ].join(" · ")}
          icon={<RoomGlyph size={20} aria-hidden />}
          color={ROOM_META[room.kind].color}
          onBack={state.panel === "rooms" ? () => dispatch({ type: "select", target: null }) : undefined}
        />
        {errorBox}
        <RoomInspector />
      </>
    );
  } else if (selected?.item && selected.floor) {
    label = selected.name;
    content = (
      <>
        <Header
          desktop={desktop}
          title={selected.name}
          kicker={floorName(project.floors.indexOf(selected.floor))}
          meta={`${length(selected.item.bounds.w, unit)} × ${length(selected.item.bounds.d, unit)} ${unitLabel(unit)}`}
          icon={
            selected.item.kind === "stairs" ? (
              <Icon.floors size={20} aria-hidden />
            ) : selected.item.kind === "courtyard" ? (
              <Icon.tree size={20} aria-hidden />
            ) : (
              <Icon.day size={20} aria-hidden />
            )
          }
          onBack={state.panel === "rooms" ? () => dispatch({ type: "select", target: null }) : undefined}
        />
        {errorBox}
        <SpaceDetails />
      </>
    );
  } else if (state.panel === "rooms") {
    label = "Rooms & spaces";
    content = (
      <>
        <Header desktop={desktop} title="Rooms & spaces" kicker={floorName(project.floors.indexOf(editor.activeFloor))} />
        {errorBox}
        <SpacesList />
      </>
    );
  } else if (state.panel === "plot") {
    label = "Your plot";
    content = (
      <>
        <Header desktop={desktop} title="Your plot" kicker="Land & building" />
        {errorBox}
        <PlotInspector />
      </>
    );
  }
  return (
    <aside
      className={`dh-inspector ${desktop ? "is-panel" : "is-sheet"}`}
      aria-label={label}
      data-snap={desktop ? "panel" : state.sheet}
      data-chrome="sheet"
      {...(desktop ? { "data-inset": "right" } : {})}
    >
      <SheetHandle desktop={desktop} />
      {/* A new subject starts at the top, never scrolled down to "Remove". */}
      <div
        className="dh-inspector-scroll"
        key={`${selected?.target.kind ?? ""}:${selected?.target.id ?? ""}:${state.panel ?? ""}`}
      >
        {content}
      </div>
    </aside>
  );
}
