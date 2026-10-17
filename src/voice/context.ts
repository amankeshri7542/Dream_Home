// What the helper is told about the home: floors and rooms by short refs (f1,
// r3), each room's size in the home's unit and where it sits as seen from the
// road, never ids. The app keeps the refs → ids map to run the answer.
import { roomZone } from "../domain/compass";
import { resolveFurniture, roomWalls } from "../domain/furniture";
import type { Project, Rect } from "../domain/types";
import type { Unit } from "../domain/display";
import { CONTEXT_MAX, FURNITURE_IDS, type ContextRoom, type VoiceContext } from "./tools";

export type RoomRef = { floorId: string; roomId: string };
export type RefMap = { rooms: Map<string, RoomRef>; floors: Map<string, string> };
export type ContextView = {
  unit: Unit;
  mode: "build" | "openings" | "decorate" | "outside" | "explore";
  /** The room you're inside, if any. */
  focus: RoomRef | null;
  /** The selected room, if any. */
  selectedRoomId?: string | null;
};

const third = (t: number, low: string, mid: string, high: string) => (t < 0.34 ? low : t > 0.66 ? high : mid);

/** Where a room sits, as you'd say it standing on the road facing the house: "front-left", "back", "middle". */
export function placeOf(road: Project["plot"]["road"], fp: Rect, b: Rect): string {
  const cx = b.x + b.w / 2,
    cz = b.z + b.d / 2;
  const fx = (cx - fp.x) / fp.w,
    fz = (cz - fp.z) / fp.d;
  // across: 0 on your left, 1 on your right; back: 0 by the road, 1 at the back.
  const [across, back] =
    road === "south" ? [fx, 1 - fz] : road === "north" ? [1 - fx, fz] : road === "east" ? [1 - fz, 1 - fx] : [fz, fx];
  const row = third(back, "front", "middle", "back"),
    col = third(across, "left", "", "right");
  return col ? `${row}-${col}` : row;
}

const inUnit = (cm: number, unit: Unit) => (unit === "m" ? Math.round(cm / 10) / 10 : Math.round((cm / 30.48) * 2) / 2);

/** The context for one request, kept under 3 KB, and the map from its refs back to ids. */
export function buildVoiceContext(project: Project, view: ContextView): { context: VoiceContext; refs: RefMap } {
  const refs: RefMap = { rooms: new Map(), floors: new Map() };
  const floors = project.floors.slice(0, 6).map((f, i) => {
    refs.floors.set(`f${i + 1}`, f.id);
    return { ref: `f${i + 1}`, name: f.name.slice(0, 30) };
  });
  const rooms: ContextRoom[] = [];
  let open: string | undefined, selected: string | undefined;
  project.floors.slice(0, 6).forEach((floor, fi) => {
    for (const room of floor.rooms) {
      if (rooms.length >= 60) return;
      const ref = `r${rooms.length + 1}`;
      refs.rooms.set(ref, { floorId: floor.id, roomId: room.id });
      if (view.focus?.roomId === room.id) open = ref;
      if (view.selectedRoomId === room.id) selected = ref;
      const zone = project.plot.compass ? roomZone(project, floor.id, room) : null;
      const where = placeOf(project.plot.road, floor.footprint, room.bounds);
      rooms.push({
        ref,
        name: room.name.slice(0, 40),
        kind: room.kind,
        floor: `f${fi + 1}`,
        w: inUnit(room.bounds.w, view.unit),
        d: inUnit(room.bounds.d, view.unit),
        at: zone && zone !== "centre" ? `${where}, ${zone}` : where,
      });
    }
  });
  let items: string[] | undefined;
  if (view.focus) {
    const room = project.floors.find((f) => f.id === view.focus!.floorId)?.rooms.find((r) => r.id === view.focus!.roomId);
    if (room)
      items = [...new Set(resolveFurniture(room, roomWalls(project, view.focus.floorId)).map((i) => i.catalogId))].filter((id) =>
        FURNITURE_IDS.includes(id),
      );
  }
  const context: VoiceContext = {
    unit: view.unit,
    look: project.style?.preset ?? null,
    mode: view.mode === "explore" ? "explore" : view.mode === "outside" ? "outside" : view.focus ? "room" : "home",
    floors,
    rooms,
    ...(open ? { open } : {}),
    ...(open && items?.length ? { items } : {}),
    ...(selected ? { selected } : {}),
  };
  // Big homes: drop the extras before anything that names a room.
  const fits = () => JSON.stringify(context).length <= CONTEXT_MAX;
  if (!fits()) delete context.items;
  if (!fits()) for (const r of context.rooms) r.at = r.at?.split(",")[0];
  if (!fits()) for (const r of context.rooms) delete r.at;
  if (!fits()) for (const r of context.rooms) r.name = r.name.slice(0, 16);
  while (!fits() && context.rooms.length > 1) {
    const gone = context.rooms.pop()!;
    refs.rooms.delete(gone.ref);
  }
  return { context, refs };
}
