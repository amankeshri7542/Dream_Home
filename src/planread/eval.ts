// How good is a plan reading? Pure scoring for `npm run planeval`, never part
// of the app. A home built from a reading is compared with the truth: the same
// plan drawn by hand with "Draw it yourself" (or, for synthetic sheets, the
// home the sheet was drawn from). Rooms are matched by overlap, measured from
// each footprint's corner, so where the house sits on its plot doesn't count
// as an error.
import { floorForGeometry } from "../domain/core";
import { deriveWalls, isWindow, wallStart } from "../domain/walls";
import type { Floor, Project, Rect, Room } from "../domain/types";
import type { PlanReading, ReadingKind } from "./reading";

/** A room counts as found when it overlaps the true room this much (intersection over union). */
export const MATCH_IOU = 0.5;
/** A found room needs moving or resizing when any edge is further out than this. */
export const MISPLACED_CM = 30;
/** Doors and windows on the same wall line (±) and within this distance along it are the same one. */
const OPENING_LINE_CM = 40;
const OPENING_ALONG_CM = 60;

/** Starting targets from docs/COMPETITIVE-V6.md (P2.2), to compare the baseline with. */
export const TARGETS = { roomRecall: 0.95, medianEdgeCm: 15, doorRecall: 0.8, within3Fixes: 0.8 } as const;

const POOJA = /pooja|puja|mandir|prayer/i;
/** What a room is for, as a homeowner would check it: a pooja room isn't just "utility". */
const roomType = (r: Room) => (POOJA.test(r.name) ? "pooja" : r.kind);

const iou = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    d = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
  if (w <= 0 || d <= 0) return 0;
  const both = w * d;
  return both / (a.w * a.d + b.w * b.d - both);
};
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const ratio = (part: number, whole: number) => (whole ? part / whole : 1);

const fromCorner = (b: Rect, fp: Rect): Rect => ({ x: b.x - fp.x, z: b.z - fp.z, w: b.w, d: b.d });
const byHeight = (p: Project) => [...p.floors].sort((a, b) => a.elevation - b.elevation);

type Opening = { axis: "x" | "z"; line: number; center: number; window: boolean };
/** Every door and window on a floor (automatic ones too), measured from the footprint's corner. */
function floorOpenings(project: Project, floor: Floor): Opening[] {
  const fp = floor.footprint;
  return deriveWalls(floorForGeometry(project, floor.id), project.plot.road).flatMap((w) =>
    w.openings.map((o) => ({
      axis: w.axis,
      line: w.axis === "x" ? w.z - fp.z : w.x - fp.x,
      center: wallStart(w) + o.offset - (w.axis === "x" ? fp.x : fp.z),
      window: isWindow(o.kind),
    })),
  );
}
/** How many of `truth` have their own match in `got`. */
function matchedOpenings(truth: Opening[], got: Opening[]) {
  const free = [...got];
  let matched = 0;
  for (const t of truth) {
    const i = free.findIndex(
      (g) => g.axis === t.axis && Math.abs(g.line - t.line) <= OPENING_LINE_CM && Math.abs(g.center - t.center) <= OPENING_ALONG_CM,
    );
    if (i >= 0) {
      free.splice(i, 1);
      matched++;
    }
  }
  return matched;
}

export type HomeScore = {
  /** True rooms found, of those on the floors the reading covers. */
  roomRecall: number;
  /** Rooms in the result that are really there. */
  roomPrecision: number;
  /** Found rooms given the right use. */
  typeAccuracy: number;
  meanIou: number;
  /** Median distance of a found room's edges from the truth. */
  medianEdgeCm: number;
  p90EdgeCm: number;
  /** The house's outer size, worst side. */
  footprintErrorCm: number;
  doorRecall: number;
  windowRecall: number;
  /** Balconies, parking, stairs and courtyards kept. */
  openRecall: number;
  /** Floors of the true home the result doesn't have. */
  floorsMissing: number;
  /** Corrections a homeowner would make on the check screen: rooms to add, remove, relabel or adjust. */
  fixes: number;
  missingRooms: string[];
  extraRooms: string[];
  wrongTypes: string[];
};

