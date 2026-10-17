// Door/window commands. Each command first turns the floor's automatic openings
// into an explicit list (accepting `auto:` ids), then validates via finalizeEdit.
import "./features";
import { floorForGeometry, replaceFloor } from "./core";
import { floorCirculation } from "./circulation";
import { finalizeEdit } from "./edit";
import { allocateId, componentIds } from "./geometry";
import { LIMITS } from "./limits";
import {
  OPENING_END_MARGIN,
  OPENING_GAP,
  OPENING_SPECS,
  findRoomDoor,
  repairCirculation,
  freeCenter,
  materializeOpenings,
  openingLabel,
  placementProblems,
  roomHasPassage,
  snapCenter,
  snapToWall,
  wallAccepts,
} from "./openings";
import type {
  EditResult,
  Floor,
  GeometryFloor,
  OpeningKind,
  PlacedOpening,
  Project,
  Wall,
} from "./types";
import {
  OPENING_CLASS,
  deriveWallSegments,
  resolveFloorOpenings,
  segmentAt,
  touches,
  wallLine,
  wallStart,
} from "./walls";

/** A plan point (snapped to the nearest suitable wall) or an exact wall spot. */
export type OpeningAt =
  | { x: number; z: number }
  | { axis: "x" | "z"; line: number; center: number };
export type OpeningPatch = Partial<
  Pick<
    PlacedOpening,
    "kind" | "width" | "height" | "sill" | "style" | "hinge" | "swing"
  >
>;

const missingFloor: EditResult = { ok: false, error: "Floor not found." };
const missingOpening: EditResult = {
  ok: false,
  error: "That door or window no longer exists.",
};
function prepare(project: Project, floorId: string) {
  if (!project.floors.some((f) => f.id === floorId)) return undefined;
  const { project: p, idMap } = materializeOpenings(project, floorId);
  const floor = p.floors.find((f) => f.id === floorId)!;
  return { p, floor, openings: floor.openings ?? [], idMap };
}
const withOpenings = (
  p: Project,
  floor: Floor,
  openings: PlacedOpening[],
): Project => replaceFloor(p, { ...floor, openings });
const geometry = (p: Project, floorId: string) => {
  const geo = floorForGeometry(p, floorId);
  return { geo, segments: deriveWallSegments(geo) };
};

/** Turns the floor's automatic doors and windows into editable ones. */
export function customizeOpenings(project: Project, floorId: string): EditResult {
  const prep = prepare(project, floorId);
  if (!prep) return missingFloor;
  return finalizeEdit(project, prep.p);
}
/** Returns the floor to automatic doors and windows. */
export function resetOpenings(project: Project, floorId: string): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return missingFloor;
  if (!floor.openings) return { ok: true, project };
  const { openings: _openings, ...rest } = floor;
  void _openings;
  return finalizeEdit(project, replaceFloor(project, rest));
}

export function addOpening(
  project: Project,
  floorId: string,
  kind: OpeningKind,
  at: OpeningAt,
  patch: Omit<OpeningPatch, "kind"> = {},
): EditResult {
  const spec = OPENING_SPECS[kind];
  if (!spec) return { ok: false, error: "Choose a door, window or archway." };
  const prep = prepare(project, floorId);
  if (!prep) return missingFloor;
  if (prep.openings.length >= LIMITS.openingsPerFloor)
    return {
      ok: false,
      error: "This floor already has the maximum 256 doors and windows.",
    };
  const width = patch.width ?? spec.width.def;
  let spot: { axis: "x" | "z"; line: number; center: number };
  if ("x" in at) {
    const { geo, segments } = geometry(prep.p, floorId);
    const snapped = snapToWall(geo, segments, at, kind, width, {
      openings: prep.openings,
    });
    if (!snapped)
      return {
        ok: false,
        error: `Move closer to a wall with room for a ${spec.label.toLowerCase()}.`,
      };
    spot = snapped;
  } else spot = { axis: at.axis, line: at.line, center: snapCenter(at.center) };
  const id = allocateId("opening", componentIds(prep.p));
  const opening: PlacedOpening = {
    id,
    kind,
    axis: spot.axis,
    line: spot.line,
    center: spot.center,
    width,
    height: patch.height ?? spec.height.def,
    sill: patch.sill ?? spec.sill.def,
    ...(patch.style !== undefined ? { style: patch.style } : {}),
    ...(patch.hinge !== undefined ? { hinge: patch.hinge } : {}),
    ...(patch.swing !== undefined ? { swing: patch.swing } : {}),
  };
  return finalizeEdit(
    project,
    withOpenings(prep.p, prep.floor, [...prep.openings, opening]),
    { focusId: id, subject: id },
  );
}

