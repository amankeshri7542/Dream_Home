// Garden and site items: the catalog (catalog/landscape.json), the automatic
// garden (an exact port of the original scene's trees, entrance path, parking
// and courtyard trees), and the rules an explicit `Project.landscape` follows.
import landscapeJson from "./catalog/landscape.json" with { type: "json" };
import { balconyBounds, floorForGeometry, slabTiles } from "./core";
import { registerReconciler } from "./edit";
import {
  allocateId,
  componentIds,
  idCounts,
  overlaps,
  sameRect,
} from "./geometry";
import { makeIssue } from "./issues";
import { LIMITS } from "./limits";
import type {
  ComponentRef,
  EditIssue,
  LandscapeItem,
  Project,
  QuarterTurn,
  Rect,
} from "./types";
import { registerValidation } from "./validate";
import { deriveWalls, isWindow } from "./walls";

export type LandscapeLayer = "solid" | "ground";
export type LandscapeCatalogItem = {
  id: string;
  label: string;
  category: string;
  model?: string;
  procedural?: boolean;
  /** The validated ground footprint (trunk for trees). */
  footprint: { w: number; d: number };
  /** The model's visual bounding box. */
  size: { w: number; d: number; h: number };
  layer: LandscapeLayer;
  tall: boolean;
  rotatable: boolean;
  resizable?: { w: [number, number]; d: [number, number] };
  tile?: Record<string, string | number>;
  variants?: string[];
  slots: string[];
  triBudget?: number;
  light?: { y: number; color: string; intensity: number };
};
export type FenceStyle = {
  label: string;
  module?: string;
  color?: string;
  procedural?: boolean;
};
export const LANDSCAPE_CATALOG: readonly LandscapeCatalogItem[] =
  landscapeJson.items as unknown as LandscapeCatalogItem[];
export const LANDSCAPE_MODULES = landscapeJson.modules as ReadonlyArray<{
  id: string;
  label: string;
  size: { w: number; d: number; h: number };
  slots: string[];
  triBudget: number;
}>;
export const FENCE_STYLES = landscapeJson.fences as Record<string, FenceStyle>;
export const isFence = (id: unknown): id is string =>
  typeof id === "string" && id in FENCE_STYLES;
const CATALOG = new Map(LANDSCAPE_CATALOG.map((item) => [item.id, item]));
export const landscapeCatalogItem = (kind: string) => CATALOG.get(kind);
export const landscapeLabel = (kind: string) =>
  CATALOG.get(kind)?.label ?? "Garden item";
export const LANDSCAPE_GRID = 10;
export const snap10 = (n: number) =>
  Math.round(n / LANDSCAPE_GRID) * LANDSCAPE_GRID;

/** Plot-cm footprint of an item after its rotation. */
export function landscapeFootprint(
  item: Pick<LandscapeItem, "kind" | "x" | "z" | "rotation" | "w" | "d">,
): Rect {
  const entry = CATALOG.get(item.kind);
  const w = item.w ?? entry?.footprint.w ?? 50,
    d = item.d ?? entry?.footprint.d ?? 50,
    turned = item.rotation % 180 !== 0,
    fw = turned ? d : w,
    fd = turned ? w : d;
  return { x: item.x - fw / 2, z: item.z - fd / 2, w: fw, d: fd };
}

// ---------------------------------------------------------------------------
// Automatic garden
// ---------------------------------------------------------------------------
const treeVariant = (scale: number) =>
  scale >= 1.1 ? "l" : scale >= 1 ? "m" : "s";
