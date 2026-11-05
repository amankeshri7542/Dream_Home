// The street around the home (pure): neighbouring plots, their homes, trees,
// poles and wires, and the road running on past the plot. Seeded by the plot,
// so a home keeps its neighbours. It is laid out in road-local coordinates
// (`along` the road, `out` metres beyond the plot's road edge; roadFrame) and
// merged into a few buckets, so the whole street costs a handful of draw calls.
import { Buckets, mixRgb, rgb, scaleRgb, type RGB, type V3 } from "../building/geometry/QuadBuilder";
import { hash2 } from "../materials/noise";
import { ROAD_BAND, plinthExtents, roadFrame } from "../props/site";
import type { Project } from "../../domain/types";
import { GROUND_TOP } from "../coords";

export type WorldBucket = "plaster" | "glass" | "lit" | "ground" | "asphalt" | "pavers" | "marks" | "leaves" | "bark";

/** How far the street runs either way, metres. */
export const STREET_REACH = 95;
const FLOOR_H = 3.05;
/** The palette of an Indian street: limewash and exterior emulsion, a little dusty. */
const WALLS = ["#f2e6cf", "#efd9b4", "#f4cfa8", "#e8e2d2", "#d9e4d2", "#cfe0e6", "#efc9b9", "#f6efe2", "#e9d68f", "#c9d8c0", "#ead0d6", "#dfe3e6"];
const TRIMS = ["#b9603f", "#7c2f2b", "#f6f1e6", "#5f6f62", "#3f5e6f", "#a07b4f"];
const DUST = rgb("#a8957c");
const DARK_GLASS = rgb("#39424a");

type Rand = (slot: number) => number;

/** A rectangle in road-local space, facing the road (+1) or away from it (−1). */
type Lot = {
  a0: number;
  a1: number;
  o0: number;
  o1: number;
  face: 1 | -1;
  detail: boolean;
  id: number;
  /** A wider side yard (metres), so the plot's own side windows look out on something. */
  gap0?: number;
  gap1?: number;
};

/** Lots along both sides of the road and behind the plot. */
export function streetLots(project: Project): Lot[] {
  const frame = roadFrame(project);
  const depth = frame.horizontal ? project.plot.depth / 100 : project.plot.width / 100;
  const lots: Lot[] = [];
  let id = 0;
  const run = (a: number, end: number, step: 1 | -1, o0: number, o1: number, face: 1 | -1, detail: boolean) => {
    let at = a;
    while (step > 0 ? at < end : at > end) {
      const w = 8.5 + hash2(id, 3, 901) * 6;
      const n0 = step > 0 ? at : at - w,
        n1 = step > 0 ? at + w : at;
      lots.push({ a0: n0, a1: n1, o0, o1, face, detail, id: id++ });
      at += step * w;
    }
  };
  const near = STREET_REACH * 0.55;
  const gap = 0.7;
  // Beside the plot, facing the same road.
  run(frame.alongMax + gap, frame.alongMax + near, 1, -depth, -0.1, 1, true);
  run(frame.alongMin - gap, frame.alongMin - near, -1, -depth, -0.1, 1, true);
  run(frame.alongMax + near, frame.alongMax + STREET_REACH, 1, -depth, -0.1, 1, false);
  run(frame.alongMin - near, frame.alongMin - STREET_REACH, -1, -depth, -0.1, 1, false);
  // The next-door homes stand back from the shared wall, so side windows get a view.
  for (const lot of lots) {
    if (Math.abs(lot.a0 - (frame.alongMax + gap)) < 1e-6) lot.gap0 = 3.4;
    if (Math.abs(lot.a1 - (frame.alongMin - gap)) < 1e-6) lot.gap1 = 3.4;
  }
  // Across the road, facing the plot.
  const far = ROAD_BAND + 0.2;
  const middle = (frame.alongMin + frame.alongMax) / 2;
  run(middle - 5, middle + near, 1, far, far + 17, -1, true);
  run(middle - 5, middle - near, -1, far, far + 17, -1, true);
  run(middle + near, middle + STREET_REACH, 1, far, far + 17, -1, false);
  run(middle - near, middle - STREET_REACH, -1, far, far + 17, -1, false);
  // Behind the plot, backs towards it; and a second row across the road for the skyline.
  run(middle - 5, middle + near, 1, -depth - 0.8 - 18, -depth - 0.8, -1, true);
  run(middle - 5, middle - near, -1, -depth - 0.8 - 18, -depth - 0.8, -1, true);
  run(middle - STREET_REACH, middle + STREET_REACH, 1, far + 21, far + 37, -1, false);
  run(middle - STREET_REACH, middle + STREET_REACH, 1, -depth - 22 - 17, -depth - 22, 1, false);
  return lots;
}

