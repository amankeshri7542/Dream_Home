// Stair layout (pure) and geometry. Risers n = ceil(H / 0.19). Straight flight
// when (n − 1)·0.26 fits the void's long side (minus 0.1 m), otherwise a
// U-shape (two lanes + half landing) when the short side is ≥ 1.8 m, else a
// compressed straight flight. The flight runs along the void's long axis with
// its bottom at the edge opposite the road.
import type { EdgeSide, Rect } from "../../../domain/types";
import { rgb, type QuadBuilder, type V3 } from "./QuadBuilder";

export const MAX_RISE = 0.19;
export const GOING = 0.26;
export const TREAD = 0.04;
export const NOSING = 0.02;

/** A horizontal step in local (u along the long axis, v across) metres. */
export type Step = { u0: number; u1: number; v0: number; v1: number; y: number };
export type StairLayout = {
  kind: "straight" | "u" | "compressed";
  risers: number;
  rise: number;
  going: number;
  height: number;
  /** Local frame: world = origin + u·U + v·V (metres, plot-local). */
  origin: [number, number];
  U: [number, number];
  V: [number, number];
  length: number;
  width: number;
  /** Treads (top surface y) in climbing order. */
  steps: Step[];
  /** Landings (half landing, arrival platform). */
  landings: Step[];
  /** Lanes (v ranges) occupied by each flight. */
  lanes: [number, number][];
  /** Edge segments (local) where people arrive on the upper floor (no guard). */
  arrival: { u: number; v0: number; v1: number };
};

export function stairLayout(bounds: Rect, heightM: number, road: EdgeSide): StairLayout {
  const bx = bounds.x / 100,
    bz = bounds.z / 100,
    bw = bounds.w / 100,
    bd = bounds.d / 100;
  const alongZ = bd >= bw;
  const length = alongZ ? bd : bw,
    width = alongZ ? bw : bd;
  // Bottom at the edge opposite the road when the road faces the long axis.
  let ascending: 1 | -1 = 1;
  if (alongZ && (road === "north" || road === "south")) ascending = road === "south" ? 1 : -1;
  if (!alongZ && (road === "east" || road === "west")) ascending = road === "east" ? 1 : -1;
  const U: [number, number] = alongZ ? [0, ascending] : [ascending, 0];
  const V: [number, number] = alongZ ? [1, 0] : [0, 1];
  const origin: [number, number] = alongZ
    ? [bx, ascending > 0 ? bz : bz + bd]
    : [ascending > 0 ? bx : bx + bw, bz];
  const n = Math.max(2, Math.ceil(heightM / MAX_RISE - 1e-9));
  const rise = heightM / n;
  const steps: Step[] = [];
  const landings: Step[] = [];
  const lanes: [number, number][] = [];
  let kind: StairLayout["kind"];
  let going = GOING;
  let arrival = { u: length, v0: 0, v1: width };
  if ((n - 1) * GOING <= length - 0.1 + 1e-9 || width < 1.8) {
    kind = (n - 1) * GOING <= length - 0.1 + 1e-9 ? "straight" : "compressed";
    if (kind === "compressed") going = (length - 0.1) / (n - 1);
    const start = length - (n - 1) * going;
    for (let i = 1; i < n; i++)
      steps.push({ u0: start + (i - 1) * going, u1: start + i * going, v0: 0, v1: width, y: i * rise });
    lanes.push([0, width]);
  } else {
    kind = "u";
    const lane = width / 2;
    const landingDepth = Math.max(0.9, Math.min(lane, length * 0.35));
    const n1 = Math.ceil(n / 2),
      n2 = n - n1;
    const run = length - landingDepth - 0.05;
    going = Math.min(GOING, run / Math.max(1, Math.max(n1 - 1, n2 - 1)));
    const landU = length - landingDepth;
    for (let i = 1; i < n1; i++)
      steps.push({ u0: landU - (n1 - i) * going, u1: landU - (n1 - 1 - i) * going, v0: 0, v1: lane, y: i * rise });
    landings.push({ u0: landU, u1: length, v0: 0, v1: width, y: n1 * rise });
    for (let j = 1; j < n2; j++)
      steps.push({ u0: landU - j * going, u1: landU - (j - 1) * going, v0: lane, v1: width, y: (n1 + j) * rise });
    const topEdge = landU - (n2 - 1) * going;
    if (topEdge > 0.01) landings.push({ u0: 0, u1: topEdge, v0: lane, v1: width, y: heightM });
    lanes.push([0, lane], [lane, width]);
    arrival = { u: 0, v0: lane, v1: width };
  }
  return { kind, risers: n, rise, going, height: heightM, origin, U, V, length, width, steps, landings, lanes, arrival };
}

