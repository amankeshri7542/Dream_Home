// Doors, windows and archways: size specs, the rules an explicit `Floor.openings`
// list must satisfy, wall snapping, turning the automatic set into explicit
// openings, and keeping explicit openings on their walls through structural edits.
import { balconyBounds, floorForGeometry, replaceFloor } from "./core";
import { registerReconciler } from "./edit";
import {
  allocateId,
  componentIds,
  idCounts,
  inside,
  sameRect,
} from "./geometry";
import { makeIssue, type IssueSink } from "./issues";
import { LIMITS } from "./limits";
import type {
  Balcony,
  ComponentRef,
  EdgeSide,
  EditIssue,
  Floor,
  GeometryFloor,
  OpeningKind,
  PlacedOpening,
  Project,
  Rect,
  Room,
  Wall,
} from "./types";
import { registerValidation } from "./validate";
import { floorGrid, reachableNodes, sideOf } from "./circulationGrid";
import {
  autoOpenings,
  bridgeDoor,
  doorCenters,
  doorScore,
  deriveWallSegments,
  deriveWalls,
  doorWallFilter,
  ensuiteHost,
  isPassable,
  isWindow,
  resolveFloorOpenings,
  segmentAt,
  touches,
  wallLine,
  wallSamples,
  wallStart,
} from "./walls";

type Range = { min: number; max: number; def: number };
export type OpeningSpec = {
  label: string;
  /** Which walls accept it: interior (between spaces), exterior, or any. */
  where: "any" | "interior" | "exterior";
  width: Range;
  height: Range;
  sill: Range;
};
const r = (min: number, max: number, def: number): Range => ({ min, max, def });
export const OPENING_SPECS: Record<OpeningKind, OpeningSpec> = {
  door: { label: "Door", where: "any", width: r(70, 120, 90), height: r(200, 240, 215), sill: r(0, 0, 0) },
  "french-door": { label: "French door", where: "any", width: r(110, 200, 140), height: r(200, 240, 220), sill: r(0, 0, 0) },
  "sliding-door": { label: "Sliding door", where: "any", width: r(150, 360, 210), height: r(200, 240, 220), sill: r(0, 0, 0) },
  archway: { label: "Archway", where: "interior", width: r(80, 300, 120), height: r(200, 250, 230), sill: r(0, 0, 0) },
  window: { label: "Window", where: "exterior", width: r(60, 300, 150), height: r(60, 180, 135), sill: r(60, 150, 90) },
  "picture-window": { label: "Picture window", where: "exterior", width: r(120, 400, 240), height: r(150, 240, 210), sill: r(10, 60, 30) },
};
export const OPENING_KIND_LIST = Object.keys(OPENING_SPECS) as OpeningKind[];
/** Clear wall left at each end of a segment (corners and junctions). */
export const OPENING_END_MARGIN = 15;
/** Minimum solid wall between two openings on the same wall line. */
export const OPENING_GAP = 20;
/** Highest head height (sill + height) under a 3 m storey. */
export const OPENING_MAX_TOP = 285;
export const OPENING_GRID = {
  line: 10,
  center: 5,
  width: 10,
  height: 5,
  sill: 5,
} as const;
const STYLES = ["panel", "flush", "glazed", "plain", "divided"];
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
export const snapCenter = (n: number) =>
  Math.round(n / OPENING_GRID.center) * OPENING_GRID.center;
export const openingLabel = (kind: OpeningKind) =>
  OPENING_SPECS[kind]?.label ?? "Opening";
const inRange = (n: number, range: Range) =>
  Number.isFinite(n) && n >= range.min && n <= range.max;