/** Where the building meets the road side: margin, entrance and parking. */
export function siteAccess(p: Project) {
  const { width, depth, road } = p.plot;
  const ground = p.floors[0],
    fp = ground.footprint;
  const horizontal = road === "south" || road === "north";
  const length = horizontal ? width : depth;
  const margin =
    road === "south"
      ? depth - fp.z - fp.d
      : road === "north"
        ? fp.z
        : road === "east"
          ? width - fp.x - fp.w
          : fp.x;
  const walls = deriveWalls(floorForGeometry(p, ground.id), road);
  const door = walls.find(
    (w) => w.exterior && w.openings.some((o) => !isWindow(o.kind)),
  );
  const opening = door?.openings.find((o) => !isWindow(o.kind));
  const entryAlong =
    door && opening ? (horizontal ? door.x : door.z) + opening.offset : length / 2;
  const parkingAlong = entryAlong > length / 2 ? length / 4 : (length * 3) / 4;
  const parkingFits =
    margin >= 480 &&
    Math.abs(parkingAlong - entryAlong) > 210 &&
    parkingAlong >= 130 &&
    parkingAlong <= length - 130;
  return { horizontal, length, margin, hasEntrance: !!door, entryAlong, parkingAlong, parkingFits };
}
/** A point `distance` cm in from the road edge at `along` cm along it. */
function fromRoad(p: Project, along: number, distance: number) {
  const { width, depth, road } = p.plot;
  return road === "south"
    ? { x: along, z: depth - distance }
    : road === "north"
      ? { x: along, z: distance }
      : road === "east"
        ? { x: width - distance, z: along }
        : { x: distance, z: along };
}
/**
 * The automatic garden: corner trees (garden on, clear of the house), one
 * entrance path from the road, a parking spot (parking on, when it fits) and a
 * tree in each ground-floor courtyard. Deterministic `auto:` ids.
 */
export function autoLandscape(p: Project): LandscapeItem[] {
  const { width, depth } = p.plot;
  const ground = p.floors[0],
    fp = ground.footprint;
  const access = siteAccess(p);
  const items: LandscapeItem[] = [];
  if (p.garden)
    [
      { x: 85, z: 120, scale: 1.05 },
      { x: width - 95, z: 125, scale: 1.2 },
      { x: width - 90, z: depth - 145, scale: 0.78 },
      { x: 90, z: depth * 0.68, scale: 0.8 },
    ].forEach((tree, i) => {
      const clearance = tree.scale * 105 + 15;
      if (
        tree.x + clearance < fp.x ||
        tree.x - clearance > fp.x + fp.w ||
        tree.z + clearance < fp.z ||
        tree.z - clearance > fp.z + fp.d
      )
        items.push({
          id: `auto:tree-${i}`,
          kind: "tree-oak",
          x: tree.x,
          z: tree.z,
          rotation: 0,
          variant: treeVariant(tree.scale),
        });
    });
  if (access.hasEntrance && Math.floor(access.margin / 46) > 0) {
    // One path from the road to the house (or a veranda in front of it).
    const along = access.entryAlong;
    let reach = access.margin;
    for (const b of ground.balconies) {
      const r = balconyBounds(ground, b);
      const span = access.horizontal ? [r.x, r.x + r.w] : [r.z, r.z + r.d];
      if (along + 55 <= span[0] || along - 55 >= span[1]) continue;
      const near = access.horizontal
        ? p.plot.road === "south"
          ? depth - (r.z + r.d)
          : r.z
        : p.plot.road === "east"
          ? width - (r.x + r.w)
          : r.x;
      reach = Math.min(reach, near);
    }
    const length = Math.floor((reach - 10) / 20) * 20;
    if (length >= 60)
      items.push({
        id: "auto:path",
        kind: "path",
        ...fromRoad(p, along, length / 2 + 5),
        rotation: access.horizontal ? 0 : 90,
        w: 110,
        d: length,
      });
  }
  if (p.parking && access.parkingFits)
    items.push({
      id: "auto:parking",
      kind: "parking",
      ...fromRoad(p, access.parkingAlong, access.margin / 2),
      rotation: access.horizontal ? 0 : 90,
    });
  for (const v of floorForGeometry(p, ground.id).voids)
    if (v.kind === "courtyard")
      items.push({
        id: `auto:courtyard-${v.id}`,
        kind: "tree-oak",
        x: v.bounds.x + v.bounds.w / 2,
        z: v.bounds.z + v.bounds.d / 2,
        rotation: 0,
        variant: "s",
      });
  return items;
}
/** The garden shown: explicit when customised, else automatic. */
export const resolveLandscape = (p: Project): LandscapeItem[] =>
  p.landscape ?? autoLandscape(p);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
/** Areas no item may cover (ground slab minus courtyards, verandas) and areas
 *  tall items may not cover (upper-floor balconies). */
