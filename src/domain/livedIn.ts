// Lived-in details: the everyday and festive objects that make a home feel
// lived in — shoes by the door, chai and the newspaper on the coffee table, a
// sleeping cat, a pressure cooker on the hob, clothes drying on the balcony,
// and diyas, string lights and rangoli for Diwali. They are derived from the
// project, never saved, so editing stays tidy. Placement is pure and
// deterministic for a project and a seed: floor pieces keep out of every door
// approach and furniture, table-top pieces stand on free furniture tops, and
// wall pieces hang on clear wall.
import lifeJson from "./catalog/life.json" with { type: "json" };
import { balconyBounds, floorForGeometry } from "./core";
import { overlapArea, roomDoorApproaches } from "./details";
import { PORCH, mainDoor, type MainDoor } from "./entrance";
import { effectiveRoof } from "./materials";
import {
  autoLayoutKind,
  furnitureCatalogItem,
  furnitureFootprint,
  resolveFurniture,
  type AutoLayoutKind,
} from "./furniture";
import type { Balcony, EdgeSide, Floor, FurnitureItem, GeometryFloor, Project, Rect, Room, Wall } from "./types";
import { WALL_THICKNESS, deriveWalls, wallThicknessCm } from "./walls";

export type DecorSet = "everyday" | "diwali";
/** What an item's height is measured from: its floor, the porch landing, the garden ground, or the flat roof's terrace. */
export type DecorBase = "floor" | "porch" | "ground" | "roof";
export type LivedInItem = {
  /** Unique within the project and stable between calls. */
  id: string;
  /** A life kit model (catalog/life.json), or the procedural "rangoli" and "string-lights". */
  model: string;
  set: DecorSet;
  floorId: string;
  /** The room it is in; null outside (porch, balcony, the front of the house). */
  roomId: string | null;
  /** Centre of its footprint, plot centimetres. */
  x: number;
  z: number;
  /** Height of its base above `on`, cm. */
  y: number;
  on: DecorBase;
  /** The side its back faces, in degrees, like furniture: 0 north, 90 east. */
  rotation: number;
  /** Procedural pieces: a rangoli's diameter, a string of lights' length (cm). */
  size?: number;
};

type Size = { w: number; d: number; h: number };
type LifeEntry = { id: string; label: string; size: Size; parts?: string[] };
export const LIFE_CATALOG: ReadonlyMap<string, LifeEntry> = new Map(
  (lifeJson.items as LifeEntry[]).map((item) => [item.id, item]),
);
/** The procedural pieces (drawn by the renderer, not in the kit). */
const PROCEDURAL: Record<string, Size> = {
  rangoli: { w: 90, d: 90, h: 1 },
  "string-lights": { w: 100, d: 6, h: 10 },
};
export function lifeSize(model: string): Size {
  const size = LIFE_CATALOG.get(model)?.size ?? PROCEDURAL[model];
  if (!size) throw new Error(`Unknown lived-in model "${model}".`);
  return size;
}

// ---------------------------------------------------------------------------
// Geometry helpers (plot centimetres)
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
/** Axis-aligned footprint of a piece centred at (x, z), turned by `rotation` degrees. */
export function lifeFootprint(item: Pick<LivedInItem, "model" | "x" | "z" | "rotation" | "size">): Rect {
  const size = lifeSize(item.model);
  const w = item.size ?? size.w,
    d = item.model === "rangoli" ? (item.size ?? size.d) : size.d;
  const c = Math.abs(Math.cos(item.rotation * DEG)),
    s = Math.abs(Math.sin(item.rotation * DEG));
  const fw = w * c + d * s,
    fd = w * s + d * c;
  return { x: item.x - fw / 2, z: item.z - fd / 2, w: fw, d: fd };
}
const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.01 &&
  inner.z >= outer.z - 0.01 &&
  inner.x + inner.w <= outer.x + outer.w + 0.01 &&
  inner.z + inner.d <= outer.z + outer.d + 0.01;
const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, z: r.z + by, w: r.w - 2 * by, d: r.d - 2 * by });
const hits = (r: Rect, others: readonly Rect[]) => others.some((o) => overlapArea(r, o) > 0.5);
const toPlot = (room: Room, r: Rect): Rect => ({ ...r, x: r.x + room.bounds.x, z: r.z + room.bounds.z });
/** Floor pieces keep this far inside a room's wall lines (half the thickest wall, plus a little). */
const ROOM_INSET = WALL_THICKNESS.exterior / 2 + 2;

