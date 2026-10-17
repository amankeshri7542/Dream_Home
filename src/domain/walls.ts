// Wall topology and opening resolution. Walls are derived from room, unit,
// footprint and courtyard edges; openings are either automatic (derived) or the
// floor's explicit `openings` list once the user customises doors and windows.
import { balconyBounds } from "./core";
import {
  connectedNodes,
  floorGrid,
  reachableNodes,
  sideNode,
  sideOf,
  type FloorGrid,
  type GridOpening,
} from "./circulationGrid";
import { inside } from "./geometry";
import type {
  Balcony,
  EdgeSide,
  GeometryFloor,
  OpeningKind,
  PlacedOpening,
  Rect,
  Room,
  Wall,
  WallOpening,
} from "./types";

/** Built wall thickness (cm): the 3D walls, and what sits against their faces. */
export const WALL_THICKNESS = { exterior: 20, interior: 12 } as const;
export const wallThicknessCm = (w: Pick<Wall, "exterior">) =>
  w.exterior ? WALL_THICKNESS.exterior : WALL_THICKNESS.interior;

export type Edge = {
  axis: "x" | "z";
  fixed: number;
  start: number;
  end: number;
  exterior: boolean;
};
export function edges(r: Rect, exterior: boolean): Edge[] {
  return [
    { axis: "x", fixed: r.z, start: r.x, end: r.x + r.w, exterior },
    { axis: "x", fixed: r.z + r.d, start: r.x, end: r.x + r.w, exterior },
    { axis: "z", fixed: r.x, start: r.z, end: r.z + r.d, exterior },
    { axis: "z", fixed: r.x + r.w, start: r.z, end: r.z + r.d, exterior },
  ];
}
export const wallStart = (w: Pick<Wall, "axis" | "x" | "z">) =>
  w.axis === "x" ? w.x : w.z;
export const wallLine = (w: Pick<Wall, "axis" | "x" | "z">) =>
  w.axis === "x" ? w.z : w.x;
export function touches(w: Wall, r: Rect) {
  return edges(r, false).some(
    (e) =>
      e.axis === w.axis &&
      e.fixed === wallLine(w) &&
      e.start <= wallStart(w) &&
      e.end >= wallStart(w) + w.length,
  );
}
export const OPENING_CLASS: Record<OpeningKind, "door" | "window" | "passage"> =
  {
    door: "door",
    "french-door": "door",
    "sliding-door": "door",
    archway: "passage",
    window: "window",
    "picture-window": "window",
  };
export const isWindow = (kind: OpeningKind) => OPENING_CLASS[kind] === "window";
export const isPassable = (kind: OpeningKind) => OPENING_CLASS[kind] !== "window";