export function landscapeExclusions(p: Project): { all: Rect[]; tall: Rect[] } {
  const ground = p.floors[0];
  return {
    all: [
      ...slabTiles(floorForGeometry(p, ground.id), false),
      ...ground.balconies.map((b) => balconyBounds(ground, b)),
    ],
    tall: p.floors
      .slice(1)
      .flatMap((f) => f.balconies.map((b) => balconyBounds(f, b))),
  };
}
export type LandscapeProblem = { code: string; message: string };
/** Shape problems (catalog, grid, rotation, sizes, variant). */
export function landscapeShapeProblems(item: LandscapeItem): LandscapeProblem[] {
  const entry = CATALOG.get(item.kind);
  if (!entry)
    return [
      { code: "landscape-unknown", message: "Choose a garden item from the catalog." },
    ];
  const out: LandscapeProblem[] = [];
  if (
    !Number.isFinite(item.x) ||
    !Number.isFinite(item.z) ||
    item.x % LANDSCAPE_GRID ||
    item.z % LANDSCAPE_GRID
  )
    out.push({ code: "landscape-shape", message: "Garden items snap to a 10 cm grid." });
  if (![0, 90, 180, 270].includes(item.rotation) || (!entry.rotatable && item.rotation !== 0))
    out.push({ code: "landscape-shape", message: `${entry.label} can't be turned.` });
  for (const key of ["w", "d"] as const) {
    const value = item[key];
    if (value === undefined) continue;
    const range = entry.resizable?.[key];
    if (
      !range ||
      !Number.isInteger(value) ||
      value % LANDSCAPE_GRID ||
      value < range[0] ||
      value > range[1]
    )
      out.push({
        code: "landscape-shape",
        message: range
          ? `${entry.label} can be ${range[0]}–${range[1]} cm ${key === "w" ? "wide" : "long"}, in 10 cm steps.`
          : `${entry.label} has a fixed size.`,
      });
  }
  if (
    item.variant !== undefined &&
    !(entry.variants ?? []).includes(item.variant)
  )
    out.push({ code: "landscape-shape", message: `Choose a style ${entry.label.toLowerCase()} comes in.` });
  return out;
}
/** Site problems for one item: plot edges, the house and balconies. */
export function landscapeSiteProblems(
  p: Project,
  item: LandscapeItem,
  ex = landscapeExclusions(p),
): LandscapeProblem[] {
  const entry = CATALOG.get(item.kind);
  if (!entry) return [];
  const fp = landscapeFootprint(item),
    out: LandscapeProblem[] = [];
  if (
    fp.x < 0 ||
    fp.z < 0 ||
    fp.x + fp.w > p.plot.width ||
    fp.z + fp.d > p.plot.depth
  )
    out.push({ code: "landscape-outside", message: "Garden items must stay inside the plot." });
  if (ex.all.some((r) => overlaps(r, fp)))
    out.push({
      code: "landscape-on-building",
      message: `${entry.label} can't sit on the house or a veranda.`,
    });
  if (entry.tall && ex.tall.some((r) => overlaps(r, fp)))
    out.push({
      code: "landscape-under-balcony",
      message: `${entry.label} is too tall to stand under a balcony.`,
    });
  return out;
}
const isSolid = (item: LandscapeItem) => CATALOG.get(item.kind)?.layer === "solid";
/** Solid items this one overlaps (ground items may overlap anything). */
export function landscapeCollisions(
  item: LandscapeItem,
  others: readonly LandscapeItem[],
): LandscapeItem[] {
  if (!isSolid(item)) return [];
  const fp = landscapeFootprint(item);
  return others.filter(
    (o) => o.id !== item.id && isSolid(o) && overlaps(fp, landscapeFootprint(o)),
  );
}
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const ref = (id: string): ComponentRef => ({ kind: "landscape", id });
registerValidation((p, issue) => {
  if (!p.landscape) return;
  if (p.landscape.length > LIMITS.landscapeItems)
    issue("limit", "A garden holds up to 120 items.");
  const ids = idCounts(p),
    ex = landscapeExclusions(p);
  for (const [i, item] of p.landscape.entries()) {
    const source = ref(item.id),
      attempted = landscapeFootprint(item);
    if (typeof item.id !== "string" || !ID.test(item.id) || (ids.get(item.id) ?? 0) > 1)
      issue("duplicate-id", "Every component must have a unique, valid ID.", { source });
    const shape = landscapeShapeProblems(item);
    for (const s of shape) issue(s.code, s.message, { source, attempted });
    if (shape.some((s) => s.code === "landscape-unknown")) continue;
    for (const s of landscapeSiteProblems(p, item, ex))
      issue(s.code, s.message, { source, attempted });
    const hits = landscapeCollisions(item, p.landscape.slice(i + 1));
    if (hits.length)
      issue(
        "landscape-overlap",
        `${landscapeLabel(item.kind)} overlaps ${landscapeLabel(hits[0].kind).toLowerCase()}.`,
        { source, attempted, blockers: hits.map((h) => ref(h.id)) },
      );
  }
});