/** A stable number in [0, 1) for a key and the seed. */
function chance(key: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return (Math.imul(h, 2246822507) >>> 0) / 4294967296;
}

/** Rotation whose back faces an edge of a room. */
const BACK_TO: Record<EdgeSide, number> = { north: 0, east: 90, south: 180, west: 270 };
/** Rotation whose back faces a wall line, standing on its `out` side (+1: +z or +x). */
const backToWall = (axis: "x" | "z", out: 1 | -1) => (axis === "x" ? (out > 0 ? 0 : 180) : out > 0 ? 270 : 90);

/** The free intervals of [lo, hi] once the `blocked` intervals are removed. */
export function freeStretches(lo: number, hi: number, blocked: readonly [number, number][]): [number, number][] {
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let at = lo;
  for (const [a, b] of sorted) {
    if (b <= at) continue;
    if (a > at) free.push([at, Math.min(a, hi)]);
    at = Math.max(at, b);
    if (at >= hi) break;
  }
  if (at < hi) free.push([at, hi]);
  return free.filter(([a, b]) => b > a);
}

// ---------------------------------------------------------------------------
// Dressing one room
// ---------------------------------------------------------------------------
type Surface = { host: FurnitureItem; top: Rect; y: number };
type Point = { x: number; z: number };

class RoomDresser {
  readonly kind: AutoLayoutKind;
  readonly out: LivedInItem[] = [];
  /** Inside the room, clear of the wall faces. */
  private readonly area: Rect;
  private readonly furniture: FurnitureItem[];
  private readonly approaches: Rect[];
  /** Floor taken: furniture standing on the floor, curtains, placed pieces. */
  private readonly taken: Rect[] = [];
  /** Table tops taken: decor furniture and placed pieces. */
  private readonly onTop: Rect[] = [];
  private readonly surfaces: Surface[] = [];
  /** Walls that already hold a piece (the next one prefers another wall). */
  private readonly hung = new Set<EdgeSide>();

  constructor(
    readonly room: Room,
    private readonly walls: readonly Wall[],
    private readonly floorId: string,
    private readonly seed: number,
  ) {
    this.kind = autoLayoutKind(room);
    this.furniture = resolveFurniture(room, walls);
    this.approaches = roomDoorApproaches(room, walls);
    this.area = inset(room.bounds, ROOM_INSET);
    for (const item of this.furniture) {
      const entry = furnitureCatalogItem(item.catalogId);
      if (!entry) continue;
      const fp = toPlot(room, furnitureFootprint(item));
      if (entry.layer === "decor") this.onTop.push(fp);
      else if (entry.layer !== "floor" && entry.layer !== "ceiling" && (entry.mountY ?? 0) < 40) this.taken.push(fp);
      if (entry.surface !== undefined && entry.layer === "standard")
        this.surfaces.push({ host: item, top: inset(fp, 3), y: entry.surface });
    }
  }

  private add(model: string, at: Point, y: number, rotation: number, set: DecorSet, n?: number) {
    const item: LivedInItem = {
      id: `${this.room.id}:${model}${n ? `-${n}` : ""}`,
      model,
      set,
      floorId: this.floorId,
      roomId: this.room.id,
      x: Math.round(at.x),
      z: Math.round(at.z),
      y,
      on: "floor",
      rotation: ((Math.round(rotation) % 360) + 360) % 360,
    };
    this.out.push(item);
    return item;
  }

  private key(model: string, what: string) {
    return `${this.room.id}:${model}:${what}`;
  }

  /** Centre of the first piece of this furniture in the room, plot cm. */
  centre(catalogId: string): Point | undefined {
    const f = this.furniture.find((i) => i.catalogId === catalogId);
    return f ? { x: this.room.bounds.x + f.x, z: this.room.bounds.z + f.z } : undefined;
  }

