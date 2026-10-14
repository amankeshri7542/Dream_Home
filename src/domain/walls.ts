// Wall topology and opening resolution. Walls are derived from room, unit,
// footprint and courtyard edges; openings are either automatic (derived) or the
// floor's explicit `openings` list once the user customises doors and windows.
import { balconyBounds } from "./core";
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
    { kind: OpeningKind; width: number; sill: number; height: number }
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
  for (const room of floor.rooms) {
    const options = segments.filter(
      (w) =>
        !w.exterior &&
        !privateBoundary(w) &&
        !blocked(w) &&
        w.length >= 120 &&
        touches(w, room.bounds) &&
        doorWall(room, w),
    );
    options.sort(rank);
    if (options[0])
      chosen.set(options[0].id, {
        kind: "door",
        width: 90,
        sill: 0,
        height: 215,
      });
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
  return segments
    .filter((w) => chosen.has(w.id))
    .map((w) => ({
      id: `auto:${w.id}`,
      wallId: w.id,
      axis: w.axis,
      line: wallLine(w),
      center: wallStart(w) + w.length / 2,
      ...chosen.get(w.id)!,
    }));
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
