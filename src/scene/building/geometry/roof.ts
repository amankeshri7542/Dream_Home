// Roof geometry (pure maths + emitters). Flat roofs keep the v1 parapet
// algorithm (outline of the slab tiles, so courtyards get parapets too).
// Pitched roofs sit on the outer-face rectangle of the top floor footprint:
//   gable  ridge along the long axis, height = (short/2)·tan(pitch)
//   hip    ridge length = long − short (pyramid when square)
//   shed   12° single slope rising away from the road
// Eaves overhang 0.45 m, rakes 0.30 m; 12 cm slabs, fascia, soffit, ridge cap,
// half-round gutters and downpipes.
import { slabTiles } from "../../../domain/model";
import type { EdgeSide, GeometryFloor, Rect, RoofStyle } from "../../../domain/types";
import { EXTERIOR_WALL, GROUND_TOP } from "../../coords";
import { junctionAdjustments, type JunctionWall } from "./junctions";
import { visibleFaces } from "./boxSoup";
import { mixRgb, rgb, type QuadBuilder, type RGB, type V3 } from "./QuadBuilder";

export const EAVE = 0.45;
export const RAKE = 0.3;
export const ROOF_THICKNESS = 0.12;
export const SHED_PITCH = 12;
export const PARAPET = 0.6;
export const COPING = 0.05;

export type OuterRect = { x0: number; x1: number; z0: number; z1: number };
/** Footprint (cm) expanded to the outer faces of the exterior walls (m). */
export function outerRect(footprint: Rect): OuterRect {
  const h = EXTERIOR_WALL / 2;
  return {
    x0: footprint.x / 100 - h,
    x1: (footprint.x + footprint.w) / 100 + h,
    z0: footprint.z / 100 - h,
    z1: (footprint.z + footprint.d) / 100 + h,
  };
}

export type RoofFrame = {
  /** Long axis for gable/hip, along-road axis for shed. */
  alongX: boolean;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
};
function frame(r: OuterRect, alongX: boolean): RoofFrame {
  return alongX
    ? { alongX, a0: r.x0, a1: r.x1, b0: r.z0, b1: r.z1 }
    : { alongX, a0: r.z0, a1: r.z1, b0: r.x0, b1: r.x1 };
}
const roadAlongX = (road: EdgeSide) => road === "north" || road === "south";

/** Metres from the wall top to the highest roof point (ridge or coping). */
export function roofRise(footprint: Rect, style: RoofStyle, pitchDeg: number, road: EdgeSide): number {
  const r = outerRect(footprint);
  const w = r.x1 - r.x0,
    d = r.z1 - r.z0;
  if (style === "flat") return PARAPET + COPING;
  if (style === "shed") {
    const span = roadAlongX(road) ? d : w;
    return span * Math.tan((SHED_PITCH * Math.PI) / 180) + ROOF_THICKNESS / Math.cos((SHED_PITCH * Math.PI) / 180);
  }
  const short = Math.min(w, d);
  return ridgeHeight(short, pitchDeg) + ROOF_THICKNESS / Math.cos((pitchDeg * Math.PI) / 180);
}
/** Gable/hip ridge height above the wall top (underside). */
export const ridgeHeight = (short: number, pitchDeg: number) =>
  (short / 2) * Math.tan((pitchDeg * Math.PI) / 180);

/** Closed eave outline (first point repeated), plan metres. */
export function roofOutline(footprint: Rect, style: RoofStyle, road: EdgeSide): [number, number][] {
  const r = outerRect(footprint);
  let ex = 0,
    ez = 0;
  if (style === "hip") ex = ez = EAVE;
  else if (style === "gable") {
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    ex = alongX ? RAKE : EAVE;
    ez = alongX ? EAVE : RAKE;
  } else if (style === "shed") {
    const alongX = roadAlongX(road);
    ex = alongX ? RAKE : EAVE;
    ez = alongX ? EAVE : RAKE;
  }
  const pts: [number, number][] = [
    [r.x0 - ex, r.z0 - ez],
    [r.x1 + ex, r.z0 - ez],
    [r.x1 + ex, r.z1 + ez],
    [r.x0 - ex, r.z1 + ez],
  ];
  return [...pts, pts[0]];
}

export type RoofBuckets = { roof: QuadBuilder; trim: QuadBuilder; facade: QuadBuilder };

const SOFFIT = "#f2ede4";

/** Map local (a, y, b) to world. */
const W = (f: RoofFrame, a: number, y: number, b: number): V3 => (f.alongX ? [a, y, b] : [b, y, a]);

