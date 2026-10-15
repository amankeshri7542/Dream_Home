// Wall shell builder. Each wall piece (domain `wallPieces`, any number of
// openings) becomes a closed box; junction rules keep boxes touching but never
// overlapping, and hidden-face removal leaves one closed shell per floor. Long
// faces are `facade` when their outward sample is outside the building, else
// `paint` coloured by the room on that side.
import { inside } from "../../../domain/geometry";
import { roomWallPaint, WALL_PAINTS } from "../../../domain/materials";
import { wallPieces, type WallPiece } from "../../../domain/walls";
import type { GeometryFloor, Rect, Wall } from "../../../domain/types";
import { FLOOR_SURFACE, GROUND_TOP, SLAB_TOP } from "../../coords";
import { junctionAdjustments, wallThickness } from "./junctions";
import { visibleFaces, type FaceRect, type SoupBox, type SoupFace } from "./boxSoup";
import { rgb, type Buckets, type RGB, type V3 } from "./QuadBuilder";

export type BucketKey =
  | "facade"
  | "paint"
  | "joinery"
  | "glass"
  | "slab"
  | "stone"
  | "ao"
  | "hit"
  | "openingHit";

export const DEFAULT_PAINT = WALL_PAINTS["warm-white"].color;
export const JOINERY_WHITE = "#f1ece3";
export const CEILING_WHITE = "#f4f0e8";

/** Where a plan point (cm) is: outside the building, or in which room. */
export function classifyPoint(floor: GeometryFloor, x: number, z: number) {
  const f = floor.footprint;
  const inFootprint = x > f.x && x < f.x + f.w && z > f.z && z < f.z + f.d;
  if (!inFootprint) return { outside: true, roomId: null as string | null };
  if (floor.voids.some((v) => v.kind === "courtyard" && inside(v.bounds, x, z)))
    return { outside: true, roomId: null };
  const room = floor.rooms.find((r) => inside(r.bounds, x, z));
  return { outside: false, roomId: room?.id ?? null };
}

export function roomPaint(floor: GeometryFloor, roomId: string | null): string {
  const room = roomId ? floor.rooms.find((r) => r.id === roomId) : undefined;
  return room ? WALL_PAINTS[roomWallPaint(room)].color : DEFAULT_PAINT;
}

/** Domain wall pieces (cm) for a wall at a given height — exposed for tests. */
export function wallPieceIntervals(wall: Pick<Wall, "length" | "openings">, heightCm: number): WallPiece[] {
  return wallPieces(wall, heightCm);
}

type PieceData = { kind: "wall"; wall: Wall } | { kind: "lining"; color: RGB };
export type ClassifiedFace = {
  face: SoupFace<PieceData>;
  rect: FaceRect;
  bucket: "facade" | "paint" | "joinery";
  color: RGB;
  /** For vertical wall faces: the room on that side (null = outside/none). */
  roomId: string | null;
  outside: boolean;
};

export type WallContext = {
  floor: GeometryFloor;
  /** Floor base y (m). */
  base: number;
  /** Floor height (m). */
  height: number;
  ground: boolean;
  openings: boolean;
  trim: string;
  frontDoor: string;
  /** Stone used for exterior sills, lintels and the plinth band. */
  stone: string;
  aoStrips: boolean;
  /** Exterior-only views keep doors shut (no empty shell behind them). */
  doorsClosed?: boolean;
  /** Projecting concrete sunshades over exterior windows and doors. */
  chhajja?: boolean;
  /** Two-tone accent band at the floor line (upper floors). */
  band?: string | null;
  /** The porch door already has a canopy: no chhajja there. */
  entranceId?: string | null;
};

export const CHHAJJA_DEPTH = 0.5;
export const CHHAJJA_COLOR = "#ebe6dc";

export type LeafStyle = "panel" | "flush" | "glazed" | "divided";
export type LeafInstance = {
  openingId: string;
  style: LeafStyle;
  /** Hinge-bottom pivot in plot-local metres. */
  pivot: V3;
  yaw: number;
  width: number;
  height: number;
  color: string;
  /** Sliding panels have no handle lever. */
  handle: boolean;
};