  /**
   * A floor piece on free floor: inside the room, out of every door approach,
   * clear of furniture and other pieces, nearest `near` (else a corner the
   * seed picks), with a slight natural turn.
   */
  floor(model: string, set: DecorSet, opts: { near?: Point; turn?: number; n?: number } = {}) {
    const a = this.area;
    if (a.w <= 0 || a.d <= 0) return null;
    const corner = Math.floor(chance(this.key(model, "corner"), this.seed) * 4);
    const near = opts.near ?? { x: corner & 1 ? a.x + a.w : a.x, z: corner & 2 ? a.z + a.d : a.z };
    const turn = opts.turn ?? Math.round((chance(this.key(model, "turn"), this.seed) - 0.5) * 30);
    const spots: Point[] = [];
    for (let x = a.x; x <= a.x + a.w; x += 10) for (let z = a.z; z <= a.z + a.d; z += 10) spots.push({ x, z });
    spots.sort((p, q) => Math.hypot(p.x - near.x, p.z - near.z) - Math.hypot(q.x - near.x, q.z - near.z));
    for (const spot of spots)
      for (const base of [0, 90, 180, 270]) {
        const rotation = base + turn;
        const fp = lifeFootprint({ model, ...spot, rotation });
        if (!within(fp, a) || hits(fp, this.approaches) || hits(fp, this.taken)) continue;
        this.taken.push(fp);
        return this.add(model, spot, 0, rotation, set, opts.n);
      }
    return null;
  }

  /** A table-top piece on the first free spot of the preferred hosts (best first). */
  surface(model: string, set: DecorSet, hosts: readonly string[], opts: { n?: number; at?: Point } = {}) {
    const ranked = this.surfaces
      .map((s) => ({ s, rank: hosts.indexOf(s.host.catalogId) }))
      .filter((h) => h.rank >= 0)
      .sort((p, q) => p.rank - q.rank);
    for (const { s } of ranked) {
      const rotation = s.host.rotation;
      const wide = rotation % 180 === 0;
      const reach = (wide ? s.top.w : s.top.d) / 2;
      const cx = s.top.x + s.top.w / 2,
        cz = s.top.z + s.top.d / 2;
      const spots = opts.at
        ? [opts.at]
        : [0, -0.65, 0.65, -0.35, 0.35].map((t) => (wide ? { x: cx + t * reach, z: cz } : { x: cx, z: cz + t * reach }));
      for (const spot of spots) {
        const fp = lifeFootprint({ model, ...spot, rotation });
        if (!within(fp, s.top) || hits(fp, this.onTop)) continue;
        this.onTop.push(fp);
        return this.add(model, spot, s.y, rotation, set, opts.n);
      }
    }
    return null;
  }

  /**
   * A wall piece hung at `y` (cm above the floor) on the longest clear
   * stretch of a wall: away from openings and from furniture that stands
   * against that wall and reaches the hanging height.
   */
  wall(model: string, set: DecorSet, y: number) {
    const size = lifeSize(model);
    const b = this.room.bounds;
    const order = (["north", "east", "south", "west"] as const)
      .map((side, i) => ({ side, rank: (this.hung.has(side) ? 4 : 0) + ((i + Math.floor(chance(this.key(model, "wall"), this.seed) * 4)) % 4) }))
      .sort((p, q) => p.rank - q.rank);
    for (const { side } of order) {
      const horizontal = side === "north" || side === "south";
      const line = side === "north" ? b.z : side === "south" ? b.z + b.d : side === "west" ? b.x : b.x + b.w;
      const [lo, hi] = horizontal ? [b.x, b.x + b.w] : [b.z, b.z + b.d];
      const startOf = (w: Wall) => (horizontal ? w.x : w.z);
      const walls = this.walls.filter(
        (w) => w.axis === (horizontal ? "x" : "z") && (horizontal ? w.z : w.x) === line && startOf(w) < hi && startOf(w) + w.length > lo,
      );
      if (!walls.length) continue;
      const blocked: [number, number][] = [];
      for (const w of walls)
        for (const o of w.openings) blocked.push([startOf(w) + o.offset - o.width / 2 - 15, startOf(w) + o.offset + o.width / 2 + 15]);
      for (const item of this.furniture) {
        const entry = furnitureCatalogItem(item.catalogId);
        if (!entry || entry.layer === "decor" || entry.layer === "floor" || entry.layer === "ceiling") continue;
        const bottom = entry.mountY ?? 0;
        if (bottom + entry.size.h < y - 5 || bottom > y + size.h + 5) continue;
        const fp = toPlot(this.room, furnitureFootprint(item));
        const gap = horizontal
          ? side === "north"
            ? fp.z - b.z
            : b.z + b.d - (fp.z + fp.d)
          : side === "west"
            ? fp.x - b.x
            : b.x + b.w - (fp.x + fp.w);
        if (gap <= 45) blocked.push(horizontal ? [fp.x - 10, fp.x + fp.w + 10] : [fp.z - 10, fp.z + fp.d + 10]);
      }
      const free = freeStretches(lo + 20, hi - 20, blocked).filter(([p, q]) => q - p >= size.w + 10);
      if (!free.length) continue;
      const [p, q] = free.reduce((m, f) => (f[1] - f[0] > m[1] - m[0] ? f : m));
      const mid = (p + q) / 2;
      const wall = walls.find((w) => startOf(w) <= mid && startOf(w) + w.length >= mid) ?? walls[0];
      const into = wallThicknessCm(wall) / 2 + size.d / 2 + 0.5;
      const inward = side === "north" || side === "west" ? 1 : -1;
      this.hung.add(side);
      return this.add(model, horizontal ? { x: mid, z: line + inward * into } : { x: line + inward * into, z: mid }, y, BACK_TO[side], set);
    }
    return null;
  }
}

