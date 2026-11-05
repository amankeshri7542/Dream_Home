// Ceilings, as seen from inside (pure). Each room gets its own finish, and a
// room with a false ceiling gets the usual Indian POP design: a bulkhead band
// round the edge, a step up to the middle, a cove lip hiding a warm LED strip,
// downlights in the band, a rose in the middle and a crown moulding where the
// walls meet the band. Plot-local metres, merged into a few buckets.
import { floorForGeometry, deriveFloorVoids } from "../../../domain/core";
import { CEILING_FINISHES, roomCeiling, roomFalseCeiling, stylePreset, type CeilingFinishId } from "../../../domain/materials";
import type { Floor, Project, Room } from "../../../domain/types";
import { deriveWalls, wallStart } from "../../../domain/walls";
import { floorBase, INTERIOR_WALL } from "../../coords";
import { Buckets, mixRgb, rgb, scaleRgb, type RGB, type V3 } from "./QuadBuilder";

export type CeilingBucket = "plaster" | "teak" | "concrete" | "glow";

/** The underside of the slab above, below the floor's top (as the Walk ceiling always was). */
export const CEILING_DROP = 0.18;
/** How far the bulkhead band hangs below the slab. */
export const BAND_DROP = 0.17;
/** The lip that hides the LED strip, below the slab. */
const LIP = 0.06;
/** Rooms narrower than this get a plain drop ceiling: a step would leave no middle. */
const STEP_MIN = 2.4;
const DOWNLIGHT_SPACING = 1.25;
const DOWNLIGHT_R = 0.045;
/** Warm LED colour of the cove (the owner's ffd9a0). */
export const COVE_COLOUR = "#ffd9a0";

export type FalseCeiling = {
  roomId: string;
  /** Inner rectangle of the room, metres. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Structural ceiling (the middle) and the band's underside. */
  top: number;
  bottom: number;
  /** Band width; 0 for a plain drop ceiling over the whole room. */
  band: number;
  downlights: V3[];
  /** Where the LED strip runs, at lip height, round the middle. */
  cove: { from: V3; to: V3 }[];
};

const half = INTERIOR_WALL / 2;

const ceilingY = (floor: Pick<Floor, "elevation" | "height">) => floorBase(floor) + floor.height / 100 - CEILING_DROP;

/** The highest opening head on any wall of the room, metres above the floor base. */
function tallestOpening(room: Room, walls: ReturnType<typeof deriveWalls>): number {
  const b = room.bounds;
  let top = 0;
  for (const w of walls) {
    const line = w.axis === "x" ? w.z : w.x;
    const on = w.axis === "x" ? Math.abs(line - b.z) < 2 || Math.abs(line - (b.z + b.d)) < 2 : Math.abs(line - b.x) < 2 || Math.abs(line - (b.x + b.w)) < 2;
    if (!on) continue;
    const [lo, hi] = w.axis === "x" ? [b.x, b.x + b.w] : [b.z, b.z + b.d];
    for (const o of w.openings) {
      const c = wallStart(w) + o.offset;
      if (c < lo - 1 || c > hi + 1) continue;
      top = Math.max(top, (o.sill + o.height) / 100);
    }
  }
  return top;
}

/** The false ceilings of a floor's rooms: where the band, cove and downlights go. */
export function falseCeilings(project: Project, floorId: string): FalseCeiling[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const geo = floorForGeometry(project, floorId);
  const walls = deriveWalls(geo, project.plot.road);
  const look = stylePreset(project);
  const top = ceilingY(floor);
  const bottom = top - BAND_DROP;
  const out: FalseCeiling[] = [];
  for (const room of geo.rooms) {
    if (!roomFalseCeiling(room, look)) continue;
    // A door or window reaching above the band would cut into it: keep the plain ceiling there.
    if (floorBase(floor) + tallestOpening(room, walls) > bottom - 0.03) continue;
    const b = room.bounds;
    const x0 = b.x / 100 + half,
      z0 = b.z / 100 + half,
      x1 = (b.x + b.w) / 100 - half,
      z1 = (b.z + b.d) / 100 - half;
    const w = x1 - x0,
      d = z1 - z0;
    if (w < 1 || d < 1) continue;
    const stepped = Math.min(w, d) >= STEP_MIN;
    const band = stepped ? Math.max(0.42, Math.min(0.6, Math.min(w, d) * 0.17)) : 0;
    const downlights: V3[] = [];
    const y = bottom - 0.002;
    if (stepped) {
      // Along the middle of the band, evenly, never in the corners.
      const m = band / 2;
      const along = (ax0: number, ax1: number, put: (t: number) => void) => {
        const n = Math.max(1, Math.floor((ax1 - ax0) / DOWNLIGHT_SPACING));
        for (let i = 0; i < n; i++) put(ax0 + ((i + 0.5) / n) * (ax1 - ax0));
      };
      along(x0 + band, x1 - band, (x) => {
        downlights.push([x, y, z0 + m], [x, y, z1 - m]);
      });
      along(z0 + band, z1 - band, (z) => {
        downlights.push([x0 + m, y, z], [x1 - m, y, z]);
      });
    } else {
      const nx = Math.max(1, Math.round(w / 1.4)),
        nz = Math.max(1, Math.round(d / 1.4));
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) downlights.push([x0 + ((i + 0.5) / nx) * w, y, z0 + ((k + 0.5) / nz) * d]);
    }
    const lip = top - LIP;
    const cove = stepped
      ? [
          { from: [x0 + band, lip, z0 + band] as V3, to: [x1 - band, lip, z0 + band] as V3 },
          { from: [x1 - band, lip, z0 + band] as V3, to: [x1 - band, lip, z1 - band] as V3 },
          { from: [x1 - band, lip, z1 - band] as V3, to: [x0 + band, lip, z1 - band] as V3 },
          { from: [x0 + band, lip, z1 - band] as V3, to: [x0 + band, lip, z0 + band] as V3 },
        ]
      : [];
    out.push({ roomId: room.id, x0, z0, x1, z1, top, bottom, band, downlights, cove });
  }
  return out;
}