const toV3 = (axis: "x" | "z", along: number, y: number, across: number): V3 =>
  axis === "x" ? [along, y, across] : [across, y, along];
function localBox(axis: "x" | "z", a0: number, a1: number, y0: number, y1: number, n0: number, n1: number) {
  const lo = toV3(axis, Math.min(a0, a1), Math.min(y0, y1), Math.min(n0, n1));
  const hi = toV3(axis, Math.max(a0, a1), Math.max(y0, y1), Math.max(n0, n1));
  return { min: lo, max: hi };
}

const lineOf = (w: Wall) => (w.axis === "x" ? w.z : w.x);
const startOf = (w: Wall) => (w.axis === "x" ? w.x : w.z);

/** Build the pure shell description (boxes → classified visible faces). */
export function wallShell(ctx: WallContext, walls: readonly Wall[]) {
  const { floor } = ctx;
  const y0 = ctx.base + SLAB_TOP;
  const top = ctx.base + ctx.height;
  const heightCm = Math.round((top - y0) * 100 * 10) / 10;
  const adjust = junctionAdjustments(walls);
  const boxes: SoupBox<PieceData>[] = [];
  for (const wall of walls) {
    const t = wallThickness(wall);
    const line = lineOf(wall) / 100;
    const s = startOf(wall) / 100,
      e = s + wall.length / 100;
    const adj = adjust.get(wall.id) ?? { start: 0, end: 0 };
    for (const piece of wallPieces(wall, heightCm)) {
      const a0 = piece.start <= 0 ? s - adj.start : s + piece.start / 100;
      const a1 = piece.start + piece.length >= wall.length ? e + adj.end : s + (piece.start + piece.length) / 100;
      if (a1 - a0 <= 0.005) continue;
      const box = localBox(
        wall.axis,
        a0,
        a1,
        y0 + piece.bottom / 100,
        y0 + (piece.bottom + piece.height) / 100,
        line - t / 2,
        line + t / 2,
      );
      boxes.push({ ...box, data: { kind: "wall", wall } });
    }
    if (!ctx.openings) continue;
    // Reveal linings (jambs + head) join the shell so sections stay closed.
    const lining = rgb(wall.exterior ? ctx.trim : JOINERY_WHITE);
    for (const o of wall.openings) {
      if (o.kind === "archway") continue;
      const range = openingRange(o, s, e);
      if (!range) continue;
      const ys = y0 + Math.min(o.sill, heightCm) / 100,
        yt = y0 + Math.min(o.sill + o.height, heightCm) / 100;
      const headInWall = yt < top - 0.01;
      const jamb0 = o.sill > 0 ? ys + 0.0 : y0;
      const jambTop = headInWall ? yt - 0.02 : yt;
      for (const [b0, b1] of [
        [range[0], range[0] + 0.02],
        [range[1] - 0.02, range[1]],
      ])
        boxes.push({
          ...localBox(wall.axis, b0, b1, jamb0, jambTop, line - t / 2, line + t / 2),
          data: { kind: "lining", color: lining },
        });
      if (headInWall)
        boxes.push({
          ...localBox(wall.axis, range[0], range[1], yt - 0.02, yt, line - t / 2, line + t / 2),
          data: { kind: "lining", color: lining },
        });
    }
  }
  const faces = visibleFaces(boxes);
  const ceiling = rgb(CEILING_WHITE);
  const classified: ClassifiedFace[] = [];
  for (const face of faces) {
    for (const rect of face.rects) {
      if (face.box.data.kind === "lining") {
        classified.push({ face, rect, bucket: "joinery", color: face.box.data.color, roomId: null, outside: false });
        continue;
      }
      if (face.axis === 1) {
        classified.push({ face, rect, bucket: "paint", color: ceiling, roomId: null, outside: false });
        continue;
      }
      // Sample 2 cm beyond the face centre, in plan centimetres.
      const ua = (face.axis + 1) % 3,
        va = (face.axis + 2) % 3;
      const p: V3 = [0, 0, 0];
      p[face.axis] = face.plane + face.side * 0.02;
      p[ua] = (rect.u0 + rect.u1) / 2;
      p[va] = (rect.v0 + rect.v1) / 2;
      const where = classifyPoint(floor, p[0] * 100, p[2] * 100);
      if (where.outside)
        classified.push({ face, rect, bucket: "facade", color: [1, 1, 1], roomId: null, outside: true });
      else
        classified.push({
          face,
          rect,
          bucket: "paint",
          color: rgb(roomPaint(floor, where.roomId)),
          roomId: where.roomId,
          outside: false,
        });
    }
  }
  return { faces: classified, y0, top, heightCm };
}