/** Size/grid problems independent of the walls. */
export function openingShapeProblems(o: PlacedOpening): string[] {
  const spec = OPENING_SPECS[o.kind];
  if (!spec) return ["Choose a door, window or archway."];
  const out: string[] = [];
  if (!inRange(o.width, spec.width) || o.width % OPENING_GRID.width)
    out.push(
      `${spec.label}s are ${spec.width.min}–${spec.width.max} cm wide, in 10 cm steps.`,
    );
  if (!inRange(o.height, spec.height) || o.height % OPENING_GRID.height)
    out.push(
      `${spec.label}s are ${spec.height.min}–${spec.height.max} cm tall, in 5 cm steps.`,
    );
  if (!inRange(o.sill, spec.sill) || o.sill % OPENING_GRID.sill)
    out.push(
      spec.sill.max === 0
        ? `${spec.label}s start at floor level.`
        : `${spec.label} sills sit ${spec.sill.min}–${spec.sill.max} cm above the floor.`,
    );
  if (o.sill + o.height > OPENING_MAX_TOP)
    out.push("Doors and windows must stay below 2.85 m.");
  if (
    !Number.isFinite(o.line) ||
    !Number.isFinite(o.center) ||
    o.line % OPENING_GRID.line ||
    o.center % OPENING_GRID.center
  )
    out.push("Doors and windows snap to a 5 cm grid along their wall.");
  if (
    (o.style !== undefined && !STYLES.includes(o.style)) ||
    (o.hinge !== undefined && o.hinge !== "start" && o.hinge !== "end") ||
    (o.swing !== undefined && o.swing !== 1 && o.swing !== -1)
  )
    out.push("Choose a valid style for this opening.");
  return out;
}

/** Whether a wall segment can take this kind of opening at all. */
export function wallAccepts(wall: Wall, kind: OpeningKind) {
  const where = OPENING_SPECS[kind]?.where;
  return where === "exterior"
    ? wall.exterior
    : where === "interior"
      ? !wall.exterior
      : !!where;
}
/** Other openings this one overlaps or sits closer than OPENING_GAP to. */
export function openingClashes(
  o: Pick<PlacedOpening, "id" | "axis" | "line" | "center" | "width">,
  others: readonly PlacedOpening[],
): PlacedOpening[] {
  return others.filter(
    (p) =>
      p.id !== o.id &&
      p.axis === o.axis &&
      p.line === o.line &&
      Math.abs(p.center - o.center) < (p.width + o.width) / 2 + OPENING_GAP,
  );
}
export type PlacementProblem = {
  code:
    | "opening-off-wall"
    | "opening-margin"
    | "opening-placement"
    | "opening-overlap";
  message: string;
  blockers: string[];
};
/** Problems placing an opening on the floor's walls among other openings. */
export function placementProblems(
  o: PlacedOpening,
  segments: readonly Wall[],
  others: readonly PlacedOpening[],
): PlacementProblem[] {
  const wall = segmentAt(segments as Wall[], o.axis, o.line, o.center);
  if (!wall)
    return [
      {
        code: "opening-off-wall",
        message: "Doors and windows must sit on a wall.",
        blockers: [],
      },
    ];
  const out: PlacementProblem[] = [];
  const start = wallStart(wall),
    end = start + wall.length;
  if (
    o.center - o.width / 2 < start + OPENING_END_MARGIN ||
    o.center + o.width / 2 > end - OPENING_END_MARGIN
  )
    out.push({
      code: "opening-margin",
      message: "Keep doors and windows at least 15 cm from wall corners.",
      blockers: [],
    });
  if (!wallAccepts(wall, o.kind))
    out.push({
      code: "opening-placement",
      message:
        OPENING_SPECS[o.kind]?.where === "exterior"
          ? `${openingLabel(o.kind)}s go on outside walls.`
          : `${openingLabel(o.kind)}s join two indoor spaces.`,
      blockers: [],
    });
  const hits = openingClashes(o, others);
  if (hits.length)
    out.push({
      code: "opening-overlap",
      message: "Leave at least 20 cm of wall between doors and windows.",
      blockers: hits.map((h) => h.id),
    });
  return out;
}
/** A thin plot-cm rectangle around the opening, for highlighting. */
export function openingRect(
  o: Pick<PlacedOpening, "axis" | "line" | "center" | "width">,
): Rect {
  return o.axis === "x"
    ? { x: o.center - o.width / 2, z: o.line - 10, w: o.width, d: 20 }
    : { x: o.line - 10, z: o.center - o.width / 2, w: 20, d: o.width };
}