const SHELVES = ["console-table", "sideboard", "media-unit", "shoe-rack", "dresser", "bedside-table", "side-table", "desk"];
const TABLES = ["coffee-table", "side-table", "console-table", "sideboard", "dining-table", "dining-table-round"];
const COUNTERS = ["kitchen-counter", "kitchen-base", "kitchen-island", "laundry-counter"];

/** What one floor's rooms share: one sleeping cat, one place to dry clothes. */
type FloorCast = { cat: boolean; kids: boolean; clothes: boolean };

/** Everyday pieces for one room, by what it is for. */
function dressRoom(d: RoomDresser, cast: FloorCast) {
  const set = "everyday" as const;
  const rug = d.centre("rug-rect") ?? d.centre("rug-round");
  switch (d.kind) {
    case "living": {
      d.surface("newspaper", set, ["coffee-table", "side-table"]);
      d.surface("chai", set, ["coffee-table", "side-table", "console-table"]);
      d.surface("photo-frames", set, SHELVES);
      if (!d.surface("money-plant", set, ["media-unit", "sideboard", "shoe-rack", "console-table"])) d.floor("money-plant", set);
      d.wall("wall-clock", set, 190);
      d.wall("wall-photos", set, 130);
      const seat = d.centre("sofa-3") ?? d.centre("sofa-2") ?? d.centre("diwan");
      d.floor("floor-cushions", set, { near: seat });
      d.floor("urli", set);
      if (cast.kids) d.floor("toys", set, { near: rug });
      if (cast.cat && d.floor("cat", set, { near: rug ?? seat })) cast.cat = false;
      break;
    }
    case "kitchen": {
      // The cooker sits on the hob, under the chimney.
      const hob = d.centre("kitchen-chimney") ?? d.centre("kitchen-stove");
      if (!(hob && d.surface("pressure-cooker", set, COUNTERS, { at: hob }))) d.surface("pressure-cooker", set, COUNTERS);
      d.surface("steel-set", set, COUNTERS);
      d.surface("fruit-bowl", set, ["kitchen-island", "dining-table", "dining-table-round", ...COUNTERS]);
      d.wall("calendar", set, 140);
      break;
    }
    case "dining":
      d.surface("fruit-bowl", set, ["dining-table", "dining-table-round", "sideboard"]);
      d.surface("steel-set", set, ["dining-table", "dining-table-round", "sideboard"]);
      d.wall("wall-clock", set, 190);
      break;
    case "bedroom": {
      const bed = d.centre("bed-double") ?? d.centre("bed-single");
      d.floor("slippers", set, { near: bed });
      d.surface("photo-frames", set, ["bedside-table", "dresser", "desk", "side-table"]);
      if (cast.kids && /kid|child/i.test(d.room.name)) d.floor("school-bag", set, { near: d.centre("desk") ?? bed });
      if (cast.cat && d.floor("cat", set, { near: rug ?? bed })) cast.cat = false;
      break;
    }
    case "bathroom":
      d.floor("bucket", set, { near: d.centre("shower") ?? d.centre("toilet") });
      break;
    case "prayer":
      d.floor("urli", set, { near: d.centre("prayer-shrine") });
      break;
    case "study":
      d.surface("photo-frames", set, ["desk", "side-table"]);
      d.surface("money-plant", set, ["desk", "side-table"]);
      if (cast.kids) d.floor("school-bag", set, { near: d.centre("desk") });
      break;
    case "utility":
      if (cast.clothes && d.floor("clothesline", set)) cast.clothes = false;
      break;
    default:
      break;
  }
}