class Street {
  readonly buckets = new Buckets<WorldBucket>();
  private readonly frame;
  constructor(project: Project) {
    this.frame = roadFrame(project);
  }
  /** Road-local → plot metres. */
  at(a: number, o: number): [number, number] {
    return this.frame.toPlot(a, o);
  }
  /** A box in road-local coordinates. */
  box(bucket: WorldBucket, a0: number, a1: number, o0: number, o1: number, y0: number, y1: number, color: RGB, skipBottom = true) {
    const [x0, z0] = this.at(a0, o0),
      [x1, z1] = this.at(a1, o1);
    const min: V3 = [Math.min(x0, x1), y0, Math.min(z0, z1)],
      max: V3 = [Math.max(x0, x1), y1, Math.max(z0, z1)];
    this.buckets.get(bucket).box(min, max, color, skipBottom ? [2] : undefined);
  }
  /** A flat rectangle on a wall facing `out` (±o), just proud of it. */
  onFront(bucket: WorldBucket, a0: number, a1: number, o: number, face: 1 | -1, y0: number, y1: number, color: RGB) {
    const [x0, z0] = this.at(a0, o),
      [x1, z1] = this.at(a1, o);
    const [nx, nz] = this.at(a0, o + face);
    const n: V3 = [nx - x0, 0, nz - z0];
    this.buckets.get(bucket).quadFacing([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], n, color);
  }
  /** A flat rectangle on a wall facing along the road (±a). */
  onSide(bucket: WorldBucket, a: number, o0: number, o1: number, side: 1 | -1, y0: number, y1: number, color: RGB) {
    const [x0, z0] = this.at(a, o0),
      [x1, z1] = this.at(a, o1);
    const [nx, nz] = this.at(a + side, o0);
    const n: V3 = [nx - x0, 0, nz - z0];
    this.buckets.get(bucket).quadFacing([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], n, color);
  }
  /** A tapered, slightly smooth upright: trunks and poles. */
  trunk(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, leanX: number, leanZ: number, color: RGB, sides = 6) {
    const b = this.buckets.get("bark");
    for (let i = 0; i < sides; i++) {
      const t0 = (i / sides) * Math.PI * 2,
        t1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(t0),
        s0 = Math.sin(t0),
        c1 = Math.cos(t1),
        s1 = Math.sin(t1);
      const a: V3 = [cx + c0 * r0, y0, cz + s0 * r0],
        d: V3 = [cx + c1 * r0, y0, cz + s1 * r0],
        e: V3 = [cx + leanX + c1 * r1, y1, cz + leanZ + s1 * r1],
        f: V3 = [cx + leanX + c0 * r1, y1, cz + leanZ + s0 * r1];
      const mid = (t0 + t1) / 2;
      const shade = 0.82 + 0.3 * ((Math.cos(mid) + 1) / 2);
      b.quadFacing(a, d, e, f, [Math.cos(mid), 0.1, Math.sin(mid)], scaleRgb(color, shade));
    }
  }
}

/** One outer wall of a home: `u` runs along it, `off` is metres out from its face. */
type Plane = { kind: "front" | "side"; at: number; dir: 1 | -1 };

function onPlane(s: Street, plane: Plane, bucket: WorldBucket, u0: number, u1: number, y0: number, y1: number, off: number, color: RGB) {
  if (plane.kind === "front") s.onFront(bucket, u0, u1, plane.at + plane.dir * off, plane.dir, y0, y1, color);
  else s.onSide(bucket, plane.at + plane.dir * off, u0, u1, plane.dir, y0, y1, color);
}
function boxOut(s: Street, plane: Plane, u0: number, u1: number, y0: number, y1: number, off0: number, off1: number, color: RGB, bucket: WorldBucket = "plaster") {
  const n0 = plane.at + plane.dir * off0,
    n1 = plane.at + plane.dir * off1;
  const [m0, m1] = n0 < n1 ? [n0, n1] : [n1, n0];
  if (plane.kind === "front") s.box(bucket, u0, u1, m0, m1, y0, y1, color, false);
  else s.box(bucket, m0, m1, u0, u1, y0, y1, color, false);
}