/** Gable, hip or shed roof on a rectangular footprint. */
export function emitPitchedRoof(
  footprint: Rect,
  style: Exclude<RoofStyle, "flat">,
  pitchDeg: number,
  wallTop: number,
  road: EdgeSide,
  trimHex: string,
  out: RoofBuckets,
) {
  const r = outerRect(footprint);
  const trim = rgb(trimHex),
    soffit = rgb(SOFFIT);
  const ridgeCap: RGB = [0.72, 0.72, 0.72];
  if (style === "shed") return emitShed(r, wallTop, road, trim, soffit, out);
  const f = frame(r, r.x1 - r.x0 >= r.z1 - r.z0);
  const p = (pitchDeg * Math.PI) / 180,
    tan = Math.tan(p),
    cos = Math.cos(p);
  const S = f.b1 - f.b0,
    bm = (f.b0 + f.b1) / 2;
  const hr = ridgeHeight(S, pitchDeg);
  const d = ROOF_THICKNESS / cos;
  const yR = wallTop + hr,
    yE = wallTop - EAVE * tan;
  const hip = style === "hip";
  const overA = hip ? EAVE : RAKE;
  const A0 = f.a0 - overA,
    A1 = f.a1 + overA;
  const B0 = f.b0 - EAVE,
    B1 = f.b1 + EAVE;
  // Ridge end points along a.
  const ra0 = hip ? Math.min(f.a0 + S / 2, (f.a0 + f.a1) / 2) : A0;
  const ra1 = hip ? Math.max(f.a1 - S / 2, (f.a0 + f.a1) / 2) : A1;
  const slopeLen = (S / 2 + EAVE) / cos;
  // Long slopes (both sides of the ridge).
  for (const side of [-1, 1] as const) {
    const bE = side < 0 ? B0 : B1;
    const nb = side * Math.sin(p),
      ny = Math.cos(p);
    const normal: V3 = f.alongX ? [0, ny, nb] : [nb, ny, 0];
    const eaveA0 = A0,
      eaveA1 = A1;
    for (const [yo, bucket, facing, color] of [
      [d, out.roof, 1, [1, 1, 1] as RGB],
      [0, out.trim, -1, soffit],
    ] as const) {
      const n: V3 = [normal[0] * facing, normal[1] * facing, normal[2] * facing];
      const a = W(f, eaveA0, yE + yo, bE),
        b = W(f, eaveA1, yE + yo, bE),
        c = W(f, ra1, yR + yo, bm),
        dd = W(f, ra0, yR + yo, bm);
      const uv = (aa: number, onRidge: boolean): [number, number] => [aa, onRidge ? slopeLen : 0];
      bucket.quadFacing(a, b, c, dd, n, color, [uv(eaveA0, false), uv(eaveA1, false), uv(ra1, true), uv(ra0, true)]);
    }
    // Fascia board along the eave.
    const fb0 = side < 0 ? B0 - 0.025 : B1,
      fb1 = side < 0 ? B0 : B1 + 0.025;
    boxW(out.trim, f, A0 - (hip ? 0.025 : 0), A1 + (hip ? 0.025 : 0), yE - 0.07, yE + d + 0.005, fb0, fb1, trim);
    gutter(out.trim, f, A0, A1, yE - 0.02, side < 0 ? B0 - 0.025 : B1 + 0.025, side, trim);
    // Downpipes near both ends.
    for (const aEnd of [f.a0 + 0.18, f.a1 - 0.18]) {
      const bWall = side < 0 ? f.b0 : f.b1;
      const bOut = bWall + side * 0.04;
      boxW(out.trim, f, aEnd - 0.04, aEnd + 0.04, GROUND_TOP, yE - 0.06, Math.min(bWall, bOut + side * 0.08), Math.max(bWall, bOut + side * 0.08), trim);
      boxW(out.trim, f, aEnd - 0.035, aEnd + 0.035, yE - 0.1, yE - 0.03, Math.min(bWall, side < 0 ? B0 : B1), Math.max(bWall, side < 0 ? B0 : B1), trim);
    }
  }
  if (hip) {
    // End triangles (or the remaining pyramid faces).
    for (const side of [-1, 1] as const) {
      const aE = side < 0 ? A0 : A1;
      const ra = side < 0 ? ra0 : ra1;
      const na = side * Math.sin(p),
        ny = Math.cos(p);
      const normal: V3 = f.alongX ? [na, ny, 0] : [0, ny, na];
      for (const [yo, bucket, facing, color] of [
        [d, out.roof, 1, [1, 1, 1] as RGB],
        [0, out.trim, -1, soffit],
      ] as const) {
        const n: V3 = [normal[0] * facing, normal[1] * facing, normal[2] * facing];
        const a = W(f, aE, yE + yo, B0),
          b = W(f, aE, yE + yo, B1),
          c = W(f, ra, yR + yo, bm);
        bucket.triFacing(a, b, c, n, color);
      }
      const fa0 = side < 0 ? A0 - 0.025 : A1,
        fa1 = side < 0 ? A0 : A1 + 0.025;
      boxW(out.trim, f, fa0, fa1, yE - 0.07, yE + d + 0.005, B0 - 0.025, B1 + 0.025, trim);
    }
    // Hip caps.
    for (const [ca, cb, ra] of [
      [A0, B0, ra0],
      [A0, B1, ra0],
      [A1, B0, ra1],
      [A1, B1, ra1],
    ] as const)
      capBar(out.roof, W(f, ca, yE + d, cb), W(f, ra, yR + d, bm), ridgeCap);
  } else {
    // Gable triangles in the facade finish, and barge boards along the rakes.
    for (const side of [-1, 1] as const) {
      const aWall = side < 0 ? f.a0 : f.a1;
      const N: V3 = f.alongX ? [1, 0, 0] : [0, 0, 1];
      const Sv: V3 = f.alongX ? [0, 0, 1] : [1, 0, 0];
      const origin: V3 = f.alongX ? [aWall, 0, 0] : [0, 0, aWall];
      out.facade.extrude(origin, Sv, N, [
        [f.b0, wallTop],
        [f.b1, wallTop],
        [bm, yR],
      ], side < 0 ? 0 : -EXTERIOR_WALL, side < 0 ? EXTERIOR_WALL : 0, [1, 1, 1]);
      const aEdge = side < 0 ? A0 : A1;
      const barge = side < 0 ? [aEdge - 0.03, aEdge] : [aEdge, aEdge + 0.03];
      const originB: V3 = f.alongX ? [0, 0, 0] : [0, 0, 0];
      for (const half of [-1, 1] as const) {
        const bEnd = half < 0 ? B0 : B1;
        out.trim.extrude(originB, Sv, N, [
          [bm, yR + d + 0.01],
          [bEnd, yE + d + 0.01],
          [bEnd, yE - 0.12],
          [bm, yR - 0.12],
        ], barge[0], barge[1], trim);
      }
    }
  }
  // Ridge cap.
  if (ra1 - ra0 > 0.01) boxW(out.roof, f, ra0 - (hip ? 0 : 0.02), ra1 + (hip ? 0 : 0.02), yR + d - 0.04, yR + d + 0.06, bm - 0.09, bm + 0.09, ridgeCap);
}