function openingRange(o: Wall["openings"][number], s: number, e: number): [number, number] | null {
  const c = s + o.offset / 100,
    half = o.width / 200;
  const o0 = Math.max(s, c - half),
    o1 = Math.min(e, c + half);
  return o1 - o0 > 0.1 ? [o0, o1] : null;
}

/** Vertical extent and along-range of a vertical face rect. */
function verticalRect(face: SoupFace, rect: FaceRect) {
  // axis 0 (x-normal): u = y, v = z.  axis 2 (z-normal): u = x, v = y.
  return face.axis === 0
    ? { y0: rect.u0, y1: rect.u1, a0: rect.v0, a1: rect.v1, alongAxis: 2 as const }
    : { y0: rect.v0, y1: rect.v1, a0: rect.u0, a1: rect.u1, alongAxis: 0 as const };
}

/** Emit the shell plus skirting, plinth band and fake-AO strips into buckets. */
export function emitShell(
  ctx: WallContext,
  shell: ReturnType<typeof wallShell>,
  buckets: Buckets<string>,
) {
  const { y0 } = shell;
  const yf = ctx.base + FLOOR_SURFACE;
  const skirtColor = rgb(JOINERY_WHITE);
  const stone = rgb(ctx.stone);
  for (const cf of shell.faces) {
    const { face, rect } = cf;
    const b = buckets.get(cf.bucket);
    b.axisFace(face.axis, face.side, face.plane, rect.u0, rect.u1, rect.v0, rect.v1, cf.color);
    if (face.axis === 1 || face.box.data.kind !== "wall") continue;
    const v = verticalRect(face, rect);
    if (Math.abs(v.y0 - y0) > 0.002) continue;
    const normalAxis = face.axis;
    const make = (along0: number, along1: number, yy0: number, yy1: number, n0: number, n1: number) => {
      const min: V3 = [0, 0, 0],
        max: V3 = [0, 0, 0];
      min[v.alongAxis] = Math.min(along0, along1);
      max[v.alongAxis] = Math.max(along0, along1);
      min[1] = yy0;
      max[1] = yy1;
      min[normalAxis] = Math.min(n0, n1);
      max[normalAxis] = Math.max(n0, n1);
      return [min, max] as const;
    };
    if (cf.bucket === "paint") {
      // Skirting: 8 cm × 1.5 cm proud, joinery colour.
      const [mn, mx] = make(v.a0, v.a1, y0, yf + 0.08, face.plane, face.plane + face.side * 0.015);
      buckets.get("joinery").box(mn, mx, skirtColor);
      if (ctx.aoStrips) aoStrip(buckets, face, v, yf + 0.0015, 0.26, 0.015);
    } else if (cf.bucket === "facade" && ctx.ground) {
      const [mn, mx] = make(v.a0 - 0.02, v.a1 + 0.02, 0, y0 + 0.3, face.plane, face.plane + face.side * 0.02);
      buckets.get("stone").box(mn, mx, stone);
      if (ctx.aoStrips) aoStrip(buckets, face, v, GROUND_TOP + 0.003, 0.7, 0.02);
    } else if (cf.bucket === "facade" && ctx.band) {
      // Two-tone: an accent band where the slab meets the wall.
      const [mn, mx] = make(v.a0 - 0.025, v.a1 + 0.025, y0 - 0.2, y0 + 0.1, face.plane, face.plane + face.side * 0.025);
      buckets.get("stone").box(mn, mx, rgb(ctx.band));
    }
  }
}