/** A framed window with its sunshade and the shadow that sunshade leaves on the wall. */
function windowOn(s: Street, plane: Plane, cx: number, hw: number, y0: number, y1: number, wall: RGB, trim: RGB, lit: boolean, near: boolean) {
  const pale = rgb("#ece6da");
  onPlane(s, plane, "plaster", cx - hw - 0.08, cx + hw + 0.08, y0 - 0.08, y1 + 0.08, 0.012, mixRgb(pale, trim, 0.12));
  onPlane(s, plane, "glass", cx - hw, cx + hw, y0, y1, 0.02, DARK_GLASS);
  if (lit) onPlane(s, plane, "lit", cx - hw, cx + hw, y0, y1, 0.026, rgb("#ffd9a0"));
  if (near) {
    const dark = rgb("#2c2d2b");
    onPlane(s, plane, "plaster", cx - 0.018, cx + 0.018, y0, y1, 0.034, dark);
    onPlane(s, plane, "plaster", cx - hw, cx + hw, (y0 + y1) / 2 - 0.012, (y0 + y1) / 2 + 0.012, 0.034, dark);
    // A sill, and the grey rain streak under it.
    boxOut(s, plane, cx - hw - 0.1, cx + hw + 0.1, y0 - 0.14, y0 - 0.08, 0, 0.1, mixRgb(wall, pale, 0.5));
    onPlane(s, plane, "plaster", cx - hw + 0.1, cx + hw - 0.1, y0 - 0.62, y0 - 0.14, 0.006, scaleRgb(wall, 0.9));
  }
  const shade = near ? 0.55 : 0.4;
  boxOut(s, plane, cx - hw - 0.2, cx + hw + 0.2, y1 + 0.1, y1 + 0.18, 0, shade, mixRgb(wall, pale, 0.5));
  onPlane(s, plane, "plaster", cx - hw - 0.2, cx + hw + 0.2, y1 + 0.08, y1 + 0.1, 0.008, scaleRgb(wall, 0.72));
}