const placeable = (
  p: Project,
  item: LandscapeItem,
  placed: readonly LandscapeItem[],
  ex: ReturnType<typeof landscapeExclusions>,
) =>
  !landscapeSiteProblems(p, item, ex).length &&
  !landscapeCollisions(item, placed).length;
const SPIRAL: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let dx = -100; dx <= 100; dx += 10)
    for (let dz = -100; dz <= 100; dz += 10) if (dx || dz) out.push([dx, dz]);
  return out.sort(
    (a, b) =>
      a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) ||
      a[0] - b[0] ||
      a[1] - b[1],
  );
})();
/** The nearest valid position within 1 m (10 cm grid), or undefined. */
export function nudgeLandscape(
  p: Project,
  item: LandscapeItem,
  placed: readonly LandscapeItem[],
  ex = landscapeExclusions(p),
): LandscapeItem | undefined {
  if (placeable(p, item, placed, ex)) return item;
  for (const [dx, dz] of SPIRAL) {
    const next = { ...item, x: item.x + dx, z: item.z + dz };
    if (placeable(p, next, placed, ex)) return next;
  }
  return undefined;
}
/** Keeps what fits: valid items stay, others move up to 1 m or are removed. */
export function fitLandscape(
  p: Project,
  items: readonly LandscapeItem[],
): { items: LandscapeItem[]; removed: LandscapeItem[] } {
  const ex = landscapeExclusions(p),
    placed: LandscapeItem[] = [],
    removed: LandscapeItem[] = [];
  // Paths and other ground items first so solid items make way around them.
  const order = [...items].sort(
    (a, b) => Number(isSolid(a)) - Number(isSolid(b)),
  );
  const kept = new Map<string, LandscapeItem>();
  for (const item of order) {
    const fitted = nudgeLandscape(p, item, placed, ex);
    if (fitted) {
      placed.push(fitted);
      kept.set(item.id, fitted);
    } else removed.push(item);
  }
  return {
    items: items.flatMap((i) => (kept.has(i.id) ? [kept.get(i.id)!] : [])),
    removed,
  };
}

/** Converts an automatic item to valid explicit data (10 cm grid, ranges). */
export function normalizeLandscapeItem(item: LandscapeItem, id: string): LandscapeItem {
  const entry = CATALOG.get(item.kind);
  const size = (key: "w" | "d") => {
    const value = item[key],
      range = entry?.resizable?.[key];
    if (value === undefined || !range || !entry) return undefined;
    const v = Math.min(range[1], Math.max(range[0], snap10(value)));
    return v === entry.footprint[key] ? undefined : v;
  };
  const w = size("w"),
    d = size("d");
  return {
    id,
    kind: item.kind,
    x: snap10(item.x),
    z: snap10(item.z),
    rotation: entry?.rotatable ? item.rotation : 0,
    ...(w !== undefined ? { w } : {}),
    ...(d !== undefined ? { d } : {}),
    ...(item.variant !== undefined ? { variant: item.variant } : {}),
  };
}
/**
 * Turns the automatic garden into an explicit, valid list (`idMap` maps each
 * `auto:` id to its new id). No-op when already explicit.
 */