/** A floor-level gradient quad hugging a wall face (uv.y 0 at the wall). */
function aoStrip(
  buckets: Buckets<string>,
  face: SoupFace,
  v: ReturnType<typeof verticalRect>,
  y: number,
  width: number,
  offset: number,
) {
  const n0 = face.plane + face.side * offset,
    n1 = n0 + face.side * width;
  const P = (along: number, n: number): V3 => {
    const p: V3 = [0, y, 0];
    p[v.alongAxis] = along;
    p[face.axis] = n;
    return p;
  };
  const a = P(v.a0, n0),
    b = P(v.a1, n0),
    c = P(v.a1, n1),
    d = P(v.a0, n1);
  const len = v.a1 - v.a0;
  buckets.get("ao").quadFacing(a, b, c, d, [0, 1, 0], [1, 1, 1], [[0, 0], [len, 0], [len, 1], [0, 1]]);
}

/** Side of a wall: +1 (+z/+x) or −1. */
type Side = 1 | -1;
function sideInfo(ctx: WallContext, wall: Wall, along: number, side: Side) {
  const t = wallThickness(wall);
  const across = lineOf(wall) / 100 + side * (t / 2 + 0.03);
  const [x, z] = wall.axis === "x" ? [along, across] : [across, along];
  const where = classifyPoint(ctx.floor, x * 100, z * 100);
  return { ...where, color: where.outside ? null : roomPaint(ctx.floor, where.roomId) };
}

/**
 * Frames, linings, sills, lintels, glass, thresholds and arch spandrels for every
 * opening; returns door leaf instances (rendered instanced per style).
 */