/** One home on its lot. */
function home(s: Street, lot: Lot) {
  const r: Rand = (slot) => hash2(lot.id, slot, 907);
  const wall = mixRgb(rgb(WALLS[Math.floor(r(1) * WALLS.length)]), DUST, 0.1 + r(2) * 0.08);
  const trim = rgb(TRIMS[Math.floor(r(3) * TRIMS.length)]);
  const pale = rgb("#ece6da");
  const floors = lot.detail ? 1 + Math.floor(r(4) * 2.7) : 2 + Math.floor(r(4) * 2.4);
  // The front of the lot is the side nearest the road for its row.
  const front = lot.face > 0 ? lot.o1 : lot.o0;
  const setback = lot.detail ? 1.2 + r(5) * 2 : 0.8;
  const inset = 0.12 + r(6) * 0.5;
  const a0 = lot.a0 + Math.max(inset, lot.gap0 ?? 0),
    a1 = lot.a1 - Math.max(inset, lot.gap1 ?? 0);
  const faceO = front - lot.face * setback;
  const backO = lot.face > 0 ? lot.o0 + 1.5 + r(19) * 1.6 : lot.o1 - 1.5 - r(19) * 1.6;
  const [o0, o1] = faceO < backO ? [faceO, backO] : [backO, faceO];
  const H = floors * FLOOR_H;
  const walls = s.buckets.get("plaster");
  // The body: darker and dustier at the foot, lighter under the parapet, as walls weather.
  const foot = scaleRgb(mixRgb(wall, DUST, 0.3), 0.8);
  for (const [ca0, co0, ca1, co1, nx, nz] of [
    [a0, o0, a1, o0, 0, -1],
    [a1, o1, a0, o1, 0, 1],
    [a0, o1, a0, o0, -1, 0],
    [a1, o0, a1, o1, 1, 0],
  ] as const) {
    const [x0, z0] = s.at(ca0, co0),
      [x1, z1] = s.at(ca1, co1);
    const [ox, oz] = s.at(ca0 + nx, co0 + nz);
    const facing: V3 = [ox - x0, 0, oz - z0];
    const mid = Math.min(H, 2.4);
    walls.quadFacing([x0, 0, z0], [x1, 0, z1], [x1, mid, z1], [x0, mid, z0], facing, mixRgb(foot, wall, 0.5));
    walls.quadFacing([x0, mid, z0], [x1, mid, z1], [x1, H, z1], [x0, H, z0], facing, wall);
  }
  s.box("plaster", a0 - 0.015, a1 + 0.015, o0 - 0.015, o1 + 0.015, 0, 0.42, scaleRgb(mixRgb(wall, DUST, 0.5), 0.72));
  for (let f = 1; f < floors; f++) s.box("plaster", a0 - 0.05, a1 + 0.05, o0 - 0.05, o1 + 0.05, f * FLOOR_H - 0.1, f * FLOOR_H + 0.08, mixRgb(wall, pale, 0.45));
  // Roof slab, parapet with a coping.
  const t = 0.14;
  const parapet = H + 0.95;
  const coping = mixRgb(wall, trim, 0.25);
  s.box("plaster", a0 + t, a1 - t, o0 + t, o1 - t, H - 0.02, H + 0.02, scaleRgb(wall, 0.7));
  s.box("plaster", a0, a1, o0, o0 + t, H, parapet, wall);
  s.box("plaster", a0, a1, o1 - t, o1, H, parapet, wall);
  s.box("plaster", a0, a0 + t, o0, o1, H, parapet, wall);
  s.box("plaster", a1 - t, a1, o0, o1, H, parapet, wall);
  s.box("plaster", a0 - 0.04, a1 + 0.04, o0 - 0.04, o0 + t + 0.04, parapet, parapet + 0.06, coping);
  s.box("plaster", a0 - 0.04, a1 + 0.04, o1 - t - 0.04, o1 + 0.04, parapet, parapet + 0.06, coping);
  s.box("plaster", a0 - 0.04, a0 + t + 0.04, o0, o1, parapet, parapet + 0.06, coping);
  s.box("plaster", a1 - t - 0.04, a1 + 0.04, o0, o1, parapet, parapet + 0.06, coping);
  // On the roof: the stair head and a water tank, as on nearly every Indian roof.
  const sa = r(7) > 0.5 ? a0 + 0.3 : a1 - 3.1;
  const so = (o0 + o1) / 2 - 1.4 + (r(8) - 0.5) * 2;
  s.box("plaster", sa, sa + 2.8, so, so + 3, H, H + 2.5, mixRgb(wall, pale, 0.2));
  s.box("plaster", sa - 0.12, sa + 2.92, so - 0.12, so + 3.12, H + 2.5, H + 2.6, coping);
  const tankA = sa + 1.4 + (r(9) - 0.5) * 0.6,
    tankO = so + 1.5;
  const tankColor = r(10) > 0.28 ? rgb("#262a2d") : rgb("#dfe1dc");
  const [tx, tz] = s.at(tankA, tankO);
  walls.cylinder(tx, tz, H + 2.62, H + 3.72, 0.55, 0.55, tankColor, 10);
  // What's on the front.
  const frontPlane: Plane = { kind: "front", at: faceO, dir: lot.face };
  const windows = Math.max(1, Math.floor((a1 - a0) / 2.7));
  const gap = (a1 - a0) / windows;
  for (let f = 0; f < floors; f++) {
    const y = f * FLOOR_H;
    const balcony = f > 0 && lot.detail && hash2(lot.id, f, 911) > 0.45;
    for (let w = 0; w < windows; w++) {
      const cx = a0 + gap * (w + 0.5);
      const hw = Math.min(0.85, gap * 0.34);
      const door = f === 0 && w === Math.floor(hash2(lot.id, 12, 907) * windows);
      if (door) {
        onPlane(s, frontPlane, "plaster", cx - 0.62, cx + 0.62, y, y + 2.25, 0.012, scaleRgb(trim, 0.92));
        onPlane(s, frontPlane, "glass", cx - 0.5, cx + 0.5, y, y + 2.14, 0.02, rgb("#5a3a22"));
        boxOut(s, frontPlane, cx - 0.95, cx + 0.95, y + 2.32, y + 2.42, 0, 0.75, mixRgb(wall, pale, 0.4));
        continue;
      }
      windowOn(s, frontPlane, cx, hw, y + 0.95, y + 2.2, wall, trim, hash2(lot.id + f * 31, w, 913) < 0.45, lot.detail);
    }
    if (balcony) {
      const span = Math.min(a1 - a0 - 0.6, 3.4 + r(14) * 2);
      const b0 = a0 + (a1 - a0 - span) * r(15),
        b1 = b0 + span;
      boxOut(s, frontPlane, b0, b1, y - 0.12, y + 0.02, 0, 1.05, mixRgb(wall, pale, 0.55));
      const rail = rgb("#2d2f2e");
      boxOut(s, frontPlane, b0, b1, y + 0.98, y + 1.03, 1.03, 1.07, rail);
      for (let k = 0; k <= Math.floor(span / 0.32); k++) boxOut(s, frontPlane, b0 + k * 0.32 - 0.009, b0 + k * 0.32 + 0.009, y + 0.02, y + 0.98, 1.041, 1.059, rail);
    }
  }
  // Sides and back: fewer, smaller windows, and the drainpipe everyone has.
  const backPlane: Plane = { kind: "front", at: lot.face > 0 ? o0 : o1, dir: (-lot.face) as 1 | -1 };
  const sides: [Plane, number, number][] = [
    [backPlane, a0, a1],
    [{ kind: "side", at: a1, dir: 1 }, o0, o1],
    [{ kind: "side", at: a0, dir: -1 }, o0, o1],
  ];
  sides.forEach(([plane, u0, u1], n) => {
    const cols = Math.max(1, Math.floor((u1 - u0) / 3.8));
    for (let f = 0; f < floors; f++) {
      const y = f * FLOOR_H;
      for (let w = 0; w < cols; w++) {
        if (hash2(lot.id + f * 7, w + n * 11, 917) < 0.34) continue;
        const cx = u0 + ((u1 - u0) / cols) * (w + 0.5);
        windowOn(s, plane, cx, 0.55, y + 1.1, y + 2.1, wall, trim, hash2(lot.id + f, w + n * 5, 919) < 0.4, lot.detail);
      }
    }
    if (lot.detail) {
      const pipe = u0 + (u1 - u0) * (0.12 + hash2(lot.id, n, 921) * 0.76);
      boxOut(s, plane, pipe - 0.04, pipe + 0.04, 0, H, 0.01, 0.09, rgb("#55544f"));
    }
  });
  if (!lot.detail) return;
  // The compound wall and gate along the road, as most Indian plots have.
  const wallTop = 1.3 + r(16) * 0.25;
  const gateAt = a0 + 1.2 + (a1 - a0 - 2.8) * r(17);
  const gateW = 1.5 + r(18) * 1.3;
  const wallOut = front - lot.face * 0.08;
  const bandO0 = Math.min(wallOut, wallOut + lot.face * 0.16),
    bandO1 = Math.max(wallOut, wallOut + lot.face * 0.16);
  const compound = mixRgb(mixRgb(wall, pale, 0.3), DUST, 0.16);
  s.box("plaster", lot.a0, gateAt, bandO0, bandO1, 0, wallTop, compound);
  s.box("plaster", gateAt + gateW, lot.a1, bandO0, bandO1, 0, wallTop, compound);
  for (const a of [lot.a0, gateAt, gateAt + gateW, lot.a1]) s.box("plaster", a - 0.15, a + 0.15, bandO0 - 0.06, bandO1 + 0.06, 0, wallTop + 0.2, mixRgb(compound, trim, 0.1));
  const gate = rgb("#3a3a38");
  s.box("plaster", gateAt, gateAt + gateW, wallOut + lot.face * 0.05, wallOut + lot.face * 0.08, 0.12, 0.2, gate);
  s.box("plaster", gateAt, gateAt + gateW, wallOut + lot.face * 0.05, wallOut + lot.face * 0.08, wallTop - 0.1, wallTop - 0.03, gate);
  for (let k = 0; k <= Math.floor(gateW / 0.16); k++) s.box("plaster", gateAt + k * 0.16 - 0.01, gateAt + k * 0.16 + 0.01, wallOut + lot.face * 0.055, wallOut + lot.face * 0.075, 0.12, wallTop - 0.03, gate);
  // Paving in front of the door.
  const [g0, g1] = [Math.min(front, faceO), Math.max(front, faceO)];
  s.box("pavers", gateAt - 0.1, gateAt + gateW + 0.1, g0, g1, 0, 0.03, rgb("#c9c2b2"));
}

