// Flat-roof terrace life: a black water tank on a small steel stand and, when
// the stairs reach the top floor, a stair head-room cabin (mumty) with a door.
import { inside } from "../../../domain/geometry";
import type { EdgeSide, GeometryFloor, Rect } from "../../../domain/types";
import { rgb, type QuadBuilder, type V3 } from "./QuadBuilder";

export type RooftopBuckets = { roof: QuadBuilder; trim: QuadBuilder; facade: QuadBuilder };

export const TANK_RADIUS = 0.52;
export const TANK_HEIGHT = 1.05;
export const STAND_HEIGHT = 0.45;
export const MUMTY_HEIGHT = 2.3;
const WALL = 0.15;

/** Roof top surface (above the membrane) for a wall top: the terrace people walk on. */
export const roofDeck = (wallTop: number) => wallTop + 0.1;
const deck = roofDeck;

/** Where the tank goes: the corner farthest from the road that is solid roof, clear of the mumty. */
export function tankSpot(floor: GeometryFloor, road: EdgeSide, avoid: Rect[]): [number, number] | null {
  const fp = floor.footprint;
  const m = 110; // cm from the outer wall line
  const corners: [number, number][] = [
    [fp.x + m, fp.z + m],
    [fp.x + fp.w - m, fp.z + m],
    [fp.x + m, fp.z + fp.d - m],
    [fp.x + fp.w - m, fp.z + fp.d - m],
  ];
  const away = (p: [number, number]) =>
    road === "south" ? -p[1] : road === "north" ? p[1] : road === "east" ? -p[0] : p[0];
  const blocked = (x: number, z: number) => {
    const r = TANK_RADIUS * 100 + 40;
    const box: Rect = { x: x - r, z: z - r, w: 2 * r, d: 2 * r };
    const overlaps = (o: Rect) => box.x < o.x + o.w && box.x + box.w > o.x && box.z < o.z + o.d && box.z + box.d > o.z;
    return floor.voids.some((v) => overlaps(v.bounds)) || avoid.some(overlaps) || !inside(fp, x, z);
  };
  if (fp.w < 2 * m || fp.d < 2 * m) return null;
  const sorted = [...corners].sort((a, b) => away(a) - away(b) || a[0] - b[0]);
  const spot = sorted.find(([x, z]) => !blocked(x, z));
  return spot ? [spot[0] / 100, spot[1] / 100] : null;
}

export function emitWaterTank(b: QuadBuilder, x: number, z: number, wallTop: number) {
  const y0 = deck(wallTop);
  const steel = rgb("#3b3d3f"),
    black = rgb("#1d1e1f"),
    rib = rgb("#2a2b2c"),
    lid = rgb("#262728");
  const h = 0.42;
  // Stand: four angle legs, a frame and a slatted top.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box([x + sx * h - 0.03, y0, z + sz * h - 0.03], [x + sx * h + 0.03, y0 + STAND_HEIGHT, z + sz * h + 0.03], steel);
  b.box([x - h - 0.03, y0 + STAND_HEIGHT - 0.06, z - h - 0.03], [x + h + 0.03, y0 + STAND_HEIGHT, z + h + 0.03], steel);
  b.box([x - h - 0.03, y0 + 0.1, z - 0.02], [x + h + 0.03, y0 + 0.14, z + 0.02], steel);
  // The tank: ribbed black cylinder with a domed top and a screw lid.
  const t0 = y0 + STAND_HEIGHT;
  b.cylinder(x, z, t0, t0 + TANK_HEIGHT, TANK_RADIUS, TANK_RADIUS, black, 16);
  for (const f of [0.22, 0.5, 0.78]) {
    const y = t0 + TANK_HEIGHT * f;
    b.cylinder(x, z, y - 0.025, y + 0.025, TANK_RADIUS + 0.02, TANK_RADIUS + 0.02, rib, 16);
  }
  b.cylinder(x, z, t0 + TANK_HEIGHT, t0 + TANK_HEIGHT + 0.08, TANK_RADIUS * 0.82, TANK_RADIUS * 0.82, black, 16);
  b.cylinder(x, z, t0 + TANK_HEIGHT + 0.08, t0 + TANK_HEIGHT + 0.13, TANK_RADIUS * 0.45, TANK_RADIUS * 0.45, black, 14);
  b.cylinder(x, z, t0 + TANK_HEIGHT + 0.13, t0 + TANK_HEIGHT + 0.19, 0.17, 0.17, lid, 12);
  // Inlet/outlet pipe running down to the roof.
  b.box([x + TANK_RADIUS - 0.02, y0, z - 0.025], [x + TANK_RADIUS + 0.03, t0 + 0.2, z + 0.025], rgb("#d9d6cf"));
}

