import { type ReactNode } from "react";
import { friendlyError, useEditor } from "../editor/EditorProvider";
import { ROOM_META, type RoomKind } from "../domain/types";

/** What a room is for, in friendly words ("Utility" also covers studies and offices). */
const kindLabel = (kind: RoomKind) => (kind === "utility" ? "Study or utility" : ROOM_META[kind].label);
import { floorName, length, unitLabel } from "../domain/display";
import { Icon, roomIcon } from "../ui/icons";
import { IconButton } from "../ui/primitives";
/** Whole feet (or tenths of a metre) read more easily than 17.1 × 9.2. */
const friendlyLength = (cm: number, unit: "ft" | "m") =>
  unit === "ft" ? String(Math.round(cm / 30.48)) : (Math.round(cm / 10) / 10).toString();
import { RoomInspector } from "./inspectors/RoomInspector";
import { Header, SheetHandle } from "./SheetParts";
import { RoomStudio } from "./studio/RoomStudio";
import { SpaceTabs } from "./HomeBar";
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
  // A hero room has its own studio.
  if (state.focus) return <RoomStudio desktop={desktop} />;
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
    label = "Add room";
    content = (
      <>
        <SpaceTabs />
        <CatalogPanel />
      </>
    );
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
    content = (
      <>
        <SpaceTabs />
        <TrayPanel onDrag={onTrayDrag} onDrop={onTrayDrop} />
      </>
    );
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
        <SpaceTabs />
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