type Species = "neem" | "mango" | "ashoka" | "palm";

/** Card layout in the leaf atlas (u0, v0, u1, v1). */
const ATLAS: Record<Species, [number, number, number, number]> = {
  neem: [0, 0.5, 0.5, 1],
  mango: [0.5, 0.5, 1, 1],
  ashoka: [0, 0, 0.5, 0.5],
  palm: [0.5, 0, 1, 0.5],
};

/** A tree made of real leaf cards round a crown, lit as one soft volume. */
function tree(s: Street, x: number, z: number, species: Species, scale: number, seed: number) {
  const r: Rand = (slot) => hash2(seed, slot, 931);
  const leaves = s.buckets.get("leaves");
  const uv = ATLAS[species];
  const bark = species === "palm" ? rgb("#7a6a56") : rgb("#55463a");
  if (species === "palm") {
    const height = (8 + r(1) * 3.5) * scale;
    const leanX = (r(2) - 0.5) * 1.2,
      leanZ = (r(3) - 0.5) * 1.2;
    s.trunk(x, z, 0, height * 0.55, 0.2, 0.15, leanX * 0.4, leanZ * 0.4, bark, 6);
    s.trunk(x + leanX * 0.4, z + leanZ * 0.4, height * 0.55, height, 0.15, 0.12, leanX * 0.6, leanZ * 0.6, bark, 6);
    const tx = x + leanX,
      tz = z + leanZ;
    const fronds = 13;
    for (let f = 0; f < fronds; f++) {
      const ang = (f / fronds) * Math.PI * 2 + r(4 + f) * 0.4;
      const dip = 0.2 + r(30 + f) * 0.75;
      const len = (3.1 + r(50 + f) * 0.9) * scale;
      const dx = Math.cos(ang),
        dz = Math.sin(ang);
      const side: V3 = [-dz, 0, dx];
      const w = 0.62 * scale;
      // A frond droops in three lengths.
      let px = tx,
        py = height,
        pz = tz;
      for (let k = 0; k < 3; k++) {
        const seg = len / 3;
        const nx = px + dx * seg * (1 - k * 0.14),
          nz = pz + dz * seg * (1 - k * 0.14),
          ny = py + seg * (0.28 - dip * k * 0.72);
        const v0 = uv[1] + ((uv[3] - uv[1]) * k) / 3,
          v1 = uv[1] + ((uv[3] - uv[1]) * (k + 1)) / 3;
        const color = mixRgb(rgb("#64803a"), rgb("#3a5a2b"), r(70 + f));
        leaves.quad(
          [px - side[0] * w, py, pz - side[2] * w],
          [px + side[0] * w, py, pz + side[2] * w],
          [nx + side[0] * w, ny, nz + side[2] * w],
          [nx - side[0] * w, ny, nz - side[2] * w],
          color,
          [
            [uv[0], v0],
            [uv[2], v0],
            [uv[2], v1],
            [uv[0], v1],
          ],
          [dx * 0.3, 0.95, dz * 0.3],
        );
        px = nx;
        py = ny;
        pz = nz;
      }
    }
    return;
  }
  const narrow = species === "ashoka";
  const height = (narrow ? 8.5 + r(1) * 3 : 5.4 + r(1) * 3) * scale;
  const crownR = (narrow ? 1.25 + r(2) * 0.5 : 2.7 + r(2) * 1.5) * scale;
  const crownH = narrow ? height * 0.92 : height * 0.68;
  const crownY = height - crownH / 2;
  const trunkTop = narrow ? height * 0.75 : height - crownH * 0.75;
  s.trunk(x, z, 0, trunkTop, narrow ? 0.14 : 0.26 * scale, narrow ? 0.05 : 0.13 * scale, (r(3) - 0.5) * 0.5, (r(4) - 0.5) * 0.5, bark, 6);
  if (!narrow) {
    for (let b = 0; b < 4; b++) {
      const ang = r(5 + b) * Math.PI * 2;
      const len = crownR * (0.5 + r(9 + b) * 0.25);
      s.trunk(x, z, trunkTop * 0.82, trunkTop + crownH * 0.25, 0.09 * scale, 0.03, Math.cos(ang) * len, Math.sin(ang) * len, bark, 4);
    }
  }
  const dark = species === "mango" ? rgb("#2d4f26") : narrow ? rgb("#2c4a24") : rgb("#3f6a2c");
  const bright = species === "mango" ? rgb("#5a8234") : narrow ? rgb("#4c7033") : rgb("#7c9c42");
  const cards = narrow ? 60 : 100;
  // A golden-angle spiral covers the crown evenly with no two trees alike.
  for (let i = 0; i < cards; i++) {
    const t = (i + 0.5) / cards;
    const y = 1 - 2 * t;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const ang = i * 2.399963 + r(11) * 6.28;
    const lump = 0.72 + 0.34 * hash2(seed, i, 937);
    const nx = Math.cos(ang) * ring,
      nz = Math.sin(ang) * ring;
    const px = x + nx * crownR * lump,
      py = crownY + y * (crownH / 2) * lump,
      pz = z + nz * crownR * lump;
    const size = (narrow ? 0.9 : 1.25) * scale * (0.8 + hash2(seed, i, 939) * 0.5);
    // Cards lie across the crown's surface, tipped at random so it doesn't look like a shell.
    const spin = hash2(seed, i, 941) * Math.PI * 2;
    const tangent: V3 = [-nz, 0, nx];
    const up2: V3 = [-nx * y, ring, -nz * y];
    const ux = tangent[0] * Math.cos(spin) + up2[0] * Math.sin(spin),
      uy = up2[1] * Math.sin(spin),
      uz = tangent[2] * Math.cos(spin) + up2[2] * Math.sin(spin);
    const vx = -tangent[0] * Math.sin(spin) + up2[0] * Math.cos(spin),
      vy = up2[1] * Math.cos(spin),
      vz = -tangent[2] * Math.sin(spin) + up2[2] * Math.cos(spin);
    // Top of the crown catches the sky, the underside goes dark.
    const light = 0.5 + 0.5 * y;
    const color = scaleRgb(mixRgb(dark, bright, light * 0.8 + hash2(seed, i, 943) * 0.2), 0.75 + light * 0.45);
    const n = Math.hypot(nx, y * 1.2 + 0.25, nz) || 1;
    leaves.quad(
      [px - ux * size - vx * size, py - uy * size - vy * size, pz - uz * size - vz * size],
      [px + ux * size - vx * size, py + uy * size - vy * size, pz + uz * size - vz * size],
      [px + ux * size + vx * size, py + uy * size + vy * size, pz + uz * size + vz * size],
      [px - ux * size + vx * size, py - uy * size + vy * size, pz - uz * size + vz * size],
      color,
      [
        [uv[0], uv[1]],
        [uv[2], uv[1]],
        [uv[2], uv[3]],
        [uv[0], uv[3]],
      ],
      [nx / n, (y * 1.2 + 0.25) / n, nz / n],
    );
  }
}