const segmentCache = new WeakMap<GeometryFloor, Wall[]>();
/** Wall segments only (no openings), split at every edge endpoint. */
export function deriveWallSegments(floor: GeometryFloor): Wall[] {
  const cached = segmentCache.get(floor);
  if (cached) return cached.map((w) => ({ ...w, openings: [] }));
  const all = [
    ...edges(floor.footprint, true),
    ...floor.rooms.flatMap((r) => edges(r.bounds, false)),
    ...floor.unitAreas.flatMap((a) => edges(a.bounds, false)),
    ...floor.voids
      .filter((v) => v.kind === "courtyard")
      .flatMap((v) => edges(v.bounds, true)),
  ];
  const groups = new Map<string, Edge[]>();
  for (const e of all) {
    const key = `${e.axis}:${e.fixed}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const walls: Wall[] = [];
  for (const group of groups.values()) {
    const { axis, fixed } = group[0];
    const extra = [
      ...floor.voids.map((v) => v.bounds),
      ...floor.balconies.map((b) => balconyBounds(floor, b)),
    ]
      .flatMap((r) => edges(r, false))
      .filter((e) => e.axis === axis && e.fixed === fixed)
      .flatMap((e) => [e.start, e.end]);
    const cuts = [
      ...new Set([...group.flatMap((e) => [e.start, e.end]), ...extra]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1],
        cover = group.filter((e) => e.start <= start && e.end >= end);
      if (!cover.length) continue;
      walls.push({
        id: `${floor.id}-${axis}-${fixed}-${start}-${end}`,
        axis,
        x: axis === "x" ? start : fixed,
        z: axis === "z" ? start : fixed,
        length: end - start,
        exterior: cover.some((e) => e.exterior),
        openings: [],
      });
    }
  }
  walls.sort((a, b) => a.id.localeCompare(b.id));
  segmentCache.set(floor, walls);
  return walls.map((w) => ({ ...w, openings: [] }));
}

/** ±1 cm samples either side of a wall's midpoint. */
export function wallSamples(w: Wall) {
  const x = w.x + (w.axis === "x" ? w.length / 2 : 0),
    z = w.z + (w.axis === "z" ? w.length / 2 : 0);
  return [
    { x: x + (w.axis === "z" ? 1 : 0), z: z + (w.axis === "x" ? 1 : 0) },
    { x: x - (w.axis === "z" ? 1 : 0), z: z - (w.axis === "x" ? 1 : 0) },
  ];
}
/** Rooms on the positive (+x/+z) and negative sides of a wall. */
export function wallSideRooms(
  floor: GeometryFloor,
  w: Wall,
): [string | null, string | null] {
  const [plus, minus] = wallSamples(w);
  const at = (p: { x: number; z: number }) =>
    floor.rooms.find((r) => inside(r.bounds, p.x, p.z))?.id ?? null;
  return [at(plus), at(minus)];
}

/** Length of the edge two rectangles share (0 when they don't touch). */
export function sharedEdge(a: Rect, b: Rect): number {
  if (a.x + a.w === b.x || b.x + b.w === a.x)
    return Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z));
  if (a.z + a.d === b.z || b.z + b.d === a.z)
    return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return 0;
}
/** The minimum shared wall for an en-suite door. */
export const ENSUITE_MIN_EDGE = 120;
/**
 * The bedroom an attached bathroom opens into, when the link is sound: a
 * bathroom pointing at a bedroom on the same floor that shares a wall long
 * enough for a door. Anything else is simply an ordinary room.
 */
export function ensuiteHost(rooms: readonly Room[], room: Room): Room | null {
  if (room.kind !== "bathroom" || !room.attachedTo) return null;
  const host = rooms.find((r) => r.id === room.attachedTo);
  return host && host.kind === "bedroom" && sharedEdge(room.bounds, host.bounds) >= ENSUITE_MIN_EDGE
    ? host
    : null;
}
/**
 * Door walls respecting attached bathrooms: an en-suite's door only goes on
 * the wall it shares with its bedroom, and no other room opens into it.
 * `room` is null for unit-area doors.
 */
export function doorWallFilter(floor: GeometryFloor) {
  const ensuites = new Map<string, string>();
  for (const r of floor.rooms) {
    const host = ensuiteHost(floor.rooms, r);
    if (host) ensuites.set(r.id, host.id);
  }
  if (!ensuites.size) return () => true;
  return (room: Room | null, w: Wall) => {
    const sides = wallSideRooms(floor, w);
    const host = room ? ensuites.get(room.id) : undefined;
    if (room && host) return sides.includes(room.id) && sides.includes(host);
    return !sides.some((id) => id !== null && ensuites.has(id));
  };
}

/**
 * The automatic doors and windows: one 90 cm door per room on its best interior
 * wall, one 100 cm door per unit area, a window on every exterior wall of at
 * least 1.8 m, the road entrance and balcony doors. At most one per segment.
 */
export function autoOpenings(
  floor: GeometryFloor,
  road: EdgeSide,
  segments: Wall[] = deriveWallSegments(floor),
): (PlacedOpening & { wallId: string })[] {
  const chosen = new Map<
    string,
    { kind: OpeningKind; width: number; sill: number; height: number; center?: number }
  >();
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
    floor.rooms.filter((r) =>
      wallSamples(w).some((p) => inside(r.bounds, p.x, p.z)),
    ).length;
  const rank = (a: Wall, b: Wall) =>
    roomOwners(a) - roomOwners(b) ||
    b.length - a.length ||
    a.id.localeCompare(b.id);
  const doorWall = doorWallFilter(floor);
  const grid = floorGrid(floor);
  const roomDoor = { kind: "door" as const, width: 90, sill: 0, height: 215 };
  const candidates = (room: Room) =>
    segments.filter(
      (w) =>
        !w.exterior &&
        !privateBoundary(w) &&
        !blocked(w) &&
        w.length >= 120 &&
        touches(w, room.bounds) &&
        doorWall(room, w),
    );
  for (const room of floor.rooms) {
    const options = candidates(room);
    // A door with real floor beyond it (a hall or another room), never one
    // onto a wall or a gap; the old ranking only when nothing else exists.
    const best = bestDoor(grid, floor.rooms, floor.rooms.indexOf(room), options, rank);
    if (best) chosen.set(best.wall.id, { ...roomDoor, center: best.center });
    else {
      options.sort(rank);
      if (options[0]) chosen.set(options[0].id, roomDoor);
    }
  }
  for (const area of floor.unitAreas) {
    const options = segments.filter(
      (w) =>
        !w.exterior &&
        !privateBoundary(w) &&
        !blocked(w) &&
        w.length >= 140 &&
        touches(w, area.bounds) &&
        doorWall(null, w),
    );
    options.sort(rank);
    // A home's front door needs floor on both sides, not a leftover strip.
    const clear = options.filter((w) => {
      const o = { axis: w.axis, line: wallLine(w), center: wallStart(w) + w.length / 2, width: 100 };
      return sideOf(grid, o, 1).kind !== "blocked" && sideOf(grid, o, -1).kind !== "blocked";
    });
    if (clear[0]) options.unshift(clear[0]);
    if (options[0])
      chosen.set(options[0].id, {
        kind: "door",
        width: 100,
        sill: 0,
        height: 220,
      });
  }
  for (const w of segments)
    if (w.exterior && w.length >= 180)
      chosen.set(w.id, {
        kind: "window",
        width: Math.min(180, w.length - 60),
        sill: 90,
        height: 135,
      });
  const atSide = (w: Wall, side: EdgeSide) =>
    side === "north"
      ? w.axis === "x" && w.z === floor.footprint.z
      : side === "south"
        ? w.axis === "x" && w.z === floor.footprint.z + floor.footprint.d
        : side === "west"
          ? w.axis === "z" && w.x === floor.footprint.x
          : w.axis === "z" && w.x === floor.footprint.x + floor.footprint.w;
  const entrance = (side: EdgeSide, balcony?: Balcony) => {
    const options = segments.filter(
      (w) =>
        atSide(w, side) &&
        w.length >= 150 &&
        !blocked(w) &&
        (!balcony ||
          (() => {
            const r = balconyBounds(floor, balcony),
              center = wallStart(w) + w.length / 2,
              start = w.axis === "x" ? r.x : r.z,
              span = w.axis === "x" ? r.w : r.d;
            return center - 55 >= start && center + 55 <= start + span;
          })()),
    );
    options.sort(rank);
    if (options[0])
      chosen.set(options[0].id, {
        kind: "door",
        width: 110,
        sill: 0,
        height: 230,
      });
  };
  if (floor.elevation === 0) entrance(road);
  for (const balcony of floor.balconies) entrance(balcony.edge, balcony);
  const placed = () =>
    segments
      .filter((w) => chosen.has(w.id))
      .map((w) => ({
        id: `auto:${w.id}`,
        wallId: w.id,
        axis: w.axis,
        line: wallLine(w),
        center: wallStart(w) + w.length / 2,
        ...chosen.get(w.id)!,
      }));
  // Every room must be reachable: a room whose door leads only to a dead end
  // gets a second door toward somewhere people can already walk to.
  for (let pass = 0; pass < floor.rooms.length; pass++) {
    const reached = reachableNodes(floor, grid, placed());
    if (!reached) break;
    const stranded = floor.rooms.findIndex((_, k) => !reached.has(`r${k}`));
    if (stranded < 0) break;
    let added = false;
    for (let k = stranded; k < floor.rooms.length && !added; k++) {
      if (reached.has(`r${k}`)) continue;
      const room = floor.rooms[k];
      const options = candidates(room).filter((w) => !chosen.has(w.id));
      const best =
        bestDoor(grid, floor.rooms, k, options, rank, (node) => reached.has(node)) ??
        bridgeDoor(floor, grid, segments, placed(), reached, k, (w) => !privateBoundary(w) && !blocked(w));
      if (best && !chosen.has(best.wall.id)) {
        chosen.set(best.wall.id, { ...roomDoor, center: best.center });
        added = true;
      }
    }
    if (!added) break;
  }
  return placed();
}

/** Room kinds that make a good way through (a door into a bedroom is a last resort). */
const THROUGH_RANK: Record<Room["kind"], number> = {
  living: 1,
  dining: 1,
  kitchen: 2,
  utility: 2,
  shop: 2,
  bathroom: 3,
  bedroom: 3,
};
/**
 * A doorway joining a stranded part of the floor (a room and the closed-off
 * hall it opens into) to somewhere already reachable: any interior wall with
 * the stranded part on one side and reachable floor on the other. A hall on
 * the stranded side is preferred, then a hall or living room beyond.
 */
export function bridgeDoor(
  floor: GeometryFloor,
  grid: FloorGrid,
  segments: readonly Wall[],
  openings: readonly GridOpening[],
  reached: Set<string>,
  strandedRoom: number,
  allowed: (w: Wall) => boolean = () => true,
): { wall: Wall; center: number } | null {
  const part = connectedNodes(grid, openings, `r${strandedRoom}`);
  const taken = new Set(
    openings.flatMap((o) => {
      const w = segmentAt([...segments], o.axis, o.line, o.center);
      return w ? [w.id] : [];
    }),
  );
  const rankNode = (n: string) =>
    n.startsWith("o") ? 0 : THROUGH_RANK[floor.rooms[Number(n.slice(1))]?.kind ?? "bedroom"];
  let best: { wall: Wall; center: number; score: number } | null = null;
  for (const w of segments) {
    if (w.exterior || w.length < 120 || taken.has(w.id) || !allowed(w)) continue;
    for (const center of doorCenters(w)) {
      const o = { axis: w.axis, line: wallLine(w), center, width: 90 };
      const a = sideNode(sideOf(grid, o, 1)),
        b = sideNode(sideOf(grid, o, -1));
      if (!a || !b || a === "out" || b === "out") continue;
      const [inner, outer] = part.has(a) && reached.has(b) ? [a, b] : part.has(b) && reached.has(a) ? [b, a] : [null, null];
      if (!inner || !outer) continue;
      // Never through an attached bathroom.
      const viaEnsuite = [inner, outer].some((n) => n.startsWith("r") && floor.rooms[Number(n.slice(1))]?.attachedTo);
      if (viaEnsuite) continue;
      const score = rankNode(inner) * 10 + rankNode(outer);
      if (!best || score < best.score || (score === best.score && w.length > best.wall.length))
        best = { wall: w, center, score };
      break;
    }
  }
  return best ? { wall: best.wall, center: best.center } : null;
}

/** Candidate door centres on a wall: the middle first, then near each end. */
export function doorCenters(w: Wall, width = 90): number[] {
  const start = wallStart(w);
  return [...new Set([start + w.length / 2, start + 60, start + w.length - 60])].filter(
    (c) => c - width / 2 >= start + 15 && c + width / 2 <= start + w.length - 15,
  );
}
/**
 * How good a doorway for `room` is at `center` on wall `w` (lower is better),
 * or null when it would open onto a wall, a gap or anything `accept` refuses:
 * a hall scores 0, a living room 1, a kitchen 2, a bedroom or bathroom 3.
 */
export function doorScore(
  grid: FloorGrid,
  rooms: readonly Room[],
  roomIndex: number,
  w: Wall,
  center: number,
  accept: (node: string) => boolean = () => true,
): number | null {
  const room = rooms[roomIndex];
  const line = wallLine(w);
  // The room is on the + side when its near edge is the wall line.
  const own: 1 | -1 = (w.axis === "x" ? room.bounds.z : room.bounds.x) === line ? 1 : -1;
  const o = { axis: w.axis, line, center, width: 90 };
  const mine = sideOf(grid, o, own),
    far = sideOf(grid, o, own === 1 ? -1 : 1);
  if (mine.kind !== "room" || mine.room !== roomIndex) return null;
  if (far.kind !== "room" && far.kind !== "open") return null;
  const node = sideNode(far);
  if (!node || !accept(node)) return null;
  return far.kind === "open" ? 0 : THROUGH_RANK[rooms[far.room].kind];
}
/**
 * The best doorway for a room among candidate walls: the far side must be a
 * room or walkable open floor, a hall beats a room, a living room beats a
 * bedroom, then the usual wall ranking. `accept` limits where it may lead.
 */
function bestDoor(
  grid: FloorGrid,
  rooms: readonly Room[],
  roomIndex: number,
  options: Wall[],
  rank: (a: Wall, b: Wall) => number,
  accept?: (node: string) => boolean,
): { wall: Wall; center: number } | null {
  let best: { wall: Wall; center: number; score: number } | null = null;
  for (const w of options)
    for (const center of doorCenters(w)) {
      const score = doorScore(grid, rooms, roomIndex, w, center, accept);
      if (score === null) continue;
      if (!best || score < best.score || (score === best.score && rank(w, best.wall) < 0))
        best = { wall: w, center, score };
      break;
    }
  return best ? { wall: best.wall, center: best.center } : null;
}

/** The floor's effective openings: explicit when customised, else automatic. */
export function resolveFloorOpenings(
  floor: GeometryFloor,
  road: EdgeSide,
  segments: Wall[] = deriveWallSegments(floor),
): (PlacedOpening & { auto: boolean })[] {
  if (floor.openings) return floor.openings.map((o) => ({ ...o, auto: false }));
  return autoOpenings(floor, road, segments).map((o) => {
    const { wallId: _wallId, ...rest } = o;
    void _wallId;
    return { ...rest, auto: true };
  });
}

/** The segment on a wall line that contains a centre point (exclusive ends). */
export function segmentAt(
  segments: Wall[],
  axis: "x" | "z",
  line: number,
  center: number,
): Wall | undefined {
  return segments.find(
    (w) =>
      w.axis === axis &&
      wallLine(w) === line &&
      center > wallStart(w) &&
      center < wallStart(w) + w.length,
  );
}

/** Derived walls with their openings attached. */
export function deriveWalls(
  floor: GeometryFloor,
  road: EdgeSide = "south",
): Wall[] {
  const segments = deriveWallSegments(floor);
  for (const o of resolveFloorOpenings(floor, road, segments)) {
    const wall = segmentAt(segments, o.axis, o.line, o.center);
    if (!wall) continue;
    const opening: WallOpening = {
      id: o.id,
      kind: o.kind,
      offset: o.center - wallStart(wall),
      width: o.width,
      height: o.height,
      sill: o.sill,
      auto: o.auto,
      ...(o.style ? { style: o.style } : {}),
      ...(o.hinge ? { hinge: o.hinge } : {}),
      ...(o.swing ? { swing: o.swing } : {}),
    };
    wall.openings.push(opening);
  }
  for (const w of segments) w.openings.sort((a, b) => a.offset - b.offset);
  return segments;
}

export type WallPiece = {
  /** Distance from the wall start, cm. */
  start: number;
  length: number;
  /** Height above the floor, cm. */
  bottom: number;
  height: number;
};
/**
 * Solid wall pieces around any number of openings: full-height piers between
 * openings, plus a sill piece and a lintel piece per opening. Openings are
 * clamped to the wall and to `height` (a cutaway may be lower than a lintel).
 */
export function wallPieces(
  wall: Pick<Wall, "length" | "openings">,
  height: number,
  minPier = 0,
): WallPiece[] {
  const pieces: WallPiece[] = [];
  let cursor = 0;
  const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
  for (const o of openings) {
    const start = Math.max(cursor, o.offset - o.width / 2),
      end = Math.min(wall.length, o.offset + o.width / 2);
    if (end <= start) continue;
    if (start - cursor > minPier)
      pieces.push({ start: cursor, length: start - cursor, bottom: 0, height });
    const sill = Math.min(o.sill, height),
      top = Math.min(o.sill + o.height, height);
    if (sill > 0)
      pieces.push({ start, length: end - start, bottom: 0, height: sill });
    if (top < height)
      pieces.push({
        start,
        length: end - start,
        bottom: top,
        height: height - top,
      });
    cursor = end;
  }
  if (wall.length - cursor > minPier)
    pieces.push({
      start: cursor,
      length: wall.length - cursor,
      bottom: 0,
      height,
    });
  return pieces;
}