export function moveOpening(
  project: Project,
  floorId: string,
  id: string,
  to: { axis: "x" | "z"; line: number; center: number },
): EditResult {
  const prep = prepare(project, floorId);
  if (!prep) return missingFloor;
  const real = prep.idMap.get(id) ?? id;
  if (!prep.openings.some((o) => o.id === real)) return missingOpening;
  return finalizeEdit(
    project,
    withOpenings(
      prep.p,
      prep.floor,
      prep.openings.map((o) =>
        o.id === real
          ? { ...o, axis: to.axis, line: to.line, center: snapCenter(to.center) }
          : o,
      ),
    ),
    { focusId: real, subject: real },
  );
}

/** Slides (and for a new kind, narrows) an opening to fit its wall if needed. */
function fitOnWall(
  o: PlacedOpening,
  segments: readonly Wall[],
  others: readonly PlacedOpening[],
  narrow: boolean,
): PlacedOpening {
  if (!placementProblems(o, segments, others).length) return o;
  const wall = segmentAt(segments as Wall[], o.axis, o.line, o.center);
  if (!wall || !wallAccepts(wall, o.kind)) return o;
  const spec = OPENING_SPECS[o.kind];
  for (
    let width = o.width;
    width >= spec.width.min && (narrow || width === o.width);
    width -= 10
  ) {
    const center = freeCenter(wall, o.center, width, others, o.id);
    if (center !== undefined) return { ...o, width, center };
  }
  return o;
}

export function updateOpening(
  project: Project,
  floorId: string,
  id: string,
  patch: OpeningPatch,
): EditResult {
  const prep = prepare(project, floorId);
  if (!prep) return missingFloor;
  const real = prep.idMap.get(id) ?? id;
  const current = prep.openings.find((o) => o.id === real);
  if (!current) return missingOpening;
  const kindChanged = patch.kind !== undefined && patch.kind !== current.kind;
  if (kindChanged && !OPENING_SPECS[patch.kind!])
    return { ok: false, error: "Choose a door, window or archway." };
  let next: PlacedOpening = { ...current };
  if (kindChanged) {
    const spec = OPENING_SPECS[patch.kind!];
    next = {
      ...next,
      kind: patch.kind!,
      width: spec.width.def,
      height: spec.height.def,
      sill: spec.sill.def,
    };
    if (OPENING_CLASS[patch.kind!] !== "door") {
      delete next.hinge;
      delete next.swing;
    }
  }
  for (const key of ["width", "height", "sill", "style", "hinge", "swing"] as const)
    if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] });
  if (kindChanged || patch.width !== undefined) {
    const { segments } = geometry(prep.p, floorId);
    next = fitOnWall(
      next,
      segments,
      prep.openings.filter((o) => o.id !== real),
      kindChanged && patch.width === undefined,
    );
  }
  return finalizeEdit(
    project,
    withOpenings(
      prep.p,
      prep.floor,
      prep.openings.map((o) => (o.id === real ? next : o)),
    ),
    { focusId: real, subject: real },
  );
}

export function removeOpening(
  project: Project,
  floorId: string,
  id: string,
): EditResult {
  const prep = prepare(project, floorId);
  if (!prep) return missingFloor;
  const real = prep.idMap.get(id) ?? id;
  if (!prep.openings.some((o) => o.id === real)) return missingOpening;
  return finalizeEdit(
    project,
    withOpenings(
      prep.p,
      prep.floor,
      prep.openings.filter((o) => o.id !== real),
    ),
  );
}

/**
 * Gives a room a door that works: adds one when it has none, moves a door
 * that opens onto a wall, and adds a way in when nobody can reach the room
 * (scored like the automatic doors). No-op when all is already well.
 */
export function ensureRoomDoor(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { ok: false, error: "Room not found." };
  const geo = floorForGeometry(project, floorId);
  const circulation = floorCirculation(project, floorId);
  const fine =
    roomHasPassage(room, resolveFloorOpenings(geo, project.plot.road)) &&
    !circulation.unreachable.includes(roomId) &&
    !circulation.blockedDoors.some((d) => d.roomIds.includes(roomId));
  if (fine) return { ok: true, project };
  const prep = prepare(project, floorId)!;
  const { geo: next, segments } = geometry(prep.p, floorId);
  const used = componentIds(prep.p);
  const repaired = repairCirculation(next, segments, prep.openings, used, []);
  const changed = JSON.stringify(repaired) !== JSON.stringify(prep.openings);
  if (changed && roomHasPassage(room, repaired))
    return finalizeEdit(project, withOpenings(prep.p, prep.floor, repaired));
  // Nothing better exists (e.g. no way in at all yet): keep a door that's there.
  if (!changed && roomHasPassage(room, prep.openings)) return { ok: true, project };
  const door = findRoomDoor(next, segments, room, prep.openings);
  if (!door)
    return {
      ok: false,
      error: `There's no free wall for a door in ${room.name}. Move it next to another room first.`,
    };
  const id = allocateId("opening", componentIds(prep.p));
  return finalizeEdit(
    project,
    withOpenings(prep.p, prep.floor, [...prep.openings, { id, ...door }]),
    { focusId: id, subject: id },
  );
}