/** Validates one floor's explicit openings (automatic floors are skipped). */
export function validateFloorOpenings(
  project: Project,
  floorId: string,
  issue: IssueSink,
  ids: Map<string, number> = idCounts(project),
) {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.openings) return;
  const floorIds = [floor.id];
  if (floor.openings.length > LIMITS.openingsPerFloor)
    issue("limit", "A floor holds up to 256 doors and windows.", { floorIds });
  const segments = deriveWallSegments(floorForGeometry(project, floor.id));
  for (const [i, o] of floor.openings.entries()) {
    const source: ComponentRef = { kind: "opening", id: o.id, floorId: floor.id };
    const extra = { source, floorIds, attempted: openingRect(o) };
    if (typeof o.id !== "string" || !ID.test(o.id) || (ids.get(o.id) ?? 0) > 1)
      issue("duplicate-id", "Every component must have a unique, valid ID.", extra);
    const shape = openingShapeProblems(o);
    for (const message of shape) issue("opening-shape", message, extra);
    if (!OPENING_SPECS[o.kind]) continue;
    for (const p of placementProblems(o, segments, floor.openings.slice(i + 1)))
      issue(p.code, p.message, {
        ...extra,
        blockers: p.blockers.map((id) => ({
          kind: "opening",
          id,
          floorId: floor.id,
        })),
      });
  }
}
registerValidation((project, issue) => {
  if (!project.floors.some((f) => f.openings)) return;
  const ids = idCounts(project);
  for (const floor of project.floors)
    if (floor.openings) validateFloorOpenings(project, floor.id, issue, ids);
});

/**
 * The free centre nearest `desired` on a segment (5 cm grid, negative side
 * first on ties), keeping the end margins and gaps to other openings.
 */
export function freeCenter(
  wall: Wall,
  desired: number,
  width: number,
  others: readonly PlacedOpening[],
  id = "",
): number | undefined {
  const start = wallStart(wall),
    end = start + wall.length;
  const lo = Math.ceil((start + OPENING_END_MARGIN + width / 2) / 5) * 5,
    hi = Math.floor((end - OPENING_END_MARGIN - width / 2) / 5) * 5;
  if (lo > hi) return undefined;
  const axis = wall.axis,
    line = wallLine(wall);
  const free = (center: number) =>
    !openingClashes({ id, axis, line, center, width }, others).length;
  const first = Math.min(hi, Math.max(lo, snapCenter(desired)));
  for (let step = 0; first - step >= lo || first + step <= hi; step += 5) {
    if (first - step >= lo && free(first - step)) return first - step;
    if (step && first + step <= hi && free(first + step)) return first + step;
  }
  return undefined;
}

export type WallSnap = {
  wallId: string;
  axis: "x" | "z";
  line: number;
  center: number;
};
/**
 * Snaps a plan point to the nearest wall that accepts `kind` at `width`,
 * sliding along that wall to the nearest free spot. `lockLine` keeps the
 * opening on one wall line (dragging along a wall); `exclude` ignores the
 * opening being moved.
 */
export function snapToWall(
  floor: GeometryFloor,
  segments: readonly Wall[],
  point: { x: number; z: number },
  kind: OpeningKind,
  width: number,
  opts: {
    lockLine?: { axis: "x" | "z"; line: number };
    thresholdCm?: number;
    exclude?: readonly string[];
    road?: EdgeSide;
    openings?: readonly PlacedOpening[];
  } = {},
): WallSnap | null {
  const threshold = opts.thresholdCm ?? 60,
    exclude = new Set(opts.exclude ?? []);
  const others = (
    opts.openings ??
    resolveFloorOpenings(floor, opts.road ?? "south", segments as Wall[])
  ).filter((o) => !exclude.has(o.id));
  const candidates = segments
    .filter(
      (w) =>
        wallAccepts(w, kind) &&
        w.length >= width + 2 * OPENING_END_MARGIN &&
        (!opts.lockLine ||
          (w.axis === opts.lockLine.axis &&
            wallLine(w) === opts.lockLine.line)),
    )
    .map((w) => {
      const along = w.axis === "x" ? point.x : point.z,
        across = w.axis === "x" ? point.z : point.x,
        start = wallStart(w),
        nearest = Math.min(start + w.length, Math.max(start, along));
      return {
        w,
        along,
        distance: Math.hypot(across - wallLine(w), along - nearest),
      };
    })
    .filter((c) => opts.lockLine || c.distance <= threshold)
    .sort((a, b) => a.distance - b.distance || a.w.id.localeCompare(b.w.id));
  for (const { w, along } of candidates) {
    const center = freeCenter(w, along, width, others);
    if (center !== undefined)
      return { wallId: w.id, axis: w.axis, line: wallLine(w), center };
  }
  return null;
}