export function emitOpenings(
  ctx: WallContext,
  walls: readonly Wall[],
  shell: ReturnType<typeof wallShell>,
  buckets: Buckets<string>,
): LeafInstance[] {
  const leaves: LeafInstance[] = [];
  if (!ctx.openings) return leaves;
  const { y0, top, heightCm } = shell;
  const yf = ctx.base + FLOOR_SURFACE;
  const joinery = buckets.get("joinery");
  const white = rgb(JOINERY_WHITE);
  const trim = rgb(ctx.trim);
  const stone = rgb(ctx.stone);
  for (const wall of walls) {
    const t = wallThickness(wall);
    const line = lineOf(wall) / 100;
    const s = startOf(wall) / 100,
      e = s + wall.length / 100;
    const B = (a0: number, a1: number, yy0: number, yy1: number, n0: number, n1: number) =>
      localBox(wall.axis, a0, a1, yy0, yy1, n0, n1);
    for (const o of wall.openings) {
      const range = openingRange(o, s, e);
      if (!range) continue;
      const [o0, o1] = range;
      const mid = (o0 + o1) / 2;
      const ys = y0 + Math.min(o.sill, heightCm) / 100,
        yt = y0 + Math.min(o.sill + o.height, heightCm) / 100;
      const headInWall = yt < top - 0.01;
      const plus = sideInfo(ctx, wall, mid, 1),
        minus = sideInfo(ctx, wall, mid, -1);
      const exterior = plus.outside !== minus.outside;
      const outSide: Side = plus.outside ? 1 : -1;
      const faceAt = (side: Side) => line + side * (t / 2);
      // Hit volume for picking openings.
      const hit = buckets.get("openingHit");
      hit.setOwner(`opening:${o.id}`);
      const hb = B(o0 - 0.05, o1 + 0.05, o.sill > 0 ? ys - 0.05 : y0, yt + 0.05, line - t / 2 - 0.06, line + t / 2 + 0.06);
      hit.box(hb.min, hb.max);
      hit.setOwner(null);

      if (o.kind === "archway") {
        emitArch(buckets, wall, ctx, o0, o1, y0, yt, line, t, plus.color, minus.color);
        continue;
      }
      const isWin = o.kind === "window" || o.kind === "picture-window";
      // Architraves on room sides (and on the outside for doors).
      for (const side of [1, -1] as Side[]) {
        const info = side === 1 ? plus : minus;
        const outsideFace = info.outside;
        if (outsideFace && isWin) continue;
        const color = outsideFace ? trim : white;
        const f = faceAt(side),
          n1 = f + side * 0.02;
        const bottom = isWin ? ys + 0.03 : y0;
        const headTop = Math.min(yt + 0.07, top - 0.005);
        for (const [a0, a1] of [
          [o0 - 0.07, o0],
          [o1, o1 + 0.07],
        ]) {
          const bx = B(a0, a1, bottom, headTop, f, n1);
          joinery.box(bx.min, bx.max, color);
        }
        if (headInWall && yt + 0.02 < top) {
          const bx = B(o0 - 0.07, o1 + 0.07, yt, headTop, f, n1);
          joinery.box(bx.min, bx.max, color);
        }
        if (isWin && o.sill > 0) {
          // Sill board + apron on the room side.
          const board = B(o0 - 0.035, o1 + 0.035, ys, ys + 0.03, line, f + side * 0.035);
          joinery.box(board.min, board.max, white);
          const apron = B(o0 - 0.02, o1 + 0.02, ys - 0.08, ys, f, f + side * 0.015);
          joinery.box(apron.min, apron.max, white);
        }
      }
      if (exterior && headInWall && yt + 0.16 < top) {
        const lintel = B(o0 - 0.08, o1 + 0.08, yt, yt + 0.14, faceAt(outSide), faceAt(outSide) + outSide * 0.015);
        buckets.get("stone").box(lintel.min, lintel.max, stone);
      }
      if (ctx.chhajja && exterior && headInWall && o.id !== ctx.entranceId) emitChhajja(buckets, B, o0, o1, yt, top, faceAt(outSide), outSide);
      if (isWin) {
        emitWindow(buckets, wall, ctx, o, o0, o1, ys, yt, line, t, exterior ? outSide : 0, exterior ? trim : white, stone, top);
        continue;
      }
      // Doors: threshold on exterior doors.
      if (exterior) {
        const th = B(o0, o1, y0 - 0.01, yf + 0.008, line, faceAt(outSide) + outSide * 0.03);
        buckets.get("stone").box(th.min, th.max, stone);
      }
      const a0 = o0 + 0.02 + 0.003,
        a1 = o1 - 0.02 - 0.003;
      const leafBottom = yf + 0.006;
      const leafTop = (headInWall ? yt - 0.02 : yt) - 0.004;
      const leafH = leafTop - leafBottom;
      if (leafH <= 0.2) continue;
      // Default swing: into the room (or inward for exterior doors).
      const swing: Side = o.swing ?? defaultSwing(ctx.floor, plus, minus);
      if (o.kind === "sliding-door") {
        const pw = (a1 - a0) / 2 + 0.03;
        const track = B(o0, o1, (headInWall ? yt - 0.02 : yt) - 0.035, headInWall ? yt - 0.02 : yt, line - 0.06, line + 0.06);
        joinery.box(track.min, track.max, exterior ? trim : white);
        const yaw = baseYaw(wall.axis, 1);
        const fixed = toV3(wall.axis, a0, leafBottom, line + 0.025);
        const slid = toV3(wall.axis, a1 - pw - pw * 0.6, leafBottom, line - 0.025);
        for (const pivot of [fixed, slid])
          leaves.push({ openingId: o.id, style: "glazed", pivot, yaw, width: pw, height: leafH - 0.035, color: exterior ? ctx.trim : JOINERY_WHITE, handle: false });
        continue;
      }
      const french = o.kind === "french-door";
      const style: LeafStyle =
        french
          ? o.style === "glazed" || o.style === "panel" ? "glazed" : "divided"
          : o.style === "glazed"
            ? "glazed"
            : o.style === "divided"
              ? "divided"
              : o.style === "flush" || o.style === "plain"
                ? "flush"
                : "panel";
      const leafColor = !exterior
        ? JOINERY_WHITE
        : style === "panel" || style === "flush"
          ? ctx.frontDoor
          : ctx.trim;
      const hinges: { at: "start" | "end"; width: number }[] = french
        ? [
            { at: "start", width: (a1 - a0) / 2 - 0.002 },
            { at: "end", width: (a1 - a0) / 2 - 0.002 },
          ]
        : [{ at: o.hinge ?? "start", width: a1 - a0 }];
      for (const h of hinges) {
        const dir = h.at === "start" ? 1 : -1;
        const along = h.at === "start" ? a0 : a1;
        const across = line + swing * (t / 2 - 0.02);
        const yaw = ctx.doorsClosed ? baseYaw(wall.axis, dir) : leafYaw(wall.axis, dir, swing);
        leaves.push({
          openingId: o.id,
          style,
          pivot: toV3(wall.axis, along, leafBottom, across),
          yaw,
          width: h.width,
          height: leafH,
          color: leafColor,
          handle: true,
        });
      }
    }
  }
  return leaves;
}

