// Pure boundary plan for `site.fence`: wall/fence runs around the plot edge,
// gate openings on the road side (walk gate at the entrance path, drive gate
// at the driveway), and pillar positions. Plot-local metres.
import type { Project } from "../../domain/types";
import type { SiteLayout } from "./site";

export type FenceRun = { x0: number; z0: number; x1: number; z1: number };
export type FenceGate = {
  /** Centre of the opening on the fence line. */
  x: number;
  z: number;
  width: number;
  alongX: boolean;
  kind: "walk" | "drive";
};
export type FencePlan = {
  kind: string;
  runs: FenceRun[];
  gates: FenceGate[];
  /** Pillar centres (walls only): run ends and every ~2.5 m. */
  pillars: [number, number][];
};

/** Centre-line inset of the boundary from the plot edge. */
export const FENCE_INSET = 0.12;
export const PILLAR_SPACING = 2.5;
const WALLS = new Set(["compound-wall", "low-wall"]);
export const fenceHasPillars = (kind: string) => WALLS.has(kind);

type Interval = [number, number];
function subtract(span: Interval, cuts: Interval[]): Interval[] {
  let out: Interval[] = [span];
  for (const [c0, c1] of cuts) {
    const next: Interval[] = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 - a > 0.05) next.push([a, c0]);
        if (b - c1 > 0.05) next.push([c1, b]);
      }
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.15);
}
function merge(cuts: Interval[]): Interval[] {
  const sorted = [...cuts].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c[0] <= last[1] + 0.3) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}

export function fencePlan(project: Project, layout: SiteLayout): FencePlan | null {
  const kind = project.site?.fence;
  if (!kind || kind === "none") return null;
  const w = project.plot.width / 100,
    d = project.plot.depth / 100,
    i = FENCE_INSET;
  const road = project.plot.road;
  // Sides as lines: fixed coordinate + along range.
  type Side = { id: "north" | "south" | "east" | "west"; alongX: boolean; fixed: number; a0: number; a1: number };
  const sides: Side[] = [
    { id: "north", alongX: true, fixed: i, a0: i, a1: w - i },
    { id: "south", alongX: true, fixed: d - i, a0: i, a1: w - i },
    { id: "west", alongX: false, fixed: i, a0: i, a1: d - i },
    { id: "east", alongX: false, fixed: w - i, a0: i, a1: d - i },
  ];
  const runs: FenceRun[] = [];
  const gates: FenceGate[] = [];
  const pillars: [number, number][] = [];
  const toXZ = (s: Side, a: number): [number, number] => (s.alongX ? [a, s.fixed] : [s.fixed, a]);
  for (const s of sides) {
    const cuts: Interval[] = [];
    // Never run through the house (footprints touching the plot edge).
    for (const f of project.floors) {
      const fp = f.footprint;
      const x0 = fp.x / 100 - 0.08,
        x1 = (fp.x + fp.w) / 100 + 0.08,
        z0 = fp.z / 100 - 0.08,
        z1 = (fp.z + fp.d) / 100 + 0.08;
      const crosses = s.alongX ? s.fixed > z0 - 0.12 && s.fixed < z1 + 0.12 : s.fixed > x0 - 0.12 && s.fixed < x1 + 0.12;
      if (crosses) cuts.push(s.alongX ? [x0, x1] : [z0, z1]);
    }
    const gateCuts: { cut: Interval; kind: "walk" | "drive" }[] = [];
    if (s.id === road) {
      const along = (e: { x0: number; x1: number; z0: number; z1: number }): Interval => (s.alongX ? [e.x0, e.x1] : [e.z0, e.z1]);
      for (const p of layout.path) {
        const [a, b] = along(p);
        const mid = (a + b) / 2,
          half = Math.max(0.6, (b - a) / 2 + 0.05);
        gateCuts.push({ cut: [mid - half, mid + half], kind: "walk" });
      }
      if (!layout.path.length) {
        const mid = (s.a0 + s.a1) / 2;
        gateCuts.push({ cut: [mid - 0.6, mid + 0.6], kind: "walk" });
      }
      const drives: Interval[] = [];
      if (layout.parking) drives.push(along(layout.parking.driveway));
      for (const item of project.landscape ?? []) {
        if (item.kind !== "parking") continue;
        const turned = item.rotation % 180 !== 0;
        const iw = (turned ? item.d ?? 450 : item.w ?? 260) / 100,
          id = (turned ? item.w ?? 260 : item.d ?? 450) / 100;
        const x = item.x / 100,
          z = item.z / 100;
        const rect = { x0: x - iw / 2, x1: x + iw / 2, z0: z - id / 2, z1: z + id / 2 };
        const gap = road === "south" ? d - rect.z1 : road === "north" ? rect.z0 : road === "east" ? w - rect.x1 : rect.x0;
        if (gap < 2.5) drives.push(along(rect));
      }
      for (const [a, b] of drives) {
        const mid = (a + b) / 2,
          half = Math.max(1.4, (b - a) / 2);
        gateCuts.push({ cut: [mid - half, mid + half], kind: "drive" });
      }
    }
    const merged = merge(gateCuts.map((g) => g.cut));
    for (const [a, b] of merged) {
      const lo = Math.max(s.a0 + 0.2, a),
        hi = Math.min(s.a1 - 0.2, b);
      if (hi - lo < 0.5) continue;
      const drive = gateCuts.some((g) => g.kind === "drive" && g.cut[0] < hi && g.cut[1] > lo);
      const [x, z] = toXZ(s, (lo + hi) / 2);
      gates.push({ x, z, width: hi - lo, alongX: s.alongX, kind: drive ? "drive" : "walk" });
      cuts.push([lo, hi]);
    }
    for (const [a, b] of subtract([s.a0, s.a1], merge(cuts))) {
      const [x0, z0] = toXZ(s, a),
        [x1, z1] = toXZ(s, b);
      runs.push({ x0, z0, x1, z1 });
      if (!WALLS.has(kind)) continue;
      const n = Math.max(1, Math.round((b - a) / PILLAR_SPACING));
      for (let k = 0; k <= n; k++) pillars.push(toXZ(s, a + ((b - a) * k) / n));
    }
  }
  // Corners are shared by two sides: keep one pillar each.
  const seen = new Set<string>();
  const unique = pillars.filter(([x, z]) => {
    const key = `${Math.round(x * 20)}:${Math.round(z * 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { kind, runs, gates, pillars: unique };
}

export type ParkingSpot = {
  cx: number;
  cz: number;
  /** Half extents of the pad. */
  hx: number;
  hz: number;
  /** Unit direction (plot axes) from the pad centre toward the road. */
  road: [number, number];
};
/** Parking pads (automatic or placed) for the car porch. */
export function parkingSpots(project: Project, layout: SiteLayout): ParkingSpot[] {
  const road = project.plot.road;
  const dir: [number, number] = road === "south" ? [0, 1] : road === "north" ? [0, -1] : road === "east" ? [1, 0] : [-1, 0];
  if (project.landscape)
    return project.landscape
      .filter((i) => i.kind === "parking")
      .map((i) => {
        const turned = i.rotation % 180 !== 0;
        return { cx: i.x / 100, cz: i.z / 100, hx: turned ? 2.3 : 1.3, hz: turned ? 1.3 : 2.3, road: dir };
      });
  const p = layout.parking;
  if (!p) return [];
  return [{ cx: p.center[0], cz: p.center[1], hx: p.horizontal ? 1.3 : 2.3, hz: p.horizontal ? 2.3 : 1.3, road: dir }];
}