function emitShed(r: OuterRect, wallTop: number, road: EdgeSide, trim: RGB, soffit: RGB, out: RoofBuckets) {
  const alongX = roadAlongX(road);
  const f = frame(r, alongX);
  // Low edge on the road side: b increases toward the road for south/east.
  const lowAtB1 = road === "south" || road === "east";
  const p = (SHED_PITCH * Math.PI) / 180,
    tan = Math.tan(p),
    cos = Math.cos(p);
  const d = ROOF_THICKNESS / cos;
  const span = f.b1 - f.b0;
  const bLow = lowAtB1 ? f.b1 : f.b0,
    bHigh = lowAtB1 ? f.b0 : f.b1;
  const dir = lowAtB1 ? 1 : -1; // toward the low side
  const yAt = (b: number) => wallTop + (bLow - b) * dir * tan;
  const A0 = f.a0 - RAKE,
    A1 = f.a1 + RAKE;
  const bLowE = bLow + dir * EAVE,
    bHighE = bHigh - dir * EAVE;
  const normalUp: V3 = (() => {
    const nb = dir * Math.sin(p),
      ny = Math.cos(p);
    return alongX ? [0, ny, nb] : [nb, ny, 0];
  })();
  const slopeLen = (span + 2 * EAVE) / cos;
  for (const [yo, bucket, facing, color] of [
    [d, out.roof, 1, [1, 1, 1] as RGB],
    [0, out.trim, -1, soffit],
  ] as const) {
    const n: V3 = [normalUp[0] * facing, normalUp[1] * facing, normalUp[2] * facing];
    bucket.quadFacing(
      W(f, A0, yAt(bLowE) + yo, bLowE),
      W(f, A1, yAt(bLowE) + yo, bLowE),
      W(f, A1, yAt(bHighE) + yo, bHighE),
      W(f, A0, yAt(bHighE) + yo, bHighE),
      n,
      color,
      [
        [A0, 0],
        [A1, 0],
        [A1, slopeLen],
        [A0, slopeLen],
      ],
    );
  }
  // Fascias on both eaves; rake barge boards; gutter on the low side.
  for (const bE of [bLowE, bHighE]) {
    const s = bE === bLowE ? dir : -dir;
    const fb0 = s > 0 ? bE : bE - 0.025,
      fb1 = s > 0 ? bE + 0.025 : bE;
    boxW(out.trim, f, A0, A1, yAt(bE) - 0.07, yAt(bE) + d + 0.005, fb0, fb1, trim);
  }
  const N: V3 = alongX ? [1, 0, 0] : [0, 0, 1];
  const Sv: V3 = alongX ? [0, 0, 1] : [1, 0, 0];
  for (const side of [-1, 1] as const) {
    const aEdge = side < 0 ? A0 : A1;
    out.trim.extrude([0, 0, 0], Sv, N, [
      [bLowE, yAt(bLowE) + d + 0.01],
      [bHighE, yAt(bHighE) + d + 0.01],
      [bHighE, yAt(bHighE) - 0.1],
      [bLowE, yAt(bLowE) - 0.1],
    ], side < 0 ? aEdge - 0.03 : aEdge, side < 0 ? aEdge : aEdge + 0.03, trim);
    // Side infill triangles in the facade finish.
    const aWall = side < 0 ? f.a0 : f.a1;
    const origin: V3 = alongX ? [aWall, 0, 0] : [0, 0, aWall];
    out.facade.extrude(origin, Sv, N, [
      [bLow, wallTop],
      [bHigh, wallTop],
      [bHigh, yAt(bHigh)],
    ], side < 0 ? 0 : -EXTERIOR_WALL, side < 0 ? EXTERIOR_WALL : 0, [1, 1, 1]);
  }
  // High wall infill.
  const hb0 = Math.min(bHigh, bHigh + dir * EXTERIOR_WALL),
    hb1 = Math.max(bHigh, bHigh + dir * EXTERIOR_WALL);
  boxW(out.facade, f, f.a0, f.a1, wallTop, yAt(bHigh), hb0, hb1, [1, 1, 1]);
  gutter(out.trim, f, A0, A1, yAt(bLowE) - 0.02, bLowE + dir * 0.025, dir, trim);
  for (const aEnd of [f.a0 + 0.18, f.a1 - 0.18]) {
    const bOut = bLow + dir * 0.12;
    boxW(out.trim, f, aEnd - 0.04, aEnd + 0.04, GROUND_TOP, yAt(bLowE) - 0.06, Math.min(bLow, bOut), Math.max(bLow, bOut), trim);
  }
}