/** Poles every so often, three sagging wires between them: nothing says "Indian street" faster. */
function polesAndWires(s: Street, a0: number, a1: number, out: number) {
  const span = 27;
  const concrete = rgb("#9c9a92");
  const wire = rgb("#191918");
  const height = 8.2;
  let previous: number | null = null;
  for (let a = a0; a <= a1; a += span) {
    const [x, z] = s.at(a, out);
    s.trunk(x, z, 0, height, 0.13, 0.07, 0, 0, concrete, 4);
    s.box("plaster", a - 0.75, a + 0.75, out - 0.04, out + 0.04, height - 0.55, height - 0.47, rgb("#55524a"));
    if (previous !== null) {
      for (const dA of [-0.65, 0, 0.65]) {
        const y = height - 0.47 + (dA === 0 ? 0.28 : 0);
        const segments = 8;
        for (let k = 0; k < segments; k++) {
          const t0 = k / segments,
            t1 = (k + 1) / segments;
          const sag = (t: number) => y - 4 * 0.42 * t * (1 - t);
          const ax = previous + (a - previous) * t0,
            bx = previous + (a - previous) * t1;
          const o = out + dA * 0.05;
          s.box("plaster", ax, bx, o - 0.012, o + 0.012 + dA * 0.002, Math.min(sag(t0), sag(t1)) - 0.012, Math.max(sag(t0), sag(t1)) + 0.012, wire, false);
        }
      }
    }
    previous = a;
  }
}