/** Diwali inside: diyas and a rangoli before the shrine, a pair of diyas in the living room. */
function dressRoomForDiwali(d: RoomDresser) {
  const set = "diwali" as const;
  if (d.kind === "prayer") {
    const shrine = d.centre("prayer-shrine");
    for (let n = 1; n <= 3; n++) d.floor("diwali-diya", set, { near: shrine, turn: 0, n });
    d.floor("rangoli", set);
  }
  if (d.kind === "living") for (let n = 1; n <= 2; n++) d.surface("diwali-diya", set, [...TABLES, ...SHELVES], { n });
}

// ---------------------------------------------------------------------------
// Outside: the porch, the front of the house, balconies
// ---------------------------------------------------------------------------
const outsideItem = (item: Omit<LivedInItem, "roomId">): LivedInItem => ({
  ...item,
  x: Math.round(item.x),
  z: Math.round(item.z),
  roomId: null,
});

/** Plot cm of a point `along` the door's wall and `out` cm outward from its line. */
const fromDoor = (door: MainDoor, along: number, out: number): Point =>
  door.axis === "x" ? { x: door.along + along, z: door.line + door.out * out } : { x: door.line + door.out * out, z: door.along + along };

function porchDecor(door: MainDoor, walls: readonly Wall[], seed: number): LivedInItem[] {
  const { face, landing, step, mat } = PORCH;
  const half = door.width / 2;
  const facing = backToWall(door.axis, door.out);
  const floorId = door.floorId;
  const items: LivedInItem[] = [];
  // A toran across the top of the door, over the outside architrave.
  const wall = walls.find((w) => w.axis === door.axis && (w.axis === "x" ? w.z : w.x) === door.line);
  const toran = lifeSize("toran");
  const toranOut = (wall ? wallThicknessCm(wall) : WALL_THICKNESS.exterior) / 2 + 2.5 + toran.d / 2;
  items.push(outsideItem({ id: "porch:toran", model: "toran", set: "everyday", floorId, ...fromDoor(door, 0, toranOut), y: door.head + 6 - toran.h, on: "floor", rotation: facing }));
  // Shoes beside the door mat (just over its edge, as they are left), turned to face the door.
  const shoes = lifeSize("shoes");
  const sideways = half + landing.reach - shoes.d / 2 - 1;
  if (sideways - shoes.d / 2 >= mat.half - 6) {
    const side = chance(`${door.openingId}:shoes`, seed) < 0.5 ? -1 : 1;
    items.push(outsideItem({ id: "porch:shoes", model: "shoes", set: "everyday", floorId, ...fromDoor(door, side * sideways, face + 8 + shoes.w / 2), y: 0, on: "porch", rotation: facing + 90 }));
  }
  // Diwali: a row of diyas along the landing's front edge, and a rangoli in front of the step.
  const reach = half + landing.reach - 12;
  for (let i = 0; i < 7; i++)
    items.push(outsideItem({ id: `porch:diwali-diya-${i}`, model: "diwali-diya", set: "diwali", floorId, ...fromDoor(door, -reach + (2 * reach * i) / 6, face + landing.depth - 8), y: 0, on: "porch", rotation: facing }));
  const rangoli = lifeSize("rangoli");
  items.push(outsideItem({ id: "porch:rangoli", model: "rangoli", set: "diwali", floorId, ...fromDoor(door, 0, face + landing.depth + step.depth + rangoli.d / 2 + 10), y: 0, on: "ground", rotation: facing, size: rangoli.w }));
  return items;
}

/**
 * A scooter and a bicycle parked along the front of the house, on the side
 * of the door away from the car (siteAccess parks it on the far half), past
 * the shrubs that flank the path. The site layout keeps these spots clear of
 * front planting (scene/props/site.ts).
 */