/** Walking height (m above the lower floor finish) at a plot-local point (m). */
export function heightAt(layout: StairLayout, x: number, z: number): number {
  const dx = x - layout.origin[0],
    dz = z - layout.origin[1];
  const u = dx * layout.U[0] + dz * layout.U[1];
  const v = dx * layout.V[0] + dz * layout.V[1];
  let y = 0;
  for (const s of [...layout.steps, ...layout.landings])
    if (u >= s.u0 - 1e-9 && u <= s.u1 + 1e-9 && v >= s.v0 - 1e-9 && v <= s.v1 + 1e-9) y = Math.max(y, s.y);
  if (layout.kind !== "u" && u >= layout.length - 1e-9) y = layout.height;
  return y;
}

const OAK = "#c49a6c",
  RISER = "#f1ece3",
  STRINGER = "#ebe5da",
  RAIL = "#a8794f",
  BALUSTER = "#4a4541";

/** Emit treads, risers, stringers and rails for one stair, from floor finish y0. */
export function emitStairs(layout: StairLayout, y0: number, b: QuadBuilder) {
  const { origin, U, V } = layout;
  const W = (u: number, v: number): [number, number] => [
    origin[0] + U[0] * u + V[0] * v,
    origin[1] + U[1] * u + V[1] * v,
  ];
  const box = (u0: number, u1: number, v0: number, v1: number, ya: number, yb: number, color: string) => {
    const [xa, za] = W(u0, v0),
      [xb, zb] = W(u1, v1);
    b.box(
      [Math.min(xa, xb), y0 + Math.min(ya, yb), Math.min(za, zb)],
      [Math.max(xa, xb), y0 + Math.max(ya, yb), Math.max(za, zb)],
      rgb(color),
    );
  };
  const oak = rgb(OAK);
  // Treads, nosings and closed risers. Flights climb along +u (lane 0) or −u.
  const sorted = [...layout.steps];
  for (const s of sorted) {
    const lane = layout.lanes.findIndex(([a, c]) => s.v0 >= a - 1e-6 && s.v1 <= c + 1e-6);
    const climbsPlus = layout.kind !== "u" || lane === 0;
    const inset = 0.04;
    const v0 = s.v0 + inset,
      v1 = s.v1 - inset;
    if (climbsPlus) {
      box(s.u0 - NOSING, s.u1, v0, v1, s.y - TREAD, s.y, OAK);
      box(s.u0, s.u0 + 0.02, v0, v1, s.y - layout.rise, s.y - TREAD, RISER);
    } else {
      box(s.u0, s.u1 + NOSING, v0, v1, s.y - TREAD, s.y, OAK);
      box(s.u1 - 0.02, s.u1, v0, v1, s.y - layout.rise, s.y - TREAD, RISER);
    }
  }
  for (const l of layout.landings) box(l.u0, l.u1, l.v0 + 0.04, l.v1 - 0.04, l.y - 0.18, l.y, OAK);
  // Final riser up to the arrival edge for straight flights.
  if (layout.kind !== "u" && layout.steps.length) {
    const last = layout.steps[layout.steps.length - 1];
    box(last.u1, last.u1 + 0.02, 0.04, layout.width - 0.04, last.y, layout.height - TREAD, RISER);
  }
  // Stringers: sloped slabs along each lane edge, following the nosing line.
  for (let li = 0; li < layout.lanes.length; li++) {
    const [la, lc] = layout.lanes[li];
    const laneSteps = layout.steps.filter((s) => s.v0 >= la - 1e-6 && s.v1 <= lc + 1e-6);
    if (!laneSteps.length) continue;
    const climbsPlus = layout.kind !== "u" || li === 0;
    const first = laneSteps[0],
      last = laneSteps[laneSteps.length - 1];
    const uStart = climbsPlus ? first.u0 - layout.going : first.u1;
    const uEnd = climbsPlus ? last.u1 : last.u0;
    const yStart = first.y - layout.rise,
      yEnd = last.y;
    for (const v of [la, lc - 0.04]) {
      sloped(b, W, uStart, uEnd, yStart + 0.08, yEnd + 0.08, 0.3, v, v + 0.04, y0, rgb(STRINGER));
    }
    // Handrail on the outer side of each lane (and the middle for U-stairs).
    const railV = layout.kind === "u" ? (li === 0 ? la + 0.02 : lc - 0.06) : lc - 0.05;
    const posts = [uStart, uEnd];
    for (const pu of posts) {
      const py = pu === uStart ? yStart : yEnd;
      box(pu - 0.025, pu + 0.025, railV, railV + 0.04, py, py + 0.95, BALUSTER);
    }
    sloped(b, W, uStart, uEnd, yStart + 0.9, yEnd + 0.9, 0.05, railV - 0.005, railV + 0.045, y0, oak);
    // Balusters every ~0.26 m along the flight.
    for (const s of laneSteps) {
      const mid = (s.u0 + s.u1) / 2;
      box(mid - 0.012, mid + 0.012, railV + 0.008, railV + 0.032, s.y, s.y + 0.88, BALUSTER);
    }
  }
}