const bucketOf = (finish: CeilingFinishId): CeilingBucket => (finish === "teak-panel" ? "teak" : finish === "board-concrete" ? "concrete" : "plaster");

/** A flat, downward-facing quad. */
function down(b: ReturnType<Buckets<CeilingBucket>["get"]>, x0: number, z0: number, x1: number, z1: number, y: number, color: RGB) {
  b.quadFacing([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], color);
}
/** A vertical quad between two plan points, facing `normal`. */
function upright(b: ReturnType<Buckets<CeilingBucket>["get"]>, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, normal: V3, color: RGB) {
  b.quadFacing([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], normal, color);
}
/** A flat disc, facing down. */
function disc(b: ReturnType<Buckets<CeilingBucket>["get"]>, c: V3, r: number, color: RGB, sides = 14) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2,
      a1 = ((i + 1) / sides) * Math.PI * 2;
    b.tri([c[0], c[1], c[2]], [c[0] + Math.cos(a0) * r, c[1], c[2] + Math.sin(a0) * r], [c[0] + Math.cos(a1) * r, c[1], c[2] + Math.sin(a1) * r], color, undefined, [0, -1, 0]);
  }
}

/** Every ceiling of a floor, as buckets. */
export function buildCeilings(project: Project, floorId: string): Buckets<CeilingBucket> {
  const buckets = new Buckets<CeilingBucket>();
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return buckets;
  const geo = floorForGeometry(project, floorId);
  const look = stylePreset(project);
  const top = ceilingY(floor);
  const plain = rgb(CEILING_FINISHES["white-plaster"].color);
  // Under everything that isn't a room (halls, landings): plain plaster, as before.
  const voids = deriveFloorVoids(project, floorId).map((v) => v.bounds);
  const f = geo.footprint;
  const xs = [f.x, f.x + f.w, ...voids.flatMap((v) => [v.x, v.x + v.w])].filter((x) => x >= f.x && x <= f.x + f.w).sort((a, b) => a - b);
  const zs = [f.z, f.z + f.d, ...voids.flatMap((v) => [v.z, v.z + v.d])].filter((z) => z >= f.z && z <= f.z + f.d).sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++)
    for (let k = 0; k + 1 < zs.length; k++) {
      const cx = (xs[i] + xs[i + 1]) / 2,
        cz = (zs[k] + zs[k + 1]) / 2;
      if (xs[i + 1] - xs[i] < 0.5 || zs[k + 1] - zs[k] < 0.5) continue;
      if (voids.some((v) => cx > v.x && cx < v.x + v.w && cz > v.z && cz < v.z + v.d)) continue;
      down(buckets.get("plaster"), xs[i] / 100, zs[k] / 100, xs[i + 1] / 100, zs[k + 1] / 100, top, plain);
    }
  const falses = new Map(falseCeilings(project, floorId).map((c) => [c.roomId, c]));
  for (const room of geo.rooms) {
    const finish = roomCeiling(room, look);
    const b = room.bounds;
    const colour = bucketOf(finish) === "plaster" ? rgb(CEILING_FINISHES[finish].color) : [1, 1, 1] as RGB;
    const bucket = buckets.get(bucketOf(finish));
    const fc = falses.get(room.id);
    // The room's own ceiling, just under the plain one so it wins cleanly.
    if (!fc) {
      down(bucket, b.x / 100, b.z / 100, (b.x + b.w) / 100, (b.z + b.d) / 100, top - 0.003, colour);
      continue;
    }
    const pop = rgb(CEILING_FINISHES["ivory-pop"].color);
    const band = fc.band > 0 ? fc.band : null;
    const p = buckets.get("plaster");
    const shade = scaleRgb(pop, 0.94);
    if (!band) {
      // A plain drop ceiling over the whole room.
      down(p, fc.x0, fc.z0, fc.x1, fc.z1, fc.bottom, pop);
    } else {
      const { x0, z0, x1, z1, bottom } = fc;
      // The middle, at the slab, in the room's finish.
      down(bucket, x0 + band - 0.05, z0 + band - 0.05, x1 - band + 0.05, z1 - band + 0.05, top - 0.003, colour);
      // The band's underside, as four strips.
      down(p, x0, z0, x1, z0 + band, bottom, pop);
      down(p, x0, z1 - band, x1, z1, bottom, pop);
      down(p, x0, z0 + band, x0 + band, z1 - band, bottom, pop);
      down(p, x1 - band, z0 + band, x1, z1 - band, bottom, pop);
      // The fascia up to the lip, facing the middle, and the lip itself.
      const ix0 = x0 + band,
        iz0 = z0 + band,
        ix1 = x1 - band,
        iz1 = z1 - band;
      const lip = top - LIP;
      upright(p, ix0, iz0, ix1, iz0, bottom, lip, [0, 0, 1], shade);
      upright(p, ix1, iz1, ix0, iz1, bottom, lip, [0, 0, -1], shade);
      upright(p, ix0, iz1, ix0, iz0, bottom, lip, [1, 0, 0], shade);
      upright(p, ix1, iz0, ix1, iz1, bottom, lip, [-1, 0, 0], shade);
      // The lip projects a little into the middle, hiding the strip.
      const l = 0.055;
      down(p, ix0, iz0, ix1, iz0 + l, lip, shade);
      down(p, ix0, iz1 - l, ix1, iz1, lip, shade);
      down(p, ix0, iz0 + l, ix0 + l, iz1 - l, lip, shade);
      down(p, ix1 - l, iz0 + l, ix1, iz1 - l, lip, shade);
      upright(p, ix0 + l, iz0 + l, ix1 - l, iz0 + l, lip, lip + 0.03, [0, 0, 1], pop);
      upright(p, ix1 - l, iz1 - l, ix0 + l, iz1 - l, lip, lip + 0.03, [0, 0, -1], pop);
      upright(p, ix0 + l, iz1 - l, ix0 + l, iz0 + l, lip, lip + 0.03, [1, 0, 0], pop);
      upright(p, ix1 - l, iz0 + l, ix1 - l, iz1 - l, lip, lip + 0.03, [-1, 0, 0], pop);
      // The glow the LED strip throws up on the middle: warm at the edge, fading inwards.
      const g = buckets.get("glow");
      const warm = rgb(COVE_COLOUR);
      const reach = Math.min(0.5, (Math.min(ix1 - ix0, iz1 - iz0) - 0.4) / 2);
      const y = top - 0.006;
      const strip = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) =>
        g.quadColors([ax, y, az], [bx, y, bz], [cx, y, cz], [dx, y, dz], [warm, warm, [0, 0, 0], [0, 0, 0]]);
      if (reach > 0.1) {
        strip(ix1, iz0, ix0, iz0, ix0 + reach, iz0 + reach, ix1 - reach, iz0 + reach);
        strip(ix0, iz1, ix1, iz1, ix1 - reach, iz1 - reach, ix0 + reach, iz1 - reach);
        strip(ix0, iz0, ix0, iz1, ix0 + reach, iz1 - reach, ix0 + reach, iz0 + reach);
        strip(ix1, iz1, ix1, iz0, ix1 - reach, iz0 + reach, ix1 - reach, iz1 - reach);
      }
      // A ceiling rose in the middle, for the fan, pendant or chandelier.
      disc(p, [(x0 + x1) / 2, top - 0.008, (z0 + z1) / 2], 0.14, scaleRgb(pop, 1.02), 20);
    }
    // Crown moulding where the walls meet the ceiling: a small 45° cove all round.
    const c = 0.05;
    const y0 = fc.bottom;
    const crown = mixRgb(pop, [1, 1, 1], 0.2);
    const { x0, z0, x1, z1 } = fc;
    p.quadFacing([x0, y0 - c, z0], [x1, y0 - c, z0], [x1, y0, z0 + c], [x0, y0, z0 + c], [0, -0.7, 0.7], crown);
    p.quadFacing([x1, y0 - c, z1], [x0, y0 - c, z1], [x0, y0, z1 - c], [x1, y0, z1 - c], [0, -0.7, -0.7], crown);
    p.quadFacing([x0, y0 - c, z1], [x0, y0 - c, z0], [x0 + c, y0, z0], [x0 + c, y0, z1], [0.7, -0.7, 0], crown);
    p.quadFacing([x1, y0 - c, z0], [x1, y0 - c, z1], [x1 - c, y0, z1], [x1 - c, y0, z0], [-0.7, -0.7, 0], crown);
    // Downlights: a white trim ring in the plaster, and the lit lens in the glow.
    for (const d of fc.downlights) {
      disc(p, [d[0], d[1] - 0.001, d[2]], DOWNLIGHT_R + 0.015, rgb("#f7f5f0"));
      disc(buckets.get("glow"), [d[0], d[1] - 0.002, d[2]], DOWNLIGHT_R, rgb("#fff1dc"), 12);
    }
  }
  return buckets;
}