/**
 * Turns a floor's automatic openings into an explicit list (ids allocated in
 * wall-id order). `idMap` maps each `auto:` id to its new id. No-op when the
 * floor is already customised.
 */
export function materializeOpenings(
  project: Project,
  floorId: string,
): { project: Project; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor || floor.openings) return { project, idMap };
  const used = componentIds(project);
  const openings = autoOpenings(
    floorForGeometry(project, floorId),
    project.plot.road,
  ).map((o): PlacedOpening => {
    const id = allocateId("opening", used);
    idMap.set(o.id, id);
    return {
      id,
      kind: o.kind,
      axis: o.axis,
      line: o.line,
      center: o.center,
      width: o.width,
      height: o.height,
      sill: o.sill,
    };
  });
  return { project: replaceFloor(project, { ...floor, openings }), idMap };
}

/** An opening (automatic or explicit id) with the derived wall it sits on. */
export function openingAt(
  project: Project,
  floorId: string,
  id: string,
): { opening: PlacedOpening & { auto: boolean }; wall: Wall } | undefined {
  if (!project.floors.some((f) => f.id === floorId)) return undefined;
  const geo = floorForGeometry(project, floorId);
  const walls = deriveWalls(geo, project.plot.road);
  const opening = resolveFloorOpenings(geo, project.plot.road).find(
    (o) => o.id === id,
  );
  if (!opening) return undefined;
  const wall = segmentAt(walls, opening.axis, opening.line, opening.center);
  return wall ? { opening, wall } : undefined;
}

// ---------------------------------------------------------------------------
// Door finding (shared by ensureRoomDoor and the reconciler)
// ---------------------------------------------------------------------------
function wallHelpers(floor: GeometryFloor) {
  const unitsAt = (w: Wall) =>
    wallSamples(w).map(
      (p) =>
        floor.unitAreas.find((a) => inside(a.bounds, p.x, p.z))?.unitId ?? null,
    );
  const privateBoundary = (w: Wall) => {
    const [a, b] = unitsAt(w);
    return a !== null && b !== null && a !== b;
  };
  const blocked = (w: Wall) =>
    wallSamples(w).some((p) =>
      floor.voids.some((v) => inside(v.bounds, p.x, p.z)),
    );
  const roomOwners = (w: Wall) =>
    floor.rooms.filter((room) =>
      wallSamples(w).some((p) => inside(room.bounds, p.x, p.z)),
    ).length;
  const rank = (a: Wall, b: Wall) =>
    roomOwners(a) - roomOwners(b) ||
    b.length - a.length ||
    a.id.localeCompare(b.id);
  return { privateBoundary, blocked, rank };
}
/** The side of `rect` an opening sits on (centre strictly inside the edge). */
export function openingSide(
  o: Pick<PlacedOpening, "axis" | "line" | "center">,
  rect: Rect,
): EdgeSide | null {
  if (o.axis === "x" && o.center > rect.x && o.center < rect.x + rect.w) {
    if (o.line === rect.z) return "north";
    if (o.line === rect.z + rect.d) return "south";
  }
  if (o.axis === "z" && o.center > rect.z && o.center < rect.z + rect.d) {
    if (o.line === rect.x) return "west";
    if (o.line === rect.x + rect.w) return "east";
  }
  return null;
}
/** Whether a room has a door or archway on its perimeter. */
export const roomHasPassage = (
  room: Pick<Room, "bounds">,
  openings: readonly PlacedOpening[],
) =>
  openings.some((o) => isPassable(o.kind) && openingSide(o, room.bounds));
/**
 * A 90 cm door for a room, scored like the automatic doors: it must open onto
 * real floor (a hall or another room, a hall first), clear of other openings;
 * `accept` can insist it leads somewhere already reachable. Falls back to the
 * old wall ranking, then to an exterior wall on the ground floor.
 */