/** Free stretches of a wall (between margins and other openings' gaps). */
function freeSpans(
  wall: Wall,
  openings: readonly PlacedOpening[],
): Array<[number, number]> {
  const start = wallStart(wall) + OPENING_END_MARGIN,
    end = wallStart(wall) + wall.length - OPENING_END_MARGIN;
  const taken = openings
    .filter((o) => o.axis === wall.axis && o.line === wallLine(wall))
    .map((o) => [
      o.center - o.width / 2 - OPENING_GAP,
      o.center + o.width / 2 + OPENING_GAP,
    ])
    .sort((a, b) => a[0] - b[0]);
  const spans: Array<[number, number]> = [];
  let cursor = start;
  for (const [a, b] of taken) {
    if (a > cursor) spans.push([cursor, Math.min(a, end)]);
    cursor = Math.max(cursor, b);
  }
  if (end > cursor) spans.push([cursor, end]);
  return spans.filter(([a, b]) => b > a);
}

/** Adds a window on the room's longest free outside wall stretch (≥ 1.2 m). */
export function addRoomWindow(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { ok: false, error: "Room not found." };
  const prep = prepare(project, floorId)!;
  const { segments } = geometry(prep.p, floorId);
  const spec = OPENING_SPECS.window;
  const spans = segments
    .filter((w) => wallAccepts(w, "window") && touches(w, room.bounds))
    .flatMap((w) =>
      freeSpans(w, prep.openings).map(([a, b]) => ({ w, a, b, length: b - a })),
    )
    .filter((s) => s.length >= 120)
    .sort((x, y) => y.length - x.length || x.w.id.localeCompare(y.w.id));
  for (const span of spans) {
    for (
      let width = Math.min(spec.width.def, Math.floor(span.length / 10) * 10);
      width >= spec.width.min;
      width -= 10
    ) {
      const center = freeCenter(span.w, (span.a + span.b) / 2, width, prep.openings);
      if (center === undefined) continue;
      const id = allocateId("opening", componentIds(prep.p));
      const opening: PlacedOpening = {
        id,
        kind: "window",
        axis: span.w.axis,
        line: wallLine(span.w),
        center,
        width,
        height: spec.height.def,
        sill: spec.sill.def,
      };
      return finalizeEdit(
        project,
        withOpenings(prep.p, prep.floor, [...prep.openings, opening]),
        { focusId: id, subject: id },
      );
    }
  }
  return {
    ok: false,
    error: `${room.name} has no outside wall with space for a window.`,
  };
}

const SIDE_NAMES = { north: "North", south: "South", west: "West", east: "East" };
/** A friendly name for a wall segment, e.g. "North wall of Bedroom 1". */
export function wallLabel(floor: GeometryFloor, wall: Wall): string {
  const rooms = floor.rooms.filter((room) => touches(wall, room.bounds));
  const line = wallLine(wall);
  if (rooms.length >= 2)
    return `Between ${rooms[0].name} and ${rooms[1].name}`;
  if (rooms.length === 1) {
    const b = rooms[0].bounds;
    const side =
      wall.axis === "x"
        ? line === b.z
          ? "north"
          : "south"
        : line === b.x
          ? "west"
          : "east";
    return `${SIDE_NAMES[side]} wall of ${rooms[0].name}`;
  }
  const fp = floor.footprint;
  if (wall.axis === "x" && (line === fp.z || line === fp.z + fp.d))
    return `${line === fp.z ? "North" : "South"} outside wall`;
  if (wall.axis === "z" && (line === fp.x || line === fp.x + fp.w))
    return `${line === fp.x ? "West" : "East"} outside wall`;
  return wall.exterior ? "Courtyard wall" : "Inside wall";
}

export type CompatibleWall = {
  wallId: string;
  label: string;
  axis: "x" | "z";
  line: number;
  /** A free centre for the opening at `width` (nearest the wall's middle). */
  center: number;
  width: number;
};
/**
 * Walls on a floor that can take `kind`, with a free spot on each — the
 * keyboard/list alternative to dragging an opening onto a wall.
 */
export function listCompatibleWalls(
  project: Project,
  floorId: string,
  kind: OpeningKind,
): CompatibleWall[] {
  const spec = OPENING_SPECS[kind];
  if (!spec || !project.floors.some((f) => f.id === floorId)) return [];
  const { geo, segments } = geometry(project, floorId);
  const openings = resolveFloorOpenings(geo, project.plot.road, segments);
  return segments.flatMap((w): CompatibleWall[] => {
    if (!wallAccepts(w, kind)) return [];
    for (const width of [spec.width.def, spec.width.min]) {
      const center = freeCenter(w, wallStart(w) + w.length / 2, width, openings);
      if (center !== undefined)
        return [
          {
            wallId: w.id,
            label: wallLabel(geo, w),
            axis: w.axis,
            line: wallLine(w),
            center,
            width,
          },
        ];
    }
    return [];
  });
}
export { openingLabel };