/**
 * Chhajja: a 50 cm concrete sunshade just above the lintel, with a thicker
 * drip edge, sloping slightly away from the wall.
 */
function emitChhajja(
  buckets: Buckets<string>,
  B: (a0: number, a1: number, y0: number, y1: number, n0: number, n1: number) => { min: V3; max: V3 },
  o0: number,
  o1: number,
  yt: number,
  top: number,
  face: number,
  out: Side,
) {
  const y = Math.min(yt + 0.16, top - 0.14);
  if (y < yt + 0.02) return;
  const color = rgb(CHHAJJA_COLOR);
  const shade = rgb("#d9d3c7");
  const stone = buckets.get("stone");
  const slab = B(o0 - 0.22, o1 + 0.22, y, y + 0.07, face, face + out * CHHAJJA_DEPTH);
  stone.box(slab.min, slab.max, color);
  const lip = B(o0 - 0.22, o1 + 0.22, y - 0.04, y + 0.075, face + out * (CHHAJJA_DEPTH - 0.04), face + out * CHHAJJA_DEPTH);
  stone.box(lip.min, lip.max, shade);
}

function defaultSwing(
  floor: GeometryFloor,
  plus: ReturnType<typeof sideInfo>,
  minus: ReturnType<typeof sideInfo>,
): Side {
  if (plus.outside && !minus.outside) return -1;
  if (minus.outside && !plus.outside) return 1;
  if (plus.roomId && !minus.roomId) return 1;
  if (minus.roomId && !plus.roomId) return -1;
  // Both sides are rooms: open into the smaller (more private) room.
  const area = (id: string | null) => {
    const r: Rect | undefined = floor.rooms.find((room) => room.id === id)?.bounds;
    return r ? r.w * r.d : Infinity;
  };
  return area(plus.roomId) <= area(minus.roomId) ? 1 : -1;
}

/** Yaw that maps leaf-local +x to the wall's along direction (dir ±1). */
export function baseYaw(axis: "x" | "z", dir: 1 | -1) {
  if (axis === "x") return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}
const OPEN_ANGLE = (70 * Math.PI) / 180;
/** Leaf yaw opened ~70° so its free end moves toward the swing side. */
export function leafYaw(axis: "x" | "z", dir: 1 | -1, swing: Side) {
  const b = baseYaw(axis, dir);
  const normal: [number, number] = axis === "x" ? [0, swing] : [swing, 0];
  for (const phi of [OPEN_ANGLE, -OPEN_ANGLE]) {
    const yaw = b + phi;
    // R_y(yaw)·(1,0,0) = (cos, 0, −sin)
    const d: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    if (d[0] * normal[0] + d[1] * normal[1] > 0) return yaw;
  }
  return b;
}