function boxW(b: QuadBuilder, f: RoofFrame, a0: number, a1: number, y0: number, y1: number, b0: number, b1: number, color: RGB) {
  const p = W(f, Math.min(a0, a1), Math.min(y0, y1), Math.min(b0, b1)),
    q = W(f, Math.max(a0, a1), Math.max(y0, y1), Math.max(b0, b1));
  b.box([Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2])], [Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2])], color);
}

/** Half-round gutter (outer surface) running along a at height y. */
function gutter(b: QuadBuilder, f: RoofFrame, a0: number, a1: number, y: number, bEdge: number, side: 1 | -1, color: RGB) {
  const R = 0.065,
    segs = 6;
  const c = bEdge + side * R;
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI,
      t1 = ((i + 1) / segs) * Math.PI;
    const p0: [number, number] = [c + Math.cos(t0) * R, y - Math.sin(t0) * R];
    const p1: [number, number] = [c + Math.cos(t1) * R, y - Math.sin(t1) * R];
    const mid = (t0 + t1) / 2;
    const nb = Math.cos(mid),
      ny = -Math.sin(mid);
    const normal: V3 = f.alongX ? [0, ny, nb] : [nb, ny, 0];
    b.quadFacing(W(f, a0, p0[1], p0[0]), W(f, a1, p0[1], p0[0]), W(f, a1, p1[1], p1[0]), W(f, a0, p1[1], p1[0]), normal, mixRgb(color, [0, 0, 0], 0.08));
  }
}