/** Compares a home with the truth (see the file comment). */
export function scoreHome(got: Project, truth: Project): HomeScore {
  const truthFloors = byHeight(truth),
    gotFloors = byHeight(got);
  const missingRooms: string[] = [],
    extraRooms: string[] = [],
    wrongTypes: string[] = [],
    edges: number[] = [],
    ious: number[] = [];
  let truthRooms = 0,
    gotRooms = 0,
    found = 0,
    rightType = 0,
    misplaced = 0,
    truthDoors = 0,
    truthWindows = 0,
    doorsFound = 0,
    windowsFound = 0,
    footprintErrorCm = 0;
  const floors = Math.min(truthFloors.length, gotFloors.length);
  for (let i = 0; i < floors; i++) {
    const t = truthFloors[i],
      g = gotFloors[i];
    footprintErrorCm = Math.max(footprintErrorCm, Math.abs(t.footprint.w - g.footprint.w), Math.abs(t.footprint.d - g.footprint.d));
    truthRooms += t.rooms.length;
    gotRooms += g.rooms.length;
    // The best overlaps pair up first, each room used once.
    const pairs = t.rooms
      .flatMap((a) => g.rooms.map((b) => ({ a, b, score: iou(fromCorner(a.bounds, t.footprint), fromCorner(b.bounds, g.footprint)) })))
      .filter((p) => p.score >= MATCH_IOU)
      .sort((p, q) => q.score - p.score);
    const usedT = new Set<string>(),
      usedG = new Set<string>();
    for (const { a, b, score } of pairs) {
      if (usedT.has(a.id) || usedG.has(b.id)) continue;
      usedT.add(a.id);
      usedG.add(b.id);
      found++;
      ious.push(score);
      if (roomType(a) === roomType(b)) rightType++;
      else wrongTypes.push(`${a.name} read as ${b.name}`);
      const A = fromCorner(a.bounds, t.footprint),
        B = fromCorner(b.bounds, g.footprint);
      const roomEdges = [Math.abs(A.x - B.x), Math.abs(A.z - B.z), Math.abs(A.x + A.w - B.x - B.w), Math.abs(A.z + A.d - B.z - B.d)];
      edges.push(...roomEdges);
      if (Math.max(...roomEdges) > MISPLACED_CM) misplaced++;
    }
    missingRooms.push(...t.rooms.filter((r) => !usedT.has(r.id)).map((r) => r.name));
    extraRooms.push(...g.rooms.filter((r) => !usedG.has(r.id)).map((r) => r.name));
    const tOpenings = floorOpenings(truth, t),
      gOpenings = floorOpenings(got, g);
    const doors = tOpenings.filter((o) => !o.window),
      windows = tOpenings.filter((o) => o.window);
    truthDoors += doors.length;
    truthWindows += windows.length;
    doorsFound += matchedOpenings(doors, gOpenings.filter((o) => !o.window));
    windowsFound += matchedOpenings(windows, gOpenings.filter((o) => o.window));
  }
  const count = (p: Project) => ({
    balconies: p.floors.reduce((n, f) => n + f.balconies.length, 0),
    parking: p.parking ? 1 : 0,
    stairs: p.verticalSpaces.filter((v) => v.kind === "stairs").length,
    courtyards: p.verticalSpaces.filter((v) => v.kind === "courtyard").length,
  });
  const want = count(truth),
    have = count(got);
  const openWanted = want.balconies + want.parking + want.stairs + want.courtyards;
  const openKept =
    Math.min(want.balconies, have.balconies) + Math.min(want.parking, have.parking) + Math.min(want.stairs, have.stairs) + Math.min(want.courtyards, have.courtyards);
  const sortedEdges = [...edges].sort((a, b) => a - b);
  return {
    roomRecall: ratio(found, truthRooms),
    roomPrecision: ratio(found, gotRooms),
    typeAccuracy: ratio(rightType, found),
    meanIou: ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : 0,
    medianEdgeCm: median(edges),
    p90EdgeCm: sortedEdges.length ? sortedEdges[Math.floor((sortedEdges.length - 1) * 0.9)] : 0,
    footprintErrorCm,
    doorRecall: ratio(doorsFound, truthDoors),
    windowRecall: ratio(windowsFound, truthWindows),
    openRecall: ratio(openKept, openWanted),
    floorsMissing: Math.max(0, truthFloors.length - gotFloors.length),
    fixes: missingRooms.length + extraRooms.length + wrongTypes.length + misplaced,
    missingRooms,
    extraRooms,
    wrongTypes,
  };
}