export function frontVehicles(project: Project): LivedInItem[] {
  const door = mainDoor(project);
  if (!door?.roadSide) return [];
  const floor = project.floors.find((f) => f.id === door.floorId)!;
  const fp = floor.footprint;
  const road = project.plot.road;
  const margin = road === "south" ? project.plot.depth - fp.z - fp.d : road === "north" ? fp.z : road === "east" ? project.plot.width - fp.x - fp.w : fp.x;
  const [lo, hi] = door.axis === "x" ? [fp.x, fp.x + fp.w] : [fp.z, fp.z + fp.d];
  const length = door.axis === "x" ? project.plot.width : project.plot.depth;
  const carSide = door.along > length / 2 ? -1 : 1;
  const sides = project.parking ? [-carSide] : [1, -1];
  const facing = backToWall(door.axis, door.out);
  for (const side of sides) {
    const items: LivedInItem[] = [];
    let at = door.width / 2 + 150;
    for (const model of ["scooter", "cycle"]) {
      const { w, d } = lifeSize(model);
      const out = 25 + w / 2;
      const centre = door.along + side * (at + d / 2);
      if (out + w / 2 > margin - 40 || centre - d / 2 < lo + 20 || centre + d / 2 > hi - 20) break;
      // The vehicle's length (its depth) runs along the wall.
      items.push(outsideItem({ id: `front:${model}`, model, set: "everyday", floorId: floor.id, ...fromDoor(door, centre - door.along, out), y: 0, on: "ground", rotation: facing + 90 }));
      at += d + 30;
    }
    if (items.length) return items;
  }
  return [];
}

/** The deck of a balcony, clear of its railing. */
const balconyDeck = (floor: Floor, balcony: Balcony) => inset(balconyBounds(floor, balcony), 12);
const fitsClothes = (floor: Floor, balcony: Balcony) => {
  const deck = balconyDeck(floor, balcony);
  const along = balcony.edge === "north" || balcony.edge === "south";
  const line = lifeSize("clothesline");
  return (along ? deck.w : deck.d) >= line.w + 20 && (along ? deck.d : deck.w) >= line.d;
};

/** Clothes drying or a money plant on a balcony; diyas along its edge at Diwali. */
function balconyDecor(floor: Floor, balcony: Balcony, clothes: boolean): LivedInItem[] {
  const deck = balconyDeck(floor, balcony);
  const along = balcony.edge === "north" || balcony.edge === "south";
  const parallel = along ? 0 : 90;
  // The deck sits 1.3 cm below the rooms' finished floors.
  const base = { floorId: floor.id, on: "floor" as const, y: -1 };
  const items: LivedInItem[] = [];
  if (clothes)
    items.push(outsideItem({ ...base, id: `balcony:${balcony.id}:clothesline`, model: "clothesline", set: "everyday", x: deck.x + deck.w / 2, z: deck.z + deck.d / 2, rotation: parallel }));
  else {
    const plant = lifeSize("money-plant");
    items.push(outsideItem({ ...base, id: `balcony:${balcony.id}:money-plant`, model: "money-plant", set: "everyday", x: deck.x + plant.w / 2, z: deck.z + plant.d / 2, rotation: parallel }));
  }
  const outer = balcony.edge === "south" ? deck.z + deck.d : balcony.edge === "north" ? deck.z : balcony.edge === "east" ? deck.x + deck.w : deck.x;
  const [s0, s1] = along ? [deck.x, deck.x + deck.w] : [deck.z, deck.z + deck.d];
  const count = Math.max(2, Math.min(6, Math.floor((s1 - s0) / 45)));
  for (let i = 0; i < count; i++) {
    const t = s0 + ((i + 0.5) * (s1 - s0)) / count;
    items.push(outsideItem({ ...base, id: `balcony:${balcony.id}:diwali-diya-${i}`, model: "diwali-diya", set: "diwali", ...(along ? { x: t, z: outer } : { x: outer, z: t }), rotation: parallel }));
  }
  return items;
}

/**
 * Clothes drying on the flat-roof terrace, toward the road (the water tank
 * stands in a back corner), clear of the stair cabin and courtyards.
 */