export function findRoomDoor(
  floor: GeometryFloor,
  segments: readonly Wall[],
  room: Room,
  openings: readonly PlacedOpening[],
  accept?: (node: string) => boolean,
): Omit<PlacedOpening, "id"> | undefined {
  const { privateBoundary, blocked, rank } = wallHelpers(floor);
  const spec = OPENING_SPECS.door;
  const door = (w: Wall, center: number) => ({
    kind: "door" as const,
    axis: w.axis,
    line: wallLine(w),
    center,
    width: spec.width.def,
    height: spec.height.def,
    sill: 0,
  });
  const pick = (options: Wall[]) => {
    for (const w of options.sort(rank)) {
      const center = freeCenter(w, wallStart(w) + w.length / 2, spec.width.def, openings);
      if (center !== undefined) return door(w, center);
    }
    return undefined;
  };
  const doorWall = doorWallFilter(floor);
  const near = segments.filter(
    (w) => touches(w, room.bounds) && !blocked(w) && doorWall(room, w),
  );
  const interior = near.filter((w) => !w.exterior && !privateBoundary(w) && w.length >= 120);
  // Best doorway with real floor beyond it.
  const grid = floorGrid(floor);
  const index = floor.rooms.findIndex((r) => r.id === room.id);
  let best: { w: Wall; center: number; score: number } | null = null;
  if (index >= 0)
    for (const w of interior)
      for (const desired of doorCenters(w, spec.width.def)) {
        const center = freeCenter(w, desired, spec.width.def, openings);
        if (center === undefined) continue;
        const score = doorScore(grid, floor.rooms, index, w, center, accept);
        if (score === null) continue;
        if (!best || score < best.score || (score === best.score && rank(w, best.w) < 0))
          best = { w, center, score };
        break;
      }
  if (best) return door(best.w, best.center);
  if (accept) return undefined;
  return (
    pick(interior) ??
    // An attached bathroom never gets its own front door.
    (floor.elevation === 0 && !ensuiteHost(floor.rooms, room)
      ? pick(near.filter((w) => w.exterior && w.length >= 120))
      : undefined)
  );
}

/**
 * After a structural edit, doors must still lead somewhere: a door now facing
 * a wall or a gap moves to its room's best wall, and a room nobody can reach
 * gets a door toward the rest of the house.
 */
export function repairCirculation(
  floor: GeometryFloor,
  segments: readonly Wall[],
  openings: PlacedOpening[],
  used: Set<string>,
  notices: EditIssue[],
): PlacedOpening[] {
  const grid = floorGrid(floor);
  let next = [...openings];
  const roomAt = (o: PlacedOpening) =>
    floor.rooms.filter((r) => openingSide(o, r.bounds) !== null);
  for (const o of openings) {
    if (!isPassable(o.kind)) continue;
    const wall = segmentAt(segments as Wall[], o.axis, o.line, o.center);
    if (!wall || wall.exterior) continue;
    if (sideOf(grid, o, 1).kind !== "blocked" && sideOf(grid, o, -1).kind !== "blocked") continue;
    const rooms = roomAt(o);
    const without = next.filter((x) => x !== o);
    const moved: PlacedOpening[] = [];
    for (const room of rooms) {
      if (roomHasPassage(room, [...without, ...moved])) continue;
      const door = findRoomDoor(floor, segments, room, [...without, ...moved]);
      if (door) moved.push({ id: o.id, ...door, ...(o.style ? { style: o.style } : {}) });
    }
    if (!moved.length && rooms.some((room) => !roomHasPassage(room, without))) continue;
    next = [...without, ...moved];
    if (rooms[0])
      notices.push(
        makeIssue("door-moved", `Moved the door of ${rooms[0].name} so it opens onto open floor, not a wall.`, {
          severity: "notice",
          source: { kind: "room", id: rooms[0].id, floorId: floor.id },
          floorIds: [floor.id],
        }),
      );
  }
  for (let pass = 0; pass < floor.rooms.length; pass++) {
    const reached = reachableNodes(floor, grid, next);
    if (!reached) break;
    const k = floor.rooms.findIndex((_, i) => !reached.has(`r${i}`));
    if (k < 0) break;
    const stranded = floor.rooms[k];
    let door = findRoomDoor(floor, segments, stranded, next, (node) => reached.has(node));
    if (!door) {
      const { privateBoundary, blocked } = wallHelpers(floor);
      const bridge = bridgeDoor(floor, grid, segments, next, reached, k, (w) => !privateBoundary(w) && !blocked(w));
      if (bridge) {
        const center = freeCenter(bridge.wall, bridge.center, OPENING_SPECS.door.width.def, next);
        if (center !== undefined)
          door = {
            kind: "door",
            axis: bridge.wall.axis,
            line: wallLine(bridge.wall),
            center,
            width: OPENING_SPECS.door.width.def,
            height: OPENING_SPECS.door.height.def,
            sill: 0,
          };
      }
    }
    if (!door) break;
    next = [...next, { id: allocateId("opening", used), ...door }];
  }
  return next;
}