/** Everything around the plot, as geometry buckets in plot-local metres. */
export function buildStreet(project: Project): Buckets<WorldBucket> {
  const s = new Street(project);
  const frame = roadFrame(project);
  const ext = plinthExtents(project);
  const depth = frame.horizontal ? project.plot.depth / 100 : project.plot.width / 100;
  const seed = project.plot.width * 7 + project.plot.depth * 13;
  // The ground out to the horizon: four big slabs round the plinth, just under its top.
  const y = GROUND_TOP - 0.02;
  const R = 240;
  const earth = rgb("#b8a98f");
  const ground = s.buckets.get("ground");
  const slab = (x0: number, x1: number, z0: number, z1: number) => ground.box([x0, y - 0.1, z0], [x1, y, z1], earth, [2]);
  slab(ext.x0 - R, ext.x1 + R, ext.z0 - R, ext.z0);
  slab(ext.x0 - R, ext.x1 + R, ext.z1, ext.z1 + R);
  slab(ext.x0 - R, ext.x0, ext.z0, ext.z1);
  slab(ext.x1, ext.x1 + R, ext.z0, ext.z1);
  // The road goes on past the plinth (same levels as Ground's band).
  const middle = (frame.alongMin + frame.alongMax) / 2;
  const roadEnd = middle + STREET_REACH + 80,
    roadStart = middle - STREET_REACH - 80;
  const band = (bucket: WorldBucket, o0: number, o1: number, top: number, color: RGB) => {
    s.box(bucket, roadStart, frame.alongMin, o0, o1, -0.03, top, color);
    s.box(bucket, frame.alongMax, roadEnd, o0, o1, -0.03, top, color);
  };
  band("pavers", 0, 0.55, 0.05, rgb("#d9d2c4"));
  band("pavers", 0.55, 0.67, 0.075, rgb("#e6e1d6"));
  band("asphalt", 0.67, 3.93, 0.012, rgb("#5f6466"));
  band("pavers", 3.93, 4.05, 0.075, rgb("#e6e1d6"));
  const midLine = (0.67 + 3.93) / 2;
  for (const [from, to] of [
    [roadStart, frame.alongMin],
    [frame.alongMax, roadEnd],
  ])
    for (let a = from + 0.6; a + 0.9 < to; a += 2) s.box("marks", a, a + 0.9, midLine - 0.045, midLine + 0.045, 0.012, 0.0145, rgb("#f2efe6"));
  // A walkable, dusty verge across the road, up to the houses opposite.
  s.box("pavers", roadStart, roadEnd, 4.05, 4.65, -0.03, GROUND_TOP, rgb("#b5a78f"));
  // The neighbours.
  const lots = streetLots(project);
  for (const lot of lots) home(s, lot);
  // Trees: in gardens, along the verge, and a few tall ones behind for the skyline.
  let id = 0;
  const speciesOf = (n: number): Species => {
    const k = hash2(seed, n, 947);
    return k < 0.42 ? "neem" : k < 0.68 ? "mango" : k < 0.86 ? "ashoka" : "palm";
  };
  for (const lot of lots) {
    if (!lot.detail) continue;
    if (hash2(lot.id, 3, 949) < 0.55) {
      const a = lot.a0 + 1 + (lot.a1 - lot.a0 - 2) * hash2(lot.id, 4, 949);
      const front = lot.face > 0 ? lot.o1 - 0.8 : lot.o0 + 0.8;
      // Nothing right in front of the home: that view belongs to the home.
      if (lot.o0 > 0 && a > frame.alongMin - 4 && a < frame.alongMax + 4) continue;
      const [x, z] = s.at(a, front);
      tree(s, x, z, speciesOf(id), 0.72 + hash2(lot.id, 5, 949) * 0.4, seed + id++);
    }
  }
  for (let a = roadStart + 40; a < roadEnd - 40; a += 13 + hash2(seed, Math.floor(a), 951) * 15) {
    if (a > frame.alongMin - 4 && a < frame.alongMax + 4) continue;
    if (hash2(seed, Math.floor(a), 953) < 0.34) continue;
    const [x, z] = s.at(a, 4.35);
    tree(s, x, z, speciesOf(id), 0.85 + hash2(seed, Math.floor(a), 955) * 0.5, seed + id++);
  }
  for (let k = 0; k < 16; k++) {
    const side = k % 2 === 0;
    const o = side ? ROAD_BAND + 40 + hash2(seed, k, 957) * 45 : -depth - 40 - hash2(seed, k, 957) * 45;
    const a = middle + (hash2(seed, k, 959) - 0.5) * 2 * STREET_REACH;
    const [x, z] = s.at(a, o);
    tree(s, x, z, speciesOf(id), 1.15 + hash2(seed, k, 961) * 0.7, seed + id++);
  }
  // A tree in each next-door side yard: something green outside the side windows.
  for (const [a, n] of [
    [frame.alongMax + 2.2, 1],
    [frame.alongMin - 2.2, 2],
  ] as const) {
    for (const o of [-depth * 0.32, -depth * 0.72]) {
      const [x, z] = s.at(a, o);
      tree(s, x, z, n === 1 && o < -depth * 0.5 ? "ashoka" : "mango", 0.8, seed + 300 + n * 17 + Math.round(o));
    }
  }
  polesAndWires(s, middle - STREET_REACH, middle + STREET_REACH, 4.32);
  return s.buckets;
}