function terraceClothes(project: Project, floor: GeometryFloor): LivedInItem[] {
  const fp = floor.footprint;
  const road = project.plot.road;
  const horizontal = road === "south" || road === "north";
  const size = lifeSize("clothesline");
  const rotation = horizontal ? 0 : 90;
  const toward = road === "south" || road === "east" ? 1 : -1;
  const deck = inset(fp, 45);
  const keepOut = floor.voids.map((v) => inset(v.bounds, -60));
  for (const t of [0.25, 0.1, 0, 0.35]) {
    const at = horizontal
      ? { x: fp.x + fp.w / 2, z: fp.z + fp.d / 2 + toward * t * fp.d }
      : { x: fp.x + fp.w / 2 + toward * t * fp.w, z: fp.z + fp.d / 2 };
    const box = lifeFootprint({ model: "clothesline", ...at, rotation });
    if (size.w > deck.w || !within(box, deck) || hits(box, keepOut)) continue;
    return [outsideItem({ id: `terrace:${floor.id}:clothesline`, model: "clothesline", set: "everyday", floorId: floor.id, ...at, y: 0, on: "roof", rotation })];
  }
  return [];
}

/** A festoon of lights just under the ceiling line of the floor's road-side wall. */
function stringLights(project: Project, floor: GeometryFloor, walls: readonly Wall[]): LivedInItem[] {
  const fp = floor.footprint;
  const road = project.plot.road;
  const horizontal = road === "south" || road === "north";
  const line = road === "south" ? fp.z + fp.d : road === "north" ? fp.z : road === "east" ? fp.x + fp.w : fp.x;
  const out: 1 | -1 = road === "south" || road === "east" ? 1 : -1;
  const facade = walls.filter((w) => w.exterior && w.axis === (horizontal ? "x" : "z") && (horizontal ? w.z : w.x) === line);
  if (!facade.length) return [];
  const start = Math.min(...facade.map((w) => (horizontal ? w.x : w.z)));
  const end = Math.max(...facade.map((w) => (horizontal ? w.x : w.z) + w.length));
  const length = Math.round(end - start - 30);
  if (length < 120) return [];
  const across = line + out * (WALL_THICKNESS.exterior / 2 + 6);
  const mid = (start + end) / 2;
  return [
    outsideItem({
      id: `front:${floor.id}:string-lights`,
      model: "string-lights",
      set: "diwali",
      floorId: floor.id,
      ...(horizontal ? { x: mid, z: across } : { x: across, z: mid }),
      // Below the eaves of a sloping roof, still above the window heads.
      y: floor.height - 32,
      on: "floor",
      rotation: backToWall(horizontal ? "x" : "z", out),
      size: length,
    }),
  ];
}

// ---------------------------------------------------------------------------

/**
 * Everyday and Diwali details for one floor: its rooms, its balconies and,
 * on the floor with the main door, the porch and the front of the house.
 * Each floor has its own sleeping cat and its own clothes drying (on the
 * first roomy balcony, else in a utility room); a flat roof's terrace has
 * clothes drying too. Never changes the project.
 */
export function livedInDecor(project: Project, floorId: string, seed = 0): LivedInItem[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const geometry = floorForGeometry(project, floorId);
  const walls = deriveWalls(geometry, project.plot.road);
  const bedrooms = project.floors.reduce((n, f) => n + f.rooms.filter((r) => r.kind === "bedroom").length, 0);
  const dryingBalcony = floor.balconies.find((b) => fitsClothes(floor, b));
  const cast: FloorCast = { cat: true, kids: bedrooms >= 2, clothes: !dryingBalcony };
  const items: LivedInItem[] = [];
  // Living rooms first: they get the cat.
  const rooms = [...geometry.rooms].sort((a, b) => Number(autoLayoutKind(b) === "living") - Number(autoLayoutKind(a) === "living"));
  for (const room of rooms) {
    if (room.kind === "shop") continue;
    const d = new RoomDresser(room, walls, floorId, seed);
    dressRoom(d, cast);
    dressRoomForDiwali(d);
    items.push(...d.out);
  }
  const outside: LivedInItem[] = [];
  const door = mainDoor(project);
  if (door?.floorId === floorId) outside.push(...porchDecor(door, walls, seed), ...frontVehicles(project));
  for (const balcony of floor.balconies) outside.push(...balconyDecor(floor, balcony, balcony === dryingBalcony));
  const topFloor = !project.floors.some((f) => f.elevation === floor.elevation + floor.height);
  if (topFloor && effectiveRoof(project).style === "flat") outside.push(...terraceClothes(project, geometry));
  outside.push(...stringLights(project, geometry, walls));
  // A house built right up to the plot edge has its porch over the road: nothing goes there.
  const plot: Rect = { x: 0, z: 0, w: project.plot.width, d: project.plot.depth };
  items.push(...outside.filter((item) => within(lifeFootprint(item), plot)));
  return items;
}