// ---------------------------------------------------------------------------
// Structural reconcile
// ---------------------------------------------------------------------------
function clampAlong(center: number, start: number, end: number, width: number) {
  const lo = start + OPENING_END_MARGIN + width / 2,
    hi = end - OPENING_END_MARGIN - width / 2;
  if (lo > hi) return snapCenter((start + end) / 2);
  return snapCenter(Math.min(hi, Math.max(lo, center)));
}
function carryWith(
  o: PlacedOpening,
  side: EdgeSide,
  from: Rect,
  to: Rect,
): PlacedOpening {
  if (side === "north" || side === "south")
    return {
      ...o,
      line: side === "north" ? to.z : to.z + to.d,
      center: clampAlong(o.center + (to.x - from.x), to.x, to.x + to.w, o.width),
    };
  return {
    ...o,
    line: side === "west" ? to.x : to.x + to.w,
    center: clampAlong(o.center + (to.z - from.z), to.z, to.z + to.d, o.width),
  };
}
function balconyEdge(floor: Pick<Floor, "footprint">, b: Balcony) {
  const fp = floor.footprint,
    rect = balconyBounds(floor, b),
    horizontal = b.edge === "north" || b.edge === "south";
  return {
    axis: (horizontal ? "x" : "z") as "x" | "z",
    line:
      b.edge === "north"
        ? fp.z
        : b.edge === "south"
          ? fp.z + fp.d
          : b.edge === "west"
            ? fp.x
            : fp.x + fp.w,
    start: horizontal ? rect.x : rect.z,
    span: horizontal ? rect.w : rect.d,
  };
}
const structureKey = (g: GeometryFloor) =>
  JSON.stringify([
    g.footprint,
    g.elevation,
    g.rooms.map((room) => [room.id, room.bounds]),
    g.unitAreas,
    g.balconies,
    g.voids,
  ]);