/** A thin cap bar between two points (hip caps). */
function capBar(b: QuadBuilder, from: V3, to: V3, color: RGB) {
  const dx = to[0] - from[0],
    dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * 0.06,
    pz = (dx / len) * 0.06;
  const up = 0.05;
  const a: V3 = [from[0] + px, from[1] + up * 0.2, from[2] + pz],
    bb: V3 = [to[0] + px, to[1] + up * 0.2, to[2] + pz],
    c: V3 = [to[0], to[1] + up, to[2]],
    d: V3 = [from[0], from[1] + up, from[2]];
  const a2: V3 = [from[0] - px, from[1] + up * 0.2, from[2] - pz],
    b2: V3 = [to[0] - px, to[1] + up * 0.2, to[2] - pz];
  const n1: V3 = [px, 0.6, pz],
    n2: V3 = [-px, 0.6, -pz];
  b.quadFacing(a, bb, c, d, n1, color);
  b.quadFacing(a2, d, c, b2, n2, color);
}

/** Outward-facing outline edges of the slab tiles (v1 parapet algorithm). */
export function flatRoofEdges(floor: GeometryFloor) {
  const groups = new Map<string, { axis: "x" | "z"; fixed: number; edges: { start: number; end: number; outward: number }[] }>();
  for (const t of slabTiles(floor, false)) {
    const edges = [
      { axis: "x" as const, fixed: t.z, start: t.x, end: t.x + t.w, outward: -1 },
      { axis: "x" as const, fixed: t.z + t.d, start: t.x, end: t.x + t.w, outward: 1 },
      { axis: "z" as const, fixed: t.x, start: t.z, end: t.z + t.d, outward: -1 },
      { axis: "z" as const, fixed: t.x + t.w, start: t.z, end: t.z + t.d, outward: 1 },
    ];
    for (const e of edges) {
      const key = `${e.axis}:${e.fixed}`;
      if (!groups.has(key)) groups.set(key, { axis: e.axis, fixed: e.fixed, edges: [] });
      groups.get(key)!.edges.push(e);
    }
  }
  const out: (JunctionWall & { outward: number })[] = [];
  for (const g of groups.values()) {
    const cuts = [...new Set(g.edges.flatMap((e) => [e.start, e.end]))].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1],
        mid = (start + end) / 2;
      const normal = g.edges.filter((e) => e.start < mid && e.end > mid).reduce((s, e) => s + e.outward, 0);
      if (!normal) continue;
      out.push({
        id: `${g.axis}:${g.fixed}:${start}`,
        axis: g.axis,
        x: g.axis === "x" ? start : g.fixed,
        z: g.axis === "z" ? start : g.fixed,
        length: end - start,
        exterior: true,
        outward: Math.sign(normal),
      });
    }
  }
  return out;
}

/** Flat roof: membrane over the slab tiles, parapets and coping around the outline. */
export function emitFlatRoof(floor: GeometryFloor, wallTop: number, copingHex: string, out: RoofBuckets) {
  const membrane: RGB = [1, 1, 1];
  for (const t of slabTiles(floor, false))
    out.roof.box([t.x / 100, wallTop - 0.02, t.z / 100], [(t.x + t.w) / 100, wallTop + 0.1, (t.z + t.d) / 100], membrane);
  const edges = flatRoofEdges(floor);
  const coping = rgb(copingHex);
  for (const [thick, y0, y1, bucket, color] of [
    [EXTERIOR_WALL, wallTop - 0.01, wallTop + PARAPET, out.facade, [1, 1, 1] as RGB],
    [EXTERIOR_WALL + 0.06, wallTop + PARAPET, wallTop + PARAPET + COPING, out.trim, coping],
  ] as const) {
    const adjust = junctionAdjustments(edges, () => thick);
    const boxes = edges.map((e) => {
      const adj = adjust.get(e.id)!;
      const line = (e.axis === "x" ? e.z : e.x) / 100;
      const s = (e.axis === "x" ? e.x : e.z) / 100 - adj.start,
        en = (e.axis === "x" ? e.x : e.z) / 100 + e.length / 100 + adj.end;
      const min: V3 = e.axis === "x" ? [s, y0, line - thick / 2] : [line - thick / 2, y0, s];
      const max: V3 = e.axis === "x" ? [en, y1, line + thick / 2] : [line + thick / 2, y1, en];
      return { min, max, data: null };
    });
    for (const face of visibleFaces(boxes))
      for (const rect of face.rects) bucket.axisFace(face.axis, face.side, face.plane, rect.u0, rect.u1, rect.v0, rect.v1, color);
  }
}