export function materializeLandscape(p: Project): {
  project: Project;
  idMap: Map<string, string>;
  removed: LandscapeItem[];
} {
  const idMap = new Map<string, string>();
  if (p.landscape) return { project: p, idMap, removed: [] };
  const used = componentIds(p);
  const normalized = autoLandscape(p).map((item) => {
    const id = allocateId(item.kind, used);
    idMap.set(item.id, id);
    return normalizeLandscapeItem(item, id);
  });
  const { items, removed } = fitLandscape(p, normalized);
  for (const item of removed)
    for (const [auto, real] of idMap) if (real === item.id) idMap.delete(auto);
  return { project: { ...p, landscape: items }, idMap, removed };
}

/**
 * A free spot for a new item: outward from `near`, or from the middle of the
 * widest open strip between the house and the plot edge.
 */
export function findLandscapeSpot(
  p: Project,
  kind: string,
  opts: {
    near?: { x: number; z: number };
    rotation?: QuarterTurn;
    w?: number;
    d?: number;
    exclude?: string;
  } = {},
): { x: number; z: number; rotation: QuarterTurn } | null {
  const entry = CATALOG.get(kind);
  if (!entry) return null;
  const items = resolveLandscape(p).filter((i) => i.id !== opts.exclude);
  const ex = landscapeExclusions(p);
  const { width, depth } = p.plot,
    fp = p.floors[0].footprint;
  const strips = [
    { size: fp.z, x: width / 2, z: fp.z / 2 },
    { size: depth - fp.z - fp.d, x: width / 2, z: (fp.z + fp.d + depth) / 2 },
    { size: fp.x, x: fp.x / 2, z: depth / 2 },
    { size: width - fp.x - fp.w, x: (fp.x + fp.w + width) / 2, z: depth / 2 },
  ].sort((a, b) => b.size - a.size);
  const anchor = opts.near ?? strips[0];
  const ax = snap10(anchor.x),
    az = snap10(anchor.z);
  const rotation = opts.rotation ?? 0;
  const probe = (x: number, z: number): LandscapeItem => ({
    id: opts.exclude ?? "__candidate",
    kind,
    x,
    z,
    rotation,
    ...(opts.w !== undefined ? { w: opts.w } : {}),
    ...(opts.d !== undefined ? { d: opts.d } : {}),
  });
  const reach = Math.max(width, depth);
  for (let r = 0; r <= reach; r += 50) {
    const ring: Array<[number, number]> = [];
    if (r === 0) ring.push([ax, az]);
    else
      for (let t = -r; t < r; t += 50)
        ring.push([ax + t, az - r], [ax + r, az + t], [ax - t, az + r], [ax - r, az - t]);
    ring.sort(
      (a, b) =>
        Math.hypot(a[0] - ax, a[1] - az) - Math.hypot(b[0] - ax, b[1] - az),
    );
    for (const [x, z] of ring)
      if (placeable(p, probe(x, z), items, ex)) return { x, z, rotation };
  }
  return null;
}

/**
 * Structural reconcile: when the plot, the ground floor, balconies or
 * courtyards change, explicit garden items that no longer fit are removed with
 * a `landscape-removed` notice.
 */
export function reconcileLandscape(
  before: Project,
  after: Project,
  notices: EditIssue[],
): Project {
  if (before === after || !after.landscape) return after;
  const key = (p: Project) =>
    JSON.stringify([
      p.plot.width,
      p.plot.depth,
      p.floors.map((f) => [f.footprint, f.balconies]),
      p.verticalSpaces.filter((v) => v.kind === "courtyard").map((v) => [v.bounds, v.floorIds]),
    ]);
  if (
    before.floors[0] &&
    sameRect(before.floors[0].footprint, after.floors[0].footprint) &&
    key(before) === key(after)
  )
    return after;
  const ex = landscapeExclusions(after);
  const kept = after.landscape.filter((item) => {
    if (!landscapeSiteProblems(after, item, ex).length) return true;
    notices.push(
      makeIssue(
        "landscape-removed",
        `${landscapeLabel(item.kind)} no longer fit on the plot, so it was removed.`,
        { severity: "notice", source: ref(item.id) },
      ),
    );
    return false;
  });
  return kept.length === after.landscape.length
    ? after
    : { ...after, landscape: kept };
}
registerReconciler(reconcileLandscape);