function reconcileFloor(
  before: GeometryFloor,
  after: GeometryFloor,
  openings: readonly PlacedOpening[],
  used: Set<string>,
  notices: EditIssue[],
): PlacedOpening[] {
  const segsBefore = deriveWallSegments(before),
    segsAfter = deriveWallSegments(after);
  const roomsAfter = new Map(after.rooms.map((room) => [room.id, room]));
  const roomsBefore = new Set(before.rooms.map((room) => room.id));
  const moved = before.rooms.filter(
    (room) =>
      roomsAfter.has(room.id) &&
      !sameRect(room.bounds, roomsAfter.get(room.id)!.bounds),
  );
  const removed = before.rooms.filter((room) => !roomsAfter.has(room.id));
  const voidsAfter = new Map(after.voids.map((v) => [v.id, v]));
  const movedVoids = before.voids.filter(
    (v) => voidsAfter.has(v.id) && !sameRect(v.bounds, voidsAfter.get(v.id)!.bounds),
  );
  const balconies = before.balconies.flatMap((b) => {
    const next = after.balconies.find((a) => a.id === b.id);
    return next && JSON.stringify(next) !== JSON.stringify(b) ? [[b, next]] : [];
  });
  const footprintMoved = !sameRect(before.footprint, after.footprint);

  const entries = openings.map((o) => {
    const wallBefore = segmentAt(segsBefore, o.axis, o.line, o.center);
    if (isPassable(o.kind) && !wallBefore?.exterior)
      for (const room of moved) {
        const side = openingSide(o, room.bounds);
        if (side)
          return {
            o: carryWith(o, side, room.bounds, roomsAfter.get(room.id)!.bounds),
            carried: true,
            orphan: false,
          };
      }
    for (const v of movedVoids) {
      const side = openingSide(o, v.bounds);
      if (side)
        return {
          o: carryWith(o, side, v.bounds, voidsAfter.get(v.id)!.bounds),
          carried: true,
          orphan: false,
        };
    }
    if (isPassable(o.kind))
      for (const [b, next] of balconies) {
        const edge = balconyEdge(before, b);
        if (
          o.axis !== edge.axis ||
          o.line !== edge.line ||
          o.center - o.width / 2 < edge.start ||
          o.center + o.width / 2 > edge.start + edge.span
        )
          continue;
        const to = balconyEdge(after, next);
        const center =
          next.edge === b.edge
            ? o.center - edge.start + to.start
            : to.start + to.span / 2;
        return {
          o: {
            ...o,
            axis: to.axis,
            line: to.line,
            center: clampAlong(center, to.start, to.start + to.span, o.width),
          },
          carried: true,
          orphan: false,
        };
      }
    if (footprintMoved && wallBefore?.exterior) {
      const side = openingSide(o, before.footprint);
      if (side)
        return {
          o: carryWith(o, side, before.footprint, after.footprint),
          carried: true,
          orphan: false,
        };
    }
    return {
      o,
      carried: false,
      orphan: removed.some((room) => openingSide(o, room.bounds) !== null),
    };
  });

  const placed: Array<PlacedOpening | null> = entries.map(() => null);
  const current = () => placed.filter((o): o is PlacedOpening => !!o);
  const valid = (o: PlacedOpening) =>
    !placementProblems(o, segsAfter, current()).length;
  entries.forEach((e, i) => {
    if (!e.carried && valid(e.o)) placed[i] = e.o;
  });
  entries.forEach((e, i) => {
    if (placed[i]) return;
    if (valid(e.o)) {
      placed[i] = e.o;
      return;
    }
    if (!e.orphan) {
      const slide = (o: PlacedOpening) => {
        for (let step = 5; step <= 100; step += 5)
          for (const center of [o.center - step, o.center + step]) {
            const next = { ...o, center };
            if (valid(next)) return next;
          }
        return undefined;
      };
      let fitted = valid(e.o) ? e.o : slide(e.o);
      if (!fitted && isWindow(e.o.kind))
        for (
          let width = e.o.width - 10;
          !fitted && width >= OPENING_SPECS[e.o.kind].width.min;
          width -= 10
        ) {
          const narrower = { ...e.o, width };
          fitted = valid(narrower) ? narrower : slide(narrower);
        }
      if (fitted) {
        placed[i] = fitted;
        return;
      }
    }
    notices.push(
      makeIssue(
        "opening-removed",
        `A ${openingLabel(e.o.kind).toLowerCase()} on ${after.name} no longer had room on its wall, so it was removed.`,
        {
          severity: "notice",
          source: { kind: "opening", id: e.o.id, floorId: after.id },
          floorIds: [after.id],
        },
      ),
    );
  });
  const next = current();
  for (const room of after.rooms) {
    if (roomsBefore.has(room.id) || roomHasPassage(room, next)) continue;
    const door = findRoomDoor(after, segsAfter, room, next);
    if (door) next.push({ id: allocateId("opening", used), ...door });
  }
  return repairCirculation(after, segsAfter, next, used, notices);
}

/**
 * Keeps explicit openings attached through structural edits: openings move
 * with their room, stair/courtyard, balcony or building edge, then slide up to
 * 1 m along their wall, windows shrink, and anything left is removed with an
 * `opening-removed` notice. New rooms on customised floors get a door.
 */
export function reconcileOpenings(
  before: Project,
  after: Project,
  notices: EditIssue[],
): Project {
  if (before === after) return after;
  let used: Set<string> | undefined;
  let changed = false;
  const floors = after.floors.map((floor) => {
    if (!floor.openings || !before.floors.some((f) => f.id === floor.id))
      return floor;
    const prev = floorForGeometry(before, floor.id),
      next = floorForGeometry(after, floor.id);
    if (structureKey(prev) === structureKey(next)) return floor;
    used ??= componentIds(after);
    const openings = reconcileFloor(prev, next, floor.openings, used, notices);
    if (
      openings.length === floor.openings.length &&
      openings.every((o, i) => o === floor.openings![i])
    )
      return floor;
    changed = true;
    return { ...floor, openings };
  });
  return changed ? { ...after, floors } : after;
}
registerReconciler(reconcileOpenings);