const READING_KIND: Record<Room["kind"], ReadingKind> = {
  living: "living",
  kitchen: "kitchen",
  bedroom: "bedroom",
  bathroom: "bathroom",
  dining: "dining",
  utility: "utility",
  shop: "utility",
};

/**
 * The reading a flawless reader would give of a home's ground floor. Running it
 * through `planFromReading` shows what the pipeline itself loses, at no cost:
 * no real reading can score better than this.
 */
export function perfectReading(home: Project): PlanReading {
  const floor = byHeight(home)[0];
  const fp = floor.footprint;
  const x = (v: number) => (v - fp.x) / fp.w,
    y = (v: number) => (v - fp.z) / fp.d;
  const walls = deriveWalls(floorForGeometry(home, floor.id), home.plot.road);
  return {
    units: "m",
    outline: { w: fp.w / 100, h: fp.d / 100 },
    outlineBox: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    rooms: floor.rooms.map((r) => ({
      label: r.name,
      kind: POOJA.test(r.name) ? "pooja" : READING_KIND[r.kind],
      x: x(r.bounds.x),
      y: y(r.bounds.z),
      w: r.bounds.w / fp.w,
      h: r.bounds.d / fp.d,
      confidence: 1,
    })),
    doors: walls.flatMap((w) =>
      w.openings
        .filter((o) => !isWindow(o.kind))
        .map((o) => {
          const along = wallStart(w) + o.offset;
          return w.axis === "x" ? { x: x(along), y: y(w.z), w: o.width / fp.w } : { x: x(w.x), y: y(along), w: o.width / fp.d };
        }),
    ),
    stairs: home.verticalSpaces
      .filter((v) => v.kind === "stairs" && v.floorIds.includes(floor.id))
      .map((v) => ({ x: x(v.bounds.x), y: y(v.bounds.z), w: v.bounds.w / fp.w, h: v.bounds.d / fp.d })),
    notes: "",
  };
}

/** The same reading, each room's edges off by up to `amount` of the house (deterministic for a seed). */
export function sloppyReading(reading: PlanReading, amount: number, seed = 1): PlanReading {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shift = () => (next() * 2 - 1) * amount;
  const inside = (v: number) => Math.min(1, Math.max(0, v));
  return {
    ...reading,
    rooms: reading.rooms.map((r) => {
      const x0 = inside(r.x + shift()),
        y0 = inside(r.y + shift()),
        x1 = inside(r.x + r.w + shift()),
        y1 = inside(r.y + r.h + shift());
      return { ...r, x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    }),
  };
}

export type Summary = {
  plans: number;
  roomRecall: number;
  roomPrecision: number;
  typeAccuracy: number;
  medianEdgeCm: number;
  doorRecall: number;
  windowRecall: number;
  openRecall: number;
  /** Share of plans a homeowner could finish in three corrections or fewer. */
  within3Fixes: number;
  floorsMissing: number;
  meetsTargets: { roomRecall: boolean; medianEdgeCm: boolean; doorRecall: boolean; within3Fixes: boolean };
};

/** Averages over plans; the edge error is the median of each plan's median. */
export function summarize(scores: HomeScore[]): Summary {
  const mean = (read: (s: HomeScore) => number) => (scores.length ? scores.reduce((n, s) => n + read(s), 0) / scores.length : 0);
  const roomRecall = mean((s) => s.roomRecall),
    medianEdgeCm = median(scores.map((s) => s.medianEdgeCm)),
    doorRecall = mean((s) => s.doorRecall),
    within3Fixes = mean((s) => (s.fixes <= 3 ? 1 : 0));
  return {
    plans: scores.length,
    roomRecall,
    roomPrecision: mean((s) => s.roomPrecision),
    typeAccuracy: mean((s) => s.typeAccuracy),
    medianEdgeCm,
    doorRecall,
    windowRecall: mean((s) => s.windowRecall),
    openRecall: mean((s) => s.openRecall),
    within3Fixes,
    floorsMissing: scores.reduce((n, s) => n + s.floorsMissing, 0),
    meetsTargets: {
      roomRecall: !!scores.length && roomRecall >= TARGETS.roomRecall,
      medianEdgeCm: !!scores.length && medianEdgeCm <= TARGETS.medianEdgeCm,
      doorRecall: !!scores.length && doorRecall >= TARGETS.doorRecall,
      within3Fixes: !!scores.length && within3Fixes >= TARGETS.within3Fixes,
    },
  };
}