/** A sloped bar from (u0, ya) to (u1, yb), `depth` tall below the line. */
function sloped(
  b: QuadBuilder,
  W: (u: number, v: number) => [number, number],
  u0: number,
  u1: number,
  ya: number,
  yb: number,
  depth: number,
  v0: number,
  v1: number,
  y0: number,
  color: [number, number, number],
) {
  const [ox, oz] = W(0, 0);
  const [sx, sz] = W(1, 0);
  const [nx, nz] = W(0, 1);
  const S: V3 = [sx - ox, 0, sz - oz];
  const N: V3 = [nx - ox, 0, nz - oz];
  const profile: [number, number][] = [
    [u0, ya],
    [u1, yb],
    [u1, yb - depth],
    [u0, ya - depth],
  ];
  b.extrude([ox, y0, oz], S, N, profile, v0, v1, color);
}

/** Guard rails around the stair hole on the upper floor (all but the arrival). */
export function emitStairGuards(layout: StairLayout, y0: number, b: QuadBuilder, wallEdges: (edge: [number, number, number, number]) => boolean) {
  const { origin, U, V } = layout;
  const W = (u: number, v: number): [number, number] => [
    origin[0] + U[0] * u + V[0] * v,
    origin[1] + U[1] * u + V[1] * v,
  ];
  const segs: [number, number, number, number][] = [
    [0, 0, layout.length, 0],
    [0, layout.width, layout.length, layout.width],
    [layout.arrival.u === layout.length ? 0 : layout.length, 0, layout.arrival.u === layout.length ? 0 : layout.length, layout.width],
  ];
  if (layout.kind === "u") segs.push([0, 0, 0, layout.arrival.v0]);
  const rail = rgb(RAIL),
    post = rgb(BALUSTER);
  for (const [ua, va, ub, vb] of segs) {
    const [xa, za] = W(ua, va),
      [xb, zb] = W(ub, vb);
    if (wallEdges([xa, za, xb, zb])) continue;
    const len = Math.hypot(xb - xa, zb - za);
    if (len < 0.2) continue;
    const dx = (xb - xa) / len,
      dz = (zb - za) / len;
    const along = (t: number): [number, number] => [xa + dx * t, za + dz * t];
    const bar = (t0: number, t1: number, ya: number, yb: number, thick: number, color: [number, number, number]) => {
      const [x0, z0] = along(t0),
        [x1, z1] = along(t1);
      const px = -dz * (thick / 2),
        pz = dx * (thick / 2);
      b.box(
        [Math.min(x0, x1) + Math.min(-px, px), y0 + ya, Math.min(z0, z1) + Math.min(-pz, pz)],
        [Math.max(x0, x1) + Math.max(-px, px), y0 + yb, Math.max(z0, z1) + Math.max(-pz, pz)],
        color,
      );
    };
    bar(0, len, 0.88, 0.93, 0.06, rail);
    const count = Math.max(2, Math.round(len / 0.12));
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * len;
      const end = i === 0 || i === count;
      bar(Math.max(0, t - (end ? 0.025 : 0.01)), Math.min(len, t + (end ? 0.025 : 0.01)), 0, 0.88, end ? 0.05 : 0.02, post);
    }
  }
}