function emitWindow(
  buckets: Buckets<string>,
  wall: Wall,
  _ctx: WallContext,
  o: Wall["openings"][number],
  o0: number,
  o1: number,
  ys: number,
  yt: number,
  line: number,
  t: number,
  outSide: 0 | Side,
  frameColor: RGB,
  stone: RGB,
  top: number,
) {
  const B = (a0: number, a1: number, yy0: number, yy1: number, n0: number, n1: number) =>
    localBox(wall.axis, a0, a1, yy0, yy1, n0, n1);
  const joinery = buckets.get("joinery");
  const picture = o.kind === "picture-window";
  const fw = picture ? 0.045 : 0.06;
  // Frame plane: outer third on exterior walls, centred otherwise.
  const c = outSide ? line + outSide * (t / 2 - 0.07) : line;
  const n0 = c - 0.035,
    n1 = c + 0.035;
  const a0 = o0 + 0.02,
    a1 = o1 - 0.02;
  const b0 = o.sill > 0 ? ys + 0.03 : ys + 0.01;
  const b1 = yt < top - 0.01 ? yt - 0.02 : yt;
  if (a1 - a0 < 0.15 || b1 - b0 < 0.15) return;
  const box = (bx: { min: V3; max: V3 }, color = frameColor) => joinery.box(bx.min, bx.max, color);
  box(B(a0, a0 + fw, b0, b1, n0, n1));
  box(B(a1 - fw, a1, b0, b1, n0, n1));
  box(B(a0 + fw, a1 - fw, b0, b0 + fw, n0, n1));
  box(B(a0 + fw, a1 - fw, b1 - fw, b1, n0, n1));
  if (!picture && a1 - a0 > 1.0) {
    const m = (a0 + a1) / 2;
    box(B(m - 0.025, m + 0.025, b0 + fw, b1 - fw, n0 + 0.005, n1 - 0.005));
  }
  if (!picture && b1 - b0 > 1.2) {
    const ty = b1 - (b1 - b0) * 0.28;
    box(B(a0 + fw, a1 - fw, ty - 0.02, ty + 0.02, n0 + 0.005, n1 - 0.005));
  }
  // Glass pane (double-sided material) in the frame plane.
  const g = buckets.get("glass");
  const P = (al: number, y: number): V3 => toV3(wall.axis, al, y, c);
  g.quad(P(a0 + fw, b0 + fw), P(a1 - fw, b0 + fw), P(a1 - fw, b1 - fw), P(a0 + fw, b1 - fw));
  if (outSide && o.sill > 0) {
    // Projecting stone sill outside, with a small drip lip.
    const face = line + outSide * (t / 2);
    const sill = B(o0 - 0.05, o1 + 0.05, ys - 0.05, ys + 0.03, c + outSide * 0.035, face + outSide * 0.05);
    joinery.box(sill.min, sill.max, stone);
  }
}

function emitArch(
  buckets: Buckets<string>,
  wall: Wall,
  _ctx: WallContext,
  o0: number,
  o1: number,
  y0: number,
  yt: number,
  line: number,
  t: number,
  plusColor: string | null,
  minusColor: string | null,
) {
  const R = (o1 - o0) / 2;
  if (yt - y0 < R + 0.6) return;
  const cx = (o0 + o1) / 2,
    spring = yt - R;
  const segs = 14;
  const arc: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI;
    arc.push([cx + Math.cos(a) * R, spring + Math.sin(a) * R]);
  }
  for (const side of [1, -1] as Side[]) {
    const colorHex = side === 1 ? plusColor : minusColor;
    const bucket = buckets.get(colorHex ? "paint" : "facade");
    const color = colorHex ? rgb(colorHex) : ([1, 1, 1] as RGB);
    const n = line + side * (t / 2);
    const normal: V3 = wall.axis === "x" ? [0, 0, side] : [side, 0, 0];
    const P = (al: number, y: number): V3 => toV3(wall.axis, al, y, n);
    for (let i = 0; i < segs; i++) {
      const corner = i < segs / 2 ? P(o0, yt) : P(o1, yt);
      bucket.triFacing(corner, P(arc[i][0], arc[i][1]), P(arc[i + 1][0], arc[i + 1][1]), normal, color);
    }
  }
  // Intrados (curved soffit) facing the arch centre.
  const color = rgb(plusColor ?? minusColor ?? DEFAULT_PAINT);
  const paint = buckets.get("paint");
  for (let i = 0; i < segs; i++) {
    const [x0, ya] = arc[i],
      [x1, yb] = arc[i + 1];
    const mx = (x0 + x1) / 2 - cx,
      my = (ya + yb) / 2 - spring;
    const l = Math.hypot(mx, my) || 1;
    const nAlong = -mx / l,
      nY = -my / l;
    const normal: V3 = wall.axis === "x" ? [nAlong, nY, 0] : [0, nY, nAlong];
    const a = toV3(wall.axis, x0, ya, line - t / 2),
      b = toV3(wall.axis, x1, yb, line - t / 2),
      c = toV3(wall.axis, x1, yb, line + t / 2),
      d = toV3(wall.axis, x0, ya, line + t / 2);
    paint.quadFacing(a, b, c, d, normal, color);
  }
}