/**
 * Mumty over the stair void `r` (cm): plastered walls (facade bucket), a flat
 * cap with coping, and a door on the side facing the open roof.
 */
export function emitMumty(out: RooftopBuckets, r: Rect, floor: GeometryFloor, wallTop: number, doorHex: string, copingHex: string) {
  const y0 = deck(wallTop) - 0.02,
    y1 = deck(wallTop) + MUMTY_HEIGHT;
  const x0 = r.x / 100 - WALL,
    x1 = (r.x + r.w) / 100 + WALL,
    z0 = r.z / 100 - WALL,
    z1 = (r.z + r.d) / 100 + WALL;
  const fp = floor.footprint;
  // Door side: the side with the most roof in front of it.
  const room = {
    north: r.z - fp.z,
    south: fp.z + fp.d - (r.z + r.d),
    west: r.x - fp.x,
    east: fp.x + fp.w - (r.x + r.w),
  };
  const side = (Object.keys(room) as (keyof typeof room)[]).sort((a, b) => room[b] - room[a])[0];
  const white: [number, number, number] = [1, 1, 1];
  const doorW = 0.9,
    doorH = 2.05;
  const walls: { min: V3; max: V3; door: boolean; alongX: boolean }[] = [
    { min: [x0, y0, z0], max: [x1, y1, z0 + WALL], door: side === "north", alongX: true },
    { min: [x0, y0, z1 - WALL], max: [x1, y1, z1], door: side === "south", alongX: true },
    { min: [x0, y0, z0 + WALL], max: [x0 + WALL, y1, z1 - WALL], door: side === "west", alongX: false },
    { min: [x1 - WALL, y0, z0 + WALL], max: [x1, y1, z1 - WALL], door: side === "east", alongX: false },
  ];
  for (const w of walls) {
    if (!w.door) {
      out.facade.box(w.min, w.max, white);
      continue;
    }
    const a = w.alongX ? 0 : 2;
    const mid = (w.min[a] + w.max[a]) / 2;
    const left: V3 = [...w.max] as V3,
      right: V3 = [...w.min] as V3;
    left[a] = mid - doorW / 2;
    right[a] = mid + doorW / 2;
    out.facade.box(w.min, left, white);
    out.facade.box(right, w.max, white);
    const headMin: V3 = [...w.min] as V3;
    headMin[a] = mid - doorW / 2;
    headMin[1] = y0 + doorH;
    const headMax: V3 = [...w.max] as V3;
    headMax[a] = mid + doorW / 2;
    out.facade.box(headMin, headMax, white);
    // Door leaf set back in the opening.
    const n = w.alongX ? 2 : 0;
    const c = (w.min[n] + w.max[n]) / 2;
    const leafMin: V3 = [0, y0 + 0.02, 0],
      leafMax: V3 = [0, y0 + doorH, 0];
    leafMin[a] = mid - doorW / 2;
    leafMax[a] = mid + doorW / 2;
    leafMin[n] = c - 0.025;
    leafMax[n] = c + 0.025;
    out.trim.box(leafMin, leafMax, rgb(doorHex));
    // Small chhajja over the door.
    const shadeMin: V3 = [0, y0 + doorH + 0.12, 0],
      shadeMax: V3 = [0, y0 + doorH + 0.19, 0];
    shadeMin[a] = mid - doorW / 2 - 0.2;
    shadeMax[a] = mid + doorW / 2 + 0.2;
    const outward = side === "north" || side === "west" ? -1 : 1;
    const face = outward < 0 ? w.min[n] : w.max[n];
    shadeMin[n] = Math.min(face, face + outward * 0.45);
    shadeMax[n] = Math.max(face, face + outward * 0.45);
    out.trim.box(shadeMin, shadeMax, rgb("#ebe6dc"));
  }
  // Cap slab and coping.
  out.roof.box([x0 + 0.02, y1 - 0.02, z0 + 0.02], [x1 - 0.02, y1 + 0.1, z1 - 0.02], white);
  out.trim.box([x0 - 0.06, y1 + 0.1, z0 - 0.06], [x1 + 0.06, y1 + 0.16, z1 + 0.06], rgb(copingHex));
}

/** Stair voids on the top floor (the stairs arrive there from below). */
export const mumtyRects = (floor: GeometryFloor): Rect[] =>
  floor.voids.filter((v) => v.kind === "stairs").map((v) => v.bounds);
