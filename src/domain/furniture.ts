// Furniture: the catalog (catalog/furniture.json), per-item procedural parts,
// the designer automatic layouts, and the rules every explicit
// `Room.furniture` list must satisfy.
//
// Part generators take an origin (ox, oz) and emit in the item's own
// back-north frame; automatic and explicit items share them, so a room's
// automatic layout and its materialised copy draw identically.
import catalogJson from "./catalog/furniture.json" with { type: "json" };
import { floorForGeometry } from "./core";
import {
  overlapArea,
  roomDoorApproaches,
  turnRect,
  type DetailMaterial,
  type RoomDetail,
} from "./details";
import { registerReconciler } from "./edit";
import { allocateId, componentIds, idCounts, overlaps } from "./geometry";
import { makeIssue, type IssueSink } from "./issues";
import { LIMITS } from "./limits";
import type {
  ComponentRef,
  EdgeSide,
  EditIssue,
  FurnitureItem,
  Project,
  QuarterTurn,
  Rect,
  Room,
  RoomKind,
  Wall,
} from "./types";
import { registerValidation } from "./validate";
import { deriveWalls, isPassable } from "./walls";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
/**
 * Collision layers: pieces only collide with pieces in the same layer.
 * floor: rugs and mats · standard: free-standing furniture · high: wall-hung
 * pieces (art, curtains, cabinets) · wall: flat wall coverings (headboard
 * panels, tiles) · ceiling: fans and pendants · decor: small styling pieces
 * that rest on whatever surface is below them (lamps, cushions, vases).
 */
export type FurnitureLayer = "floor" | "standard" | "high" | "ceiling" | "wall" | "decor";
export type FinishSlot = "fabric" | "wood" | "accent";
export type FurnitureCatalogItem = {
  id: string;
  label: string;
  category: string;
  size: { w: number; d: number; h: number };
  layer: FurnitureLayer;
  mountY?: number;
  wallSnap: boolean;
  blocksWalk: boolean;
  stretch?: { w?: [number, number]; d?: [number, number] };
  tile?: Record<string, string | number>;
  finishSlot?: FinishSlot;
  finishes?: string[];
  defaultFinish?: string;
  slots: string[];
  triBudget: number;
  rooms: RoomKind[];
  /** A lamp: the bulb height above the item's base (cm), colour and strength. */
  light?: { y: number; color: string; intensity: number };
  /** Height (cm) of the top surface that decor pieces can rest on. */
  surface?: number;
};
export const FURNITURE_CATALOG: readonly FurnitureCatalogItem[] =
  catalogJson.items as unknown as FurnitureCatalogItem[];
/** Finish colours per slot (`FURNITURE_FINISHES.fabric.sage` → hex). */
export const FURNITURE_FINISHES = catalogJson.finishes as Record<
  FinishSlot,
  Record<string, string>
>;
const CATALOG = new Map(FURNITURE_CATALOG.map((item) => [item.id, item]));
export const furnitureCatalogItem = (id: string) => CATALOG.get(id);
/** Catalog items whose suggested rooms include this room kind. */
export const suggestedFurniture = (kind: RoomKind) =>
  FURNITURE_CATALOG.filter((item) => item.rooms.includes(kind));

/** Pieces that look at home in any room: plants, rugs, lamps, a mirror… */
const GOES_ANYWHERE = new Set([
  "plant-floor",
  "plant-small",
  "rug-rect",
  "rug-round",
  "floor-lamp",
  "pendant-light",
  "mirror",
  "bookshelf",
  "side-table",
  "wall-art",
  "curtains",
  "cushions",
  "vase-books",
  "ceiling-fan",
]);
/** Accessories dress any room (art, rugs, lamps, plants) but don't make one. */
export function isAccessory(catalogId: string): boolean {
  const entry = CATALOG.get(catalogId);
  return (
    !entry ||
    GOES_ANYWHERE.has(catalogId) ||
    entry.category === "decor" ||
    entry.category === "lighting"
  );
}
/** Friendly names for where a piece belongs ("a bedroom", "a kitchen"). */
const KIND_PLACE: Record<RoomKind, string> = {
  bedroom: "a bedroom",
  living: "a living room",
  kitchen: "a kitchen",
  bathroom: "a bathroom",
  dining: "a dining room",
  utility: "a study or utility room",
  shop: "a shop",
};
/** Whether a catalog piece belongs in a room of this kind (no beds in kitchens). */
export function furnitureFitsRoom(catalogId: string, kind: RoomKind): boolean {
  const entry = CATALOG.get(catalogId);
  if (!entry) return false;
  return entry.rooms.includes(kind) || GOES_ANYWHERE.has(catalogId);
}
/** "A double bed belongs in a bedroom." — or null when it fits. */
export function furnitureMisfit(catalogId: string, kind: RoomKind): string | null {
  if (furnitureFitsRoom(catalogId, kind)) return null;
  const entry = CATALOG.get(catalogId);
  if (!entry) return "Choose furniture from the catalog.";
  const home = entry.rooms[0];
  return home
    ? `A ${entry.label.toLowerCase()} belongs in ${KIND_PLACE[home]}.`
    : `A ${entry.label.toLowerCase()} can’t go in ${KIND_PLACE[kind]}.`;
}
/** Short badge text while dragging: "A bed can’t go in a kitchen". */
export function furnitureMisfitShort(catalogId: string, kind: RoomKind): string {
  const label = CATALOG.get(catalogId)?.label.toLowerCase() ?? "piece";
  return `A ${label} can’t go in ${KIND_PLACE[kind]}`;
}
export function finishColor(
  entry: FurnitureCatalogItem,
  finish: string | undefined,
): string | undefined {
  if (!finish || !entry.finishSlot) return undefined;
  return FURNITURE_FINISHES[entry.finishSlot]?.[finish];
}

// ---------------------------------------------------------------------------
// Part emission
// ---------------------------------------------------------------------------
type Emit = {
  box(
    role: string,
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    height: number,
    material: DetailMaterial,
    soft?: boolean,
    tint?: boolean,
  ): void;
  ellipse(
    role: string,
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    height: number,
    material: DetailMaterial,
    tint?: boolean,
  ): void;
};
type Keep = (x: number, z: number, w: number, d: number) => boolean;
function makeEmit(
  push: (part: RoomDetail, tint: boolean) => void,
  keep: Keep,
): Emit {
  const add = (
    shape: RoomDetail["shape"],
    role: string,
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    height: number,
    material: DetailMaterial,
    soft: boolean,
    tint: boolean,
  ) => {
    if (!keep(x, z, w, d)) return;
    push(
      { role, shape, bounds: { x, z, w, d }, y, height, material, soft },
      tint,
    );
  };
  return {
    box: (role, x, z, w, d, y, h, material, soft = false, tint = false) =>
      add("box", role, x, z, w, d, y, h, material, soft, tint),
    ellipse: (role, x, z, w, d, y, h, material, tint = false) =>
      add("ellipse", role, x, z, w, d, y, h, material, true, tint),
  };
}
const sizeKeep: Keep = (_x, _z, w, d) => w > 0 && d > 0;

type Gen = (e: Emit, ox: number, oz: number, w: number, d: number) => void;

// ---------------------------------------------------------------------------
// Ported recipe parts (geometry and roles identical to the original recipes)
// ---------------------------------------------------------------------------
function legs(
  e: Emit,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  tint = false,
) {
  for (const dx of [6, width - 12])
    for (const dz of [6, depth - 12])
      e.box("leg", x + dx, z + dz, 6, 6, 0, height, "timber", false, tint);
}
function chair(
  e: Emit,
  ox: number,
  oz: number,
  w: number,
  d: number,
  back: "north" | "south" = "north",
  tint = false,
) {
  e.box("chair", ox, oz, w, d, 38, 9, "oak", true, tint);
  e.box(
    "chair back",
    ox,
    oz + (back === "north" ? 0 : d - 5),
    w,
    5,
    47,
    35,
    "oak",
    true,
    tint,
  );
  legs(e, ox, oz, w, d, 38, tint);
}
const bed: Gen = (e, ox, oz, w, d) => {
  e.box("bed base", ox, oz, w, d, 9, 26, "timber");
  e.box("headboard", ox, oz, w, 7, 0, 89, "oak", true);
  e.box("mattress", ox + 2, oz + 8, w - 4, d - 10, 35, 16, "linen", true);
  e.box("duvet", ox + 1, oz + 61, w - 2, d - 65, 51, 7, "fabric", true, true);
  e.box("duvet fold", ox + 1, oz + 59, w - 2, 17, 57, 3, "cushion", true);
  const pillows = w > 140 ? 2 : 1;
  const inset = 9 + (w - (pillows === 2 ? 155 : 90)) / 2;
  for (let i = 0; i < pillows; i++)
    e.box(
      "pillow",
      ox + inset + i * 72,
      oz + 17,
      pillows === 2 ? 62 : 70,
      35,
      51,
      11,
      "linen",
      true,
    );
};
const bedsideTable: Gen = (e, ox, oz, w, d) =>
  e.box("bedside table", ox, oz, w, d, 0, 46, "oak", false, true);
const sleepingMat: Gen = (e, ox, oz, w, d) => {
  e.box("folded sleeping mat", ox, oz, w, d, 1, 7, "fabric", true, true);
  e.box(
    "pillow",
    ox + Math.max(0, (w - 64) / 2),
    oz + 8,
    Math.min(64, w),
    32,
    8,
    9,
    "linen",
    true,
  );
};
function kitchenCounter(
  e: Emit,
  ox: number,
  oz: number,
  w: number,
  d: number,
  appliances: boolean,
) {
  e.box("kitchen cabinets", ox, oz, w, d, 0, 84, "cabinet", false, true);
  e.box("countertop", ox, oz, w, d + 2, 84, 5, "stone");
  for (let x = 0; x < w - 25; x += 55) {
    e.box(
      "cabinet front",
      ox + x + 2,
      oz + d,
      Math.min(51, w - x - 4),
      2,
      5,
      73,
      "cabinet",
      false,
      true,
    );
    e.box(
      "cabinet handle",
      ox + x + 12,
      oz + d + 2,
      Math.min(24, w - x - 16),
      2,
      66,
      2,
      "steel",
    );
  }
  if (!appliances) return;
  const hobX = Math.max(4, w - 60);
  e.box("hob", ox + hobX, oz + 8, Math.min(52, w - hobX), 43, 89, 2, "dark", true);
  for (const dx of [8, 31])
    for (const dz of [5, 26]) {
      e.ellipse("burner", ox + hobX + dx, oz + 8 + dz, 13, 13, 91, 1, "steel");
      e.ellipse(
        "burner center",
        ox + hobX + dx + 3,
        oz + 11 + dz,
        7,
        7,
        92,
        1,
        "dark",
      );
    }
  e.ellipse("cooking pot", ox + hobX + 4, oz + 10, 22, 22, 92, 16, "steel");
  e.ellipse("pot lid", ox + hobX + 3, oz + 9, 24, 24, 108, 2, "dark");
  if (w >= 145) {
    // The sink sits mid-run like the tiled GLB counter.
    const sx = ox + Math.max(10, Math.min(w / 2 - 24, hobX - 120));
    e.box("sink rim", sx, oz + 8, 48, 42, 89, 2, "steel", true);
    e.box("sink bowl", sx + 4, oz + 12, 40, 34, 90, 1, "dark", true);
    e.box("sink bottom", sx + 8, oz + 16, 32, 26, 91, 1, "water", true);
    e.box("tap", sx + 19, oz + 5, 4, 4, 91, 22, "steel");
    e.box("tap spout", sx + 19, oz + 5, 4, 17, 111, 3, "steel");
    e.box("chopping board", sx + 57, oz + 15, 27, 34, 89, 2, "oak", true);
  }
}
function diningTop(e: Emit, ox: number, oz: number, w: number, d: number) {
  e.box("dining table", ox, oz, w, d, 73, 5, "oak", true, true);
  legs(e, ox, oz, w, d, 73, true);
}
const diningSeats = (w: number) => (w > 100 ? 2 : 1);
const seatX = (ox: number, w: number, i: number) =>
  ox + (w / (diningSeats(w) + 1)) * (i + 1) - 20;
function diningPlates(e: Emit, cx: number, oz: number, d: number) {
  e.ellipse("dinner plate", cx + 8, oz + 8, 24, 24, 78, 2, "ceramic");
  e.ellipse("dinner plate", cx + 8, oz + d - 32, 24, 24, 78, 2, "ceramic");
}
function diningBowl(e: Emit, ox: number, oz: number, w: number, d: number) {
  if (d >= 82)
    e.ellipse(
      "table bowl",
      ox + w / 2 - 12,
      oz + d / 2 - 12,
      24,
      24,
      78,
      8,
      "clay",
    );
}
const diningTable: Gen = (e, ox, oz, w, d) => {
  diningTop(e, ox, oz, w, d);
  for (let i = 0; i < diningSeats(w); i++)
    diningPlates(e, seatX(ox, w, i), oz, d);
  diningBowl(e, ox, oz, w, d);
};
const sofa: Gen = (e, ox, oz, w, d) => {
  e.box("sofa base", ox, oz, w, d, 7, 29, "fabric", true, true);
  e.box("sofa back", ox, oz, w, 18, 35, 43, "fabric", true, true);
  for (const x of [0, w - 15])
    e.box("sofa arm", ox + x, oz, 15, d, 35, 23, "fabric", true, true);
  const count = w > 170 ? 3 : 2,
    cushion = (w - 36) / count;
  for (let i = 0; i < count; i++) {
    e.box(
      "seat cushion",
      ox + 18 + i * cushion,
      oz + 20,
      cushion - 3,
      d - 25,
      36,
      12,
      "cushion",
      true,
    );
    e.box(
      "back cushion",
      ox + 20 + i * cushion,
      oz + 18,
      cushion - 7,
      14,
      49,
      22,
      "cushion",
      true,
    );
  }
};
const coffeeTable: Gen = (e, ox, oz, w, d) => {
  e.box("coffee table", ox, oz, w, d, 38, 5, "oak", true, true);
  legs(e, ox, oz, w, d, 38, true);
  e.box("magazine", ox + w / 2 - 14, oz + 11, 28, 33, 43, 2, "linen");
};
const toilet: Gen = (e, ox, oz) => {
  e.box("toilet cistern", ox, oz, 42, 20, 0, 70, "ceramic", true);
  e.ellipse("toilet pedestal", ox + 7, oz + 18, 28, 39, 0, 38, "ceramic");
  e.ellipse("toilet bowl", ox, oz + 13, 42, 55, 38, 6, "ceramic");
  e.ellipse("toilet opening", ox + 8, oz + 23, 26, 35, 44, 1, "dark");
  e.ellipse("toilet water", ox + 13, oz + 29, 16, 24, 45, 1, "water");
};
const vanity: Gen = (e, ox, oz, w, d) => {
  e.box("vanity", ox + 2, oz, w - 2, d - 3, 0, 77, "oak", false, true);
  e.box("basin rim", ox, oz, w, d, 77, 8, "ceramic", true);
  e.ellipse("basin", ox + w - 46, oz + 8, 36, 28, 85, 1, "water");
  e.box("basin tap", ox + w - 29, oz + 2, 4, 4, 85, 14, "steel");
};
const shower: Gen = (e, ox, oz, w, d) => {
  e.box("shower tray", ox, oz, w, d, 0, 4, "ceramic");
  e.box("shower inset", ox + 5, oz + 5, w - 10, d - 10, 4, 1, "water");
  e.ellipse("shower drain", ox + w - 48, oz + d - 48, 10, 10, 5, 1, "steel");
  e.box("shower rail", ox + w - 6, oz + d - 44, 3, 3, 70, 125, "steel");
  e.ellipse("shower head", ox + w - 23, oz + d - 50, 18, 18, 195, 3, "steel");
};
const prayerShrine: Gen = (e, ox, oz, w, d) => {
  e.box("prayer platform", ox, oz, w, d, 0, 20, "oak", false, true);
  e.box("shrine back", ox + 5, oz, w - 10, 8, 20, 65, "timber", false, true);
  e.box("shrine shelf", ox + 5, oz, w - 10, d - 7, 55, 5, "oak", false, true);
  e.ellipse("lamp", ox + w / 2 - 7, oz + 22, 14, 14, 60, 12, "clay");
};
const diya: Gen = (e, ox, oz, w, d) => {
  e.ellipse("diya", ox, oz, w, d, 0, 4, "clay");
  e.ellipse("diya flame", ox + w / 2 - 2, oz + d / 2 - 2, 4, 4, 4, 5, "glow");
};
const prayerMat: Gen = (e, ox, oz, w, d) =>
  e.box("prayer mat", ox, oz, w, d, 0, 2, "fabric", true, true);
const desk: Gen = (e, ox, oz, w, d) => {
  e.box("desk", ox, oz, w, d, 70, 5, "oak", false, true);
  legs(e, ox, oz, w, d, 70, true);
  e.box("open book", ox + 24, oz + 15, 35, 26, 75, 2, "linen");
  e.box("desk screen", ox + w - 47, oz + 10, 39, 5, 80, 25, "dark");
};
const displayShelf: Gen = (e, ox, oz, w, d) => {
  for (const y of [10, 55, 100]) {
    e.box("display shelf", ox, oz, w, d, y, 5, "oak", false, true);
    for (let x = 10; x < w - 25; x += 48)
      e.box(
        "display goods",
        ox + x,
        oz + 6,
        27,
        26,
        y + 5,
        25,
        x % 3 ? "linen" : "clay",
      );
  }
  e.box("shelf back", ox, oz, w, 5, 0, 130, "timber", false, true);
};
const shopCounter: Gen = (e, ox, oz, w, d) => {
  e.box("shop counter", ox, oz, w, d, 0, 90, "cabinet", false, true);
  e.box("countertop", ox, oz, w, d, 90, 5, "stone");
  e.box("till", ox + w - 47, oz + 17, 35, 30, 95, 15, "dark");
};
const washingMachine: Gen = (e, ox, oz) => {
  e.box("washing machine", ox, oz, 60, 60, 0, 85, "ceramic", true);
  e.box("washer controls", ox + 3, oz + 60, 54, 2, 68, 10, "steel");
  // The dark horizontal lid reads from above while the front detail reads in orbit.
  e.ellipse("washer drum lid", ox + 10, oz + 12, 40, 37, 85, 1, "dark");
  e.ellipse("washer lid glass", ox + 15, oz + 17, 30, 27, 86, 1, "water");
};
const laundryCounter: Gen = (e, ox, oz, w, d) => {
  e.box("utility worktop", ox, oz, w, d, 84, 5, "oak", false, true);
  e.box("folded linen", ox + 9, oz + 10, 35, 31, 89, 10, "linen", true);
};

// ---------------------------------------------------------------------------
// Catalog-only parts (no automatic recipe uses these)
// ---------------------------------------------------------------------------
const wardrobe: Gen = (e, ox, oz, w, d) => {
  e.box("wardrobe", ox, oz, w, d - 2, 0, 205, "oak", false, true);
  const doors = w >= 100 ? 2 : 1,
    leaf = (w - 4) / doors;
  for (let i = 0; i < doors; i++) {
    e.box("wardrobe door", ox + 2 + i * leaf, oz + d - 2, leaf - 2, 2, 6, 192, "oak", false, true);
    e.box(
      "wardrobe handle",
      ox + 2 + i * leaf + (i === 0 && doors === 2 ? leaf - 8 : 4),
      oz + d - 1,
      2,
      1,
      90,
      30,
      "steel",
    );
  }
};
const dresser: Gen = (e, ox, oz, w, d) => {
  e.box("dresser", ox, oz, w, d, 0, 76, "oak", false, true);
  e.box("dresser top", ox, oz, w, d, 76, 4, "oak", false, true);
  for (const y of [10, 34, 58])
    e.box("drawer handle", ox + w / 2 - 12, oz + d - 1, 24, 1, y, 2, "steel");
  e.ellipse("dresser vase", ox + w - 26, oz + 10, 14, 14, 80, 24, "clay");
};
const armchair: Gen = (e, ox, oz, w, d) => {
  e.box("armchair base", ox, oz, w, d, 7, 33, "fabric", true, true);
  e.box("armchair back", ox, oz, w, 18, 40, 40, "fabric", true, true);
  for (const x of [0, w - 14])
    e.box("armchair arm", ox + x, oz, 14, d, 40, 20, "fabric", true, true);
  e.box("seat cushion", ox + 15, oz + 19, w - 30, d - 23, 40, 10, "cushion", true);
};
const sideTable: Gen = (e, ox, oz, w, d) => {
  e.box("side table", ox, oz, w, d, 50, 5, "oak", true, true);
  legs(e, ox, oz, w, d, 50, true);
};
const roundTable: Gen = (e, ox, oz, w, d) => {
  e.ellipse("round table", ox, oz, w, d, 73, 5, "oak", true);
  e.ellipse("table pedestal", ox + w / 2 - 10, oz + d / 2 - 10, 20, 20, 0, 73, "timber", true);
  e.ellipse("table bowl", ox + w / 2 - 12, oz + d / 2 - 12, 24, 24, 78, 8, "clay");
};
const bookshelf: Gen = (e, ox, oz, w, d) => {
  e.box("bookshelf back", ox, oz, w, 3, 0, 190, "oak", false, true);
  for (const x of [0, w - 3])
    e.box("bookshelf side", ox + x, oz, 3, d, 0, 190, "oak", false, true);
  const books: DetailMaterial[] = ["linen", "clay", "fabric", "cushion"];
  for (const [i, y] of [0, 46, 92, 138].entries()) {
    e.box("shelf", ox, oz, w, d, y, 3, "oak", false, true);
    e.box("books", ox + 5, oz + 4, w * 0.45, d - 8, y + 3, 26, books[i % 4]);
    e.box("books", ox + w * 0.55, oz + 4, w * 0.3, d - 8, y + 3, 22, books[(i + 2) % 4]);
  }
  e.box("shelf", ox, oz, w, d, 186, 4, "oak", false, true);
};
const mediaUnit: Gen = (e, ox, oz, w, d) => {
  e.box("media cabinet", ox, oz, w, d, 0, 48, "oak", false, true);
  const screen = Math.min(140, w - 20);
  e.box("tv stand", ox + w / 2 - 15, oz + 8, 30, 15, 48, 4, "dark");
  e.box("tv screen", ox + (w - screen) / 2, oz + 12, screen, 4, 52, screen * 0.56, "dark");
};
const kitchenSink: Gen = (e, ox, oz, w, d) => {
  kitchenCounter(e, ox, oz, w, d, false);
  const x = ox + w / 2 - 24;
  e.box("sink rim", x, oz + 8, 48, 42, 89, 2, "steel", true);
  e.box("sink bowl", x + 4, oz + 12, 40, 34, 90, 1, "dark", true);
  e.box("sink bottom", x + 8, oz + 16, 32, 26, 91, 1, "water", true);
  e.box("tap", x + 22, oz + 5, 4, 4, 91, 22, "steel");
  e.box("tap spout", x + 22, oz + 5, 4, 17, 111, 3, "steel");
};
const kitchenStove: Gen = (e, ox, oz, w, d) => {
  kitchenCounter(e, ox, oz, w, d, false);
  const hobX = ox + w / 2 - 26;
  e.box("hob", hobX, oz + 8, 52, 43, 89, 2, "dark", true);
  for (const dx of [8, 31])
    for (const dz of [5, 26]) {
      e.ellipse("burner", hobX + dx, oz + 8 + dz, 13, 13, 91, 1, "steel");
      e.ellipse("burner center", hobX + dx + 3, oz + 11 + dz, 7, 7, 92, 1, "dark");
    }
};
const kitchenUpper: Gen = (e, ox, oz, w, d) => {
  e.box("wall cabinet", ox, oz, w, d, 145, 70, "cabinet", false, true);
  e.box("cabinet handle", ox + w / 2 - 12, oz + d, 24, 2, 150, 2, "steel");
};
const fridge: Gen = (e, ox, oz, w, d) => {
  e.box("fridge", ox, oz, w, d - 2, 0, 190, "ceramic", true, true);
  e.box("fridge door", ox + 2, oz + d - 2, w - 4, 2, 4, 182, "ceramic", true, true);
  e.box("fridge handle", ox + w - 10, oz + d, 3, 2, 100, 50, "steel");
};
const kitchenIsland: Gen = (e, ox, oz, w, d) => {
  e.box("island cabinets", ox + 3, oz + 3, w - 6, d - 6, 0, 84, "cabinet", false, true);
  e.box("island top", ox, oz, w, d, 84, 5, "stone");
  e.ellipse("fruit bowl", ox + w / 2 - 14, oz + d / 2 - 14, 28, 28, 89, 8, "clay");
};
const mirror: Gen = (e, ox, oz, w, d) => {
  e.box("mirror frame", ox, oz, w, d, 106, 88, "oak", false, true);
  e.box("mirror glass", ox + 4, oz + d - 1, w - 8, 1, 110, 80, "water");
};
const bathtub: Gen = (e, ox, oz, w, d) => {
  e.box("bathtub", ox, oz, w, d, 0, 58, "ceramic", true);
  e.ellipse("bath water", ox + 8, oz + 8, w - 16, d - 16, 48, 2, "water");
  e.box("bath tap", ox + 4, oz + d / 2 - 2, 8, 4, 58, 12, "steel");
};
const rugRect: Gen = (e, ox, oz, w, d) =>
  e.box("rug", ox, oz, w, d, 0, 1, "fabric", true, true);
const rugRound: Gen = (e, ox, oz, w, d) =>
  e.ellipse("rug", ox, oz, w, d, 0, 1, "fabric", true);
const plant =
  (pot: number, potHeight: number): Gen =>
  (e, ox, oz, w, d) => {
    e.ellipse("plant pot", ox + (w - pot) / 2, oz + (d - pot) / 2, pot, pot, 0, potHeight, "clay");
    e.ellipse("foliage", ox, oz, w, d, potHeight, potHeight * 2.4, "leaf");
  };
const floorLamp: Gen = (e, ox, oz, w, d) => {
  e.ellipse("lamp base", ox + w / 2 - 14, oz + d / 2 - 14, 28, 28, 0, 3, "steel");
  e.box("lamp pole", ox + w / 2 - 2, oz + d / 2 - 2, 4, 4, 3, 125, "steel");
  e.ellipse("lamp shade", ox, oz, w, d, 128, 32, "glow", true);
};
const pendantLight: Gen = (e, ox, oz, w, d) => {
  e.box("pendant cord", ox + w / 2 - 1, oz + d / 2 - 1, 2, 2, 225, 60, "dark");
  e.ellipse("pendant shade", ox, oz, w, d, 200, 25, "glow", true);
};

// ---------------------------------------------------------------------------
// Designer pack (plan view and the fallback while the GLB kit loads). Wall
// pieces emit absolute heights like the mirror; decor pieces emit from their
// own base and are lifted onto the surface below them by `furnitureParts`.
// ---------------------------------------------------------------------------
const curtains: Gen = (e, ox, oz, w, d) => {
  const panel = Math.min(45, w * 0.24);
  e.box("curtain rod", ox, oz + 2, w, 4, 238, 4, "steel");
  for (const x of [0, w - panel]) {
    e.box("drape", ox + x, oz + 3, panel, d - 3, 0, 238, "fabric", true, true);
    e.box("tie-back", ox + x + panel / 2 - 3, oz + d - 2, 6, 2, 100, 6, "steel");
  }
};
const wallArt: Gen = (e, ox, oz, w, d) => {
  e.box("picture frame", ox, oz, w, d - 1, 135, 60, "timber");
  e.box("print", ox + 6, oz + d - 1, w - 12, 1, 141, 48, "linen");
  e.box("print motif", ox + w * 0.28, oz + d - 1, w * 0.44, 1, 143, 34, "clay", false, true);
  e.ellipse("print sun", ox + w * 0.68, oz + d - 1, 10, 1, 170, 10, "clay");
};
const tvPanel: Gen = (e, ox, oz, w, d) => {
  e.box("fluted panel", ox, oz, w, 6, 0, 200, "timber", false, true);
  e.box("tv console", ox + w * 0.08, oz + 6, w * 0.84, d - 6, 15, 30, "oak", false, true);
  e.box("tv screen", ox + w / 2 - 60, oz + 6, 120, 4, 85, 70, "dark");
};
const ceilingFan: Gen = (e, ox, oz, w, d) => {
  e.box("fan downrod", ox + w / 2 - 1.5, oz + d / 2 - 1.5, 3, 3, 258, 22, "steel");
  e.ellipse("fan motor", ox + w / 2 - 12, oz + d / 2 - 12, 24, 24, 248, 10, "steel");
  e.box("fan blade", ox, oz + d / 2 - 7, w, 14, 251, 2, "oak", false, true);
  e.box("fan blade", ox + w / 2 - 7, oz, 14, d, 251, 2, "oak", false, true);
};
const wallLight: Gen = (e, ox, oz, w, d) => {
  e.box("sconce plate", ox + w / 2 - 5, oz, 10, 3, 163, 18, "steel");
  e.ellipse("sconce shade", ox + 2, oz + 3, w - 4, d - 3, 170, 16, "glow");
};
const tableLamp: Gen = (e, ox, oz, w, d) => {
  e.ellipse("lamp base", ox + w / 2 - 8, oz + d / 2 - 8, 16, 16, 0, 24, "clay", true);
  e.ellipse("lamp shade", ox, oz, w, d, 28, 24, "glow");
};
const jhula: Gen = (e, ox, oz, w, d) => {
  for (const x of [0, w - 8]) e.box("swing post", ox + x, oz, 8, d, 0, 200, "timber", false, true);
  e.box("swing beam", ox, oz + d / 2 - 5, w, 10, 200, 10, "timber", false, true);
  const sw = Math.min(130, w - 30);
  for (const x of [6, sw - 8])
    e.box("swing chain", ox + (w - sw) / 2 + x, oz + d / 2 - 1, 2, 2, 50, 150, "steel");
  e.box("swing seat", ox + (w - sw) / 2, oz + d / 2 - 27, sw, 55, 42, 8, "oak", false, true);
  e.box("swing cushion", ox + (w - sw) / 2 + 6, oz + d / 2 - 22, sw - 12, 45, 50, 6, "fabric", true);
};
const diwan: Gen = (e, ox, oz, w, d) => {
  e.box("diwan base", ox, oz, w, d, 10, 18, "timber");
  legs(e, ox, oz, w, d, 10);
  e.box("diwan mattress", ox + 2, oz + 2, w - 4, d - 4, 28, 12, "fabric", true, true);
  e.box("back cushion", ox + 18, oz, w - 36, 18, 40, 22, "cushion", true);
  for (const x of [0, w - 16]) e.box("bolster", ox + x, oz + 6, 16, d - 12, 40, 16, "linen", true);
};
const shoeRack: Gen = (e, ox, oz, w, d) => {
  e.box("shoe rack", ox, oz, w, d, 30, 65, "oak", false, true);
  e.box("shoe shelf", ox, oz, w, d, 0, 6, "oak", false, true);
  for (const x of [8, w / 2 + 4]) e.box("shoes", ox + x, oz + 6, w / 2 - 14, d - 10, 6, 10, "clay", true);
};
const sideboard: Gen = (e, ox, oz, w, d) => {
  e.box("sideboard", ox, oz, w, d, 14, 71, "oak", false, true);
  legs(e, ox, oz, w, d, 14, true);
  e.ellipse("crockery jar", ox + 8, oz + d / 2 - 8, 16, 16, 85, 18, "ceramic");
};
const consoleTable: Gen = (e, ox, oz, w, d) => {
  e.box("console top", ox, oz, w, d, 74, 6, "oak", false, true);
  legs(e, ox, oz, w, d, 74, true);
  e.box("console shelf", ox + 4, oz + 4, w - 8, d - 8, 18, 3, "oak", false, true);
};
const ottoman: Gen = (e, ox, oz, w, d) =>
  e.ellipse("pouf", ox, oz, w, d, 0, 42, "fabric", true);
const bedPanel: Gen = (e, ox, oz, w, d) => {
  e.box("headboard panel", ox, oz, w, d, 0, 115, "fabric", true, true);
  e.box("panel trim", ox, oz, w, d - 2, 112, 3, "oak");
};
const chimney: Gen = (e, ox, oz, w, d) => {
  e.box("chimney hood", ox, oz, w, d, 165, 26, "dark", false, true);
  e.box("chimney duct", ox + w / 2 - 14, oz, 28, 25, 191, 84, "dark", false, true);
};
const backsplash: Gen = (e, ox, oz, w, d) =>
  e.box("backsplash tiles", ox, oz, w, d, 90, 55, "ceramic", false, true);
const mirrorCabinet: Gen = (e, ox, oz, w, d) => {
  e.box("mirror cabinet", ox, oz, w, d - 2, 110, 70, "oak", false, true);
  e.box("mirror glass", ox + 3, oz + d - 2, w - 6, 2, 113, 64, "water");
  e.box("cabinet light", ox + 5, oz + d - 4, w - 10, 2, 109, 1, "glow");
};
const cushionSet: Gen = (e, ox, oz, w, d) => {
  const side = Math.min(38, w / 3);
  e.box("cushion", ox, oz, side, d, 0, 38, "fabric", true, true);
  e.box("cushion", ox + w - side, oz, side, d, 0, 38, "fabric", true, true);
  e.box("accent cushion", ox + w / 2 - side * 0.45, oz + 2, side * 0.9, d - 2, 0, 32, "cushion", true);
};
const vaseBooks: Gen = (e, ox, oz, w, d) => {
  e.box("books", ox, oz + 4, w * 0.55, d - 8, 0, 8, "linen");
  e.box("books", ox + 2, oz + 6, w * 0.5, d - 12, 8, 5, "clay", false, true);
  e.ellipse("vase", ox + w - 18, oz + d / 2 - 8, 16, 16, 0, 22, "ceramic");
  e.ellipse("sprig", ox + w - 20, oz + d / 2 - 10, 20, 20, 22, 16, "leaf");
};

const GENERATORS: Record<string, Gen> = {
  "bed-double": bed,
  "bed-single": bed,
  "sleeping-mat": sleepingMat,
  "bedside-table": bedsideTable,
  wardrobe,
  dresser,
  "sofa-3": sofa,
  "sofa-2": sofa,
  armchair,
  "dining-chair": (e, ox, oz, w, d) => chair(e, ox, oz, w, d, "north", true),
  "office-chair": (e, ox, oz, w, d) => chair(e, ox, oz, w, d, "north", true),
  "coffee-table": coffeeTable,
  "side-table": sideTable,
  "dining-table": diningTable,
  "dining-table-round": roundTable,
  desk,
  bookshelf,
  "media-unit": mediaUnit,
  // Like the tiled GLB run: a sink and a hob only from 2 m, else plain cabinets.
  "kitchen-counter": (e, ox, oz, w, d) =>
    kitchenCounter(e, ox, oz, w, d, w >= 200),
  "kitchen-base": (e, ox, oz, w, d) => kitchenCounter(e, ox, oz, w, d, false),
  "kitchen-sink": kitchenSink,
  "kitchen-stove": kitchenStove,
  "kitchen-upper": kitchenUpper,
  fridge,
  "kitchen-island": kitchenIsland,
  toilet,
  vanity,
  mirror,
  shower,
  bathtub,
  "washing-machine": washingMachine,
  "laundry-counter": laundryCounter,
  "display-shelf": displayShelf,
  "display-shelf-module": displayShelf,
  "shop-counter": shopCounter,
  "prayer-shrine": prayerShrine,
  "prayer-mat": prayerMat,
  diya,
  "rug-rect": rugRect,
  "rug-round": rugRound,
  "plant-floor": plant(28, 35),
  "plant-small": plant(18, 18),
  "floor-lamp": floorLamp,
  "pendant-light": pendantLight,
  curtains,
  "wall-art": wallArt,
  "tv-panel": tvPanel,
  "ceiling-fan": ceilingFan,
  "wall-light": wallLight,
  "table-lamp": tableLamp,
  jhula,
  diwan,
  "shoe-rack": shoeRack,
  sideboard,
  "console-table": consoleTable,
  ottoman,
  "bed-panel": bedPanel,
  "kitchen-chimney": chimney,
  backsplash,
  "backsplash-module": backsplash,
  "mirror-cabinet": mirrorCabinet,
  cushions: cushionSet,
  "vase-books": vaseBooks,
};
export const hasFurnitureParts = (catalogId: string) => catalogId in GENERATORS;

// ---------------------------------------------------------------------------
// Tiled items (kitchen counter runs, display shelving, backsplashes)
// ---------------------------------------------------------------------------
/** Module sequence for a tiled item: local x centres (cm) and the scale. */
export function tileModules(
  entry: FurnitureCatalogItem,
  width: number,
): { model: string; x: number; scale: number }[] {
  const tile = entry.tile as Record<string, string | number> | undefined;
  if (!tile) return [];
  const module = String(tile.module);
  const mw = Number(tile.moduleWidth ?? 60);
  let seq: { model: string; w: number }[] = [];
  const sink = tile.sink ? String(tile.sink) : null,
    end = tile.end ? String(tile.end) : null;
  const sw = Number(tile.sinkWidth ?? 80),
    ew = Number(tile.endWidth ?? 60);
  if (sink && end && width >= sw + ew + mw) {
    const n = Math.max(0, Math.round((width - sw - ew) / mw));
    const a = Math.floor(n / 2);
    seq = [
      ...Array.from({ length: a }, () => ({ model: module, w: mw })),
      { model: sink, w: sw },
      ...Array.from({ length: n - a }, () => ({ model: module, w: mw })),
      { model: end, w: ew },
    ];
  } else {
    const n = Math.max(1, Math.round(width / mw));
    seq = Array.from({ length: n }, () => ({ model: module, w: mw }));
  }
  const total = seq.reduce((s, m) => s + m.w, 0);
  const scale = width / total;
  let cursor = -width / 2;
  return seq.map((m) => {
    const x = cursor + (m.w * scale) / 2;
    cursor += m.w * scale;
    return { model: m.model, x, scale };
  });
}

// ---------------------------------------------------------------------------
// Automatic layouts: designer recipes in a canonical frame
// ---------------------------------------------------------------------------
// A recipe furnishes a W×D frame (the room inset by AUTO_INSET) with its main
// wall to the north (z = 0); `autoFurnishing` runs it with the room turned a
// quarter turn at a time and keeps the best score. Pieces go in priority
// order and each one is kept only when it fits: inside the frame, 5 cm clear
// of pieces in its layer, out of every door approach, off door openings,
// tall pieces off windows, wall-hung pieces never behind taller furniture,
// and either snug (≤ 10 cm) or a full 80 cm walkway away from the major
// pieces of other groups. Small rooms simply keep fewer optional pieces.
export type AutoLayoutKind = RoomKind | "study" | "prayer";
/** An opening along a canonical wall: its span (cm along the wall) and height. */
export type WallSpan = { a: number; b: number; y0: number; y1: number };
export type LayoutContext = {
  /** Door approaches in the canonical frame. */
  doors: Rect[];
  /** Door openings and windows along each canonical wall. */
  walls: Record<EdgeSide, { doors: WallSpan[]; windows: WallSpan[] }>;
};
export type AutoPlacement = {
  catalogId: string;
  /** Footprint in the canonical (unturned) inset frame. */
  rect: Rect;
  /** Item-local size, before the item's own rotation. */
  w: number;
  d: number;
  /** Direction the item's back faces in the canonical frame. */
  rotation: QuarterTurn;
  /** Pieces that belong together (a bed and its bedside tables). */
  group: string;
};
export type AutoLayout = { items: AutoPlacement[]; score: number };
type LayoutFn = (room: Room, w: number, d: number, ctx: LayoutContext) => AutoLayout;

/** Clear width kept between groups of furniture. */
export const AUTO_WALKWAY = 80;
const SNUG = 10;
/** Same-layer pieces keep this gap so snapping to the 5 cm grid never overlaps them. */
const LAYER_GAP = 5;
const SIDES: readonly EdgeSide[] = ["north", "east", "south", "west"];
const noWalls = (): LayoutContext["walls"] => ({
  north: { doors: [], windows: [] },
  east: { doors: [], windows: [] },
  south: { doors: [], windows: [] },
  west: { doors: [], windows: [] },
});
/** A room with no doors or windows (tests, rooms in the tray). */
export const openContext = (): LayoutContext => ({ doors: [], walls: noWalls() });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Placed = AutoPlacement & {
  entry: FurnitureCatalogItem;
  side: EdgeSide | null;
  base: number;
  top: number;
};
type PlaceOpts = {
  group?: string;
  weight?: number;
  /** The wall the piece's back is against (door/window rules); null for none. */
  side?: EdgeSide | null;
  /** Item-local size (defaults to the catalog size). */
  w?: number;
  d?: number;
};
/** Edge-to-edge distance between two footprints (0 when touching or overlapping). */
export function footprintGap(a: Rect, b: Rect) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dz = Math.max(0, Math.max(a.z, b.z) - Math.min(a.z + a.d, b.z + b.d));
  return dx && dz ? Math.hypot(dx, dz) : dx + dz;
}
const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, z: r.z - m, w: r.w + 2 * m, d: r.d + 2 * m });
const hung = (p: Placed) => p.entry.layer === "high" || p.entry.layer === "wall";
/** Pieces used from the front (doors, drawers, a worktop) keep it clear. */
const FRONT_ACCESS = new Set([
  "wardrobe",
  "dresser",
  "bookshelf",
  "sideboard",
  "shoe-rack",
  "console-table",
  "tv-panel",
  "media-unit",
  "kitchen-counter",
  "fridge",
  "washing-machine",
  "laundry-counter",
  "vanity",
  "toilet",
  "display-shelf",
]);
const FRONT_CLEAR = 70;
/** The strip in front of a front-access piece (inset 10 cm at the sides). */
function frontZone(p: Placed): Rect | null {
  if (!FRONT_ACCESS.has(p.catalogId)) return null;
  const r = p.rect,
    f = FRONT_CLEAR;
  switch (p.rotation) {
    case 0:
      return { x: r.x + 10, z: r.z + r.d, w: r.w - 20, d: f };
    case 180:
      return { x: r.x + 10, z: r.z - f, w: r.w - 20, d: f };
    case 90:
      return { x: r.x - f, z: r.z + 10, w: f, d: r.d - 20 };
    case 270:
      return { x: r.x + r.w, z: r.z + 10, w: f, d: r.d - 20 };
  }
}
const major = (p: Placed) =>
  p.entry.layer === "standard" && p.entry.blocksWalk && p.group !== "accent";
/** Local +x and +z (front) of an item turned to `rotation`, in frame axes. */
const AXES: Record<QuarterTurn, { x: [number, number]; z: [number, number] }> = {
  0: { x: [1, 0], z: [0, 1] },
  90: { x: [0, 1], z: [-1, 0] },
  180: { x: [-1, 0], z: [0, -1] },
  270: { x: [0, -1], z: [1, 0] },
};
const SIDE_TURN: Record<EdgeSide, QuarterTurn> = { north: 0, east: 90, south: 180, west: 270 };

/** Centres to try along a wall: the preferred one, then outward in 10 cm steps. */
function centresAlong(length: number, size: number, prefer: number, step = 10): number[] {
  const lo = size / 2,
    hi = length - size / 2;
  if (hi < lo - 0.01) return [];
  const out: number[] = [];
  const add = (v: number) => {
    const c = clamp(v, lo, hi);
    if (!out.some((o) => Math.abs(o - c) < 0.5)) out.push(c);
  };
  add(prefer);
  for (let k = step; k <= length; k += step) {
    add(prefer - k);
    add(prefer + k);
  }
  return out;
}

function designer(W: number, D: number, ctx: LayoutContext, room: Pick<Room, "name"> = { name: "" }) {
  const placed: Placed[] = [];
  let score = 0;
  const len = (side: EdgeSide) => (side === "north" || side === "south" ? W : D);
  const spanOf = (r: Rect, side: EdgeSide): [number, number] =>
    side === "north" || side === "south" ? [r.x, r.x + r.w] : [r.z, r.z + r.d];
  /** Highest surface under a point (decor rests on it), else the floor. */
  const surfaceAt = (x: number, z: number) => {
    let y = 0;
    for (const o of placed) {
      const s = o.entry.surface;
      if (s === undefined || o.entry.layer !== "standard") continue;
      const r = o.rect;
      if (x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d) y = Math.max(y, s);
    }
    return y;
  };
  const fits = (p: Placed): boolean => {
    const r = p.rect,
      layer = p.entry.layer;
    if (!(r.w > 0 && r.d > 0)) return false;
    if (r.x < -0.01 || r.z < -0.01 || r.x + r.w > W + 0.01 || r.z + r.d > D + 0.01) return false;
    if ((layer === "standard" || layer === "decor") && ctx.doors.some((d) => overlaps(d, r)))
      return false;
    if (p.side) {
      const [a, b] = spanOf(r, p.side);
      const wall = ctx.walls[p.side];
      const across = (s: WallSpan, margin: number) => a < s.b + margin && b > s.a - margin;
      // Nothing on a wall over a doorway (with its architrave).
      if (wall.doors.some((s) => across(s, 8) && p.base < s.y1)) return false;
      // Only low pieces (a bed, a counter, a sofa) may stand under a window.
      if (
        p.catalogId !== "curtains" &&
        wall.windows.some((s) => across(s, 0) && p.top > s.y0 + 15 && p.base < s.y1)
      )
        return false;
    }
    for (const o of placed) {
      const ol = o.entry.layer;
      if (ol === layer && overlaps(grow(o.rect, LAYER_GAP / 2), grow(r, LAYER_GAP / 2)))
        return false;
      // Wall-hung pieces never hide behind (or cut into) taller furniture.
      if (hung(p) && ol === "standard" && o.top > p.base + 5 && overlaps(o.rect, r)) return false;
      if (layer === "standard" && hung(o) && p.top > o.base + 5 && overlaps(o.rect, r)) return false;
      if (major(p) && major(o) && o.group !== p.group) {
        const g = footprintGap(o.rect, r);
        if (g > SNUG && g < AUTO_WALKWAY) return false;
        // Only pieces lined up along walls may sit snug against another group.
        if (g <= SNUG && !(p.side && o.side)) return false;
        const pf = frontZone(p),
          of = frontZone(o);
        if ((pf && overlaps(pf, o.rect)) || (of && overlaps(of, r))) return false;
      }
    }
    return true;
  };
  const b = {
    W,
    D,
    ctx,
    room,
    placed,
    len,
    /** Places a piece with this footprint; null (and nothing changes) if it doesn't fit. */
    at(catalogId: string, rect: Rect, rotation: QuarterTurn, opts: PlaceOpts = {}): Placed | null {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      const turned = rotation % 180 !== 0;
      const w = Math.round(opts.w ?? (turned ? rect.d : rect.w)),
        d = Math.round(opts.d ?? (turned ? rect.w : rect.d));
      const ok = (key: "w" | "d", v: number) => {
        const range = entry.stretch?.[key];
        return range ? v >= range[0] && v <= range[1] : v === entry.size[key];
      };
      if (!ok("w", w) || !ok("d", d)) return null;
      const fw = turned ? d : w,
        fd = turned ? w : d;
      const r = {
        x: rect.x + (rect.w - fw) / 2,
        z: rect.z + (rect.d - fd) / 2,
        w: fw,
        d: fd,
      };
      const base =
        entry.layer === "decor" ? surfaceAt(r.x + r.w / 2, r.z + r.d / 2) : (entry.mountY ?? 0);
      const p: Placed = {
        catalogId,
        rect: r,
        w,
        d,
        rotation,
        group: opts.group ?? "accent",
        entry,
        side: opts.side ?? null,
        base,
        top: base + entry.size.h,
      };
      if (!fits(p)) return null;
      placed.push(p);
      score += opts.weight ?? 1;
      return p;
    },
    /** Places a piece with its back to a wall, centred `center` along it. */
    wall(
      catalogId: string,
      side: EdgeSide,
      center: number,
      opts: PlaceOpts & { off?: number } = {},
    ): Placed | null {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      const w = Math.round(opts.w ?? entry.size.w),
        d = Math.round(opts.d ?? entry.size.d),
        off = opts.off ?? 0;
      const rect =
        side === "north"
          ? { x: center - w / 2, z: off, w, d }
          : side === "south"
            ? { x: center - w / 2, z: D - off - d, w, d }
            : side === "west"
              ? { x: off, z: center - w / 2, w: d, d: w }
              : { x: W - off - d, z: center - w / 2, w: d, d: w };
      return b.at(catalogId, rect, SIDE_TURN[side], {
        ...opts,
        w,
        d,
        side: opts.side === undefined ? side : opts.side,
      });
    },
    /** First centre along a wall where the piece fits. */
    wallScan(catalogId: string, side: EdgeSide, prefer: number, opts: PlaceOpts & { off?: number; reach?: number } = {}) {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      const w = opts.w ?? entry.size.w;
      for (const c of centresAlong(len(side), w, prefer)) {
        if (opts.reach !== undefined && Math.abs(c - prefer) > opts.reach) continue;
        const p = b.wall(catalogId, side, c, opts);
        if (p) return p;
      }
      return null;
    },
    /** A decor piece on a host, at local offsets from the host's centre (+z toward its front). */
    on(catalogId: string, host: Placed, along = 0, front = 0, opts: PlaceOpts = {}) {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      const ax = AXES[host.rotation];
      const cx = host.rect.x + host.rect.w / 2 + ax.x[0] * along + ax.z[0] * front,
        cz = host.rect.z + host.rect.d / 2 + ax.x[1] * along + ax.z[1] * front;
      const turned = host.rotation % 180 !== 0;
      const fw = turned ? entry.size.d : entry.size.w,
        fd = turned ? entry.size.w : entry.size.d;
      return b.at(catalogId, { x: cx - fw / 2, z: cz - fd / 2, w: fw, d: fd }, host.rotation, {
        group: host.group,
        ...opts,
      });
    },
    /** A rug trimmed clear of other groups' furniture; null when too small. */
    rug(catalogId: string, rect: Rect, group: string, weight = 1): Placed | null {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      let x0 = Math.max(0, rect.x),
        z0 = Math.max(0, rect.z),
        x1 = Math.min(W, rect.x + rect.w),
        z1 = Math.min(D, rect.z + rect.d);
      for (let k = 0; k < 16; k++) {
        const cur = { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
        const hit = placed.find(
          (o) =>
            (o.entry.layer === "standard" && o.group !== group && overlaps(grow(o.rect, 10), cur)) ||
            (o.entry.layer === "floor" && overlaps(grow(o.rect, LAYER_GAP), cur)),
        );
        if (!hit) break;
        const o = grow(hit.rect, 10);
        const options: Array<[number, number, number, number]> = [
          [x0, z0, x1, Math.min(z1, o.z)],
          [x0, Math.max(z0, o.z + o.d), x1, z1],
          [x0, z0, Math.min(x1, o.x), z1],
          [Math.max(x0, o.x + o.w), z0, x1, z1],
        ];
        const area = (q: [number, number, number, number]) =>
          Math.max(0, q[2] - q[0]) * Math.max(0, q[3] - q[1]);
        const best = options.reduce((m, q) => (area(q) > area(m) ? q : m));
        [x0, z0, x1, z1] = best;
      }
      const sw = entry.stretch?.w ?? [entry.size.w, entry.size.w],
        sd = entry.stretch?.d ?? [entry.size.d, entry.size.d];
      let w = Math.floor(Math.min(x1 - x0, sw[1])),
        d = Math.floor(Math.min(z1 - z0, sd[1]));
      if (w < sw[0] || d < sd[0]) return null;
      w -= w % 10;
      d -= d % 10;
      if (w < sw[0] || d < sd[0]) return null;
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      return b.at(catalogId, { x: cx - w / 2, z: cz - d / 2, w, d }, 0, { group, weight });
    },
    /** A small piece in the first free corner (corners away from the main wall first). */
    corner(catalogId: string, weight = 1, group = "accent"): Placed | null {
      const entry = CATALOG.get(catalogId);
      if (!entry) return null;
      const w = entry.size.w,
        d = entry.size.d;
      for (const [x, z] of [
        [W - w, D - d],
        [0, D - d],
        [W - w, 0],
        [0, 0],
      ]) {
        const p = b.at(catalogId, { x, z, w, d }, 0, { group, weight });
        if (p) return p;
      }
      return null;
    },
    bonus(n: number) {
      score += n;
    },
    checkpoint: () => ({ n: placed.length, score }),
    restore(cp: { n: number; score: number }) {
      placed.length = cp.n;
      score = cp.score;
    },
    done: (): AutoLayout => ({
      items: placed.map(({ catalogId, rect, w, d, rotation, group }) => ({
        catalogId,
        rect,
        w,
        d,
        rotation,
        group,
      })),
      score,
    }),
  };
  return b;
}
type Designer = ReturnType<typeof designer>;

/** Curtains on up to `max` windows, each a little wider than its window. */
function curtainsOnWindows(b: Designer, max = 2) {
  let n = 0;
  for (const side of SIDES)
    for (const s of b.ctx.walls[side].windows) {
      if (n >= max) return;
      const a = Math.max(0, s.a - 25),
        z = Math.min(b.len(side), s.b + 25);
      const w = Math.round(clamp(z - a, 100, 400));
      if (w > b.len(side)) continue;
      if (b.wall("curtains", side, (a + z) / 2, { w, weight: 3, group: "accent" })) n++;
    }
}
/** A ceiling fan over a point, in rooms tall and wide enough for one. */
function fanOver(b: Designer, x: number, z: number) {
  if (Math.min(b.W, b.D) < 220) return null;
  return b.at("ceiling-fan", { x: x - 60, z: z - 60, w: 120, d: 120 }, 0, { weight: 2 });
}
const doorOn = (ctx: LayoutContext, side: EdgeSide) => ctx.walls[side].doors.length > 0;

/** Bed options: [catalog id, width, length, weight]. */
const BEDS: Array<[string, number, number, number]> = [
  ["bed-double", 160, 210, 100],
  ["bed-double", 140, 200, 96],
  ["bed-single", 100, 200, 90],
  ["bed-single", 90, 190, 88],
];
function furnishBedroom(b: Designer, [id, w, d, weight]: [string, number, number, number]) {
  const { W, D, ctx } = b;
  let bed: Placed | null = null;
  if (w <= W && d + 10 <= D)
    for (const c of centresAlong(W, w, W / 2)) {
      bed = b.wall(id, "north", c, { w, d, off: 10, group: "sleep", weight });
      if (bed) {
        b.bonus(-Math.abs(c - W / 2) / 20);
        break;
      }
    }
  if (!bed) {
    // A folded sleeping mat marks a sleeping space too small for a bed.
    const w = Math.min(76, W),
      d = Math.min(115, D);
    if (w >= 40 && d >= 40)
      for (const c of centresAlong(W, w, W / 2))
        if (b.wall("sleeping-mat", "north", c, { w, d, group: "sleep", weight: 40, side: null })) break;
    return;
  }
  const cx = bed.rect.x + bed.rect.w / 2,
    bw = bed.rect.w;
  // The focal wall: a door facing or beside the bed reads well, never behind it.
  if (doorOn(ctx, "north")) b.bonus(-15);
  if (doorOn(ctx, "south")) b.bonus(8);
  else if (doorOn(ctx, "east") || doorOn(ctx, "west")) b.bonus(4);
  if (ctx.walls.north.windows.some((s) => s.a < bed!.rect.x + bw && s.b > bed!.rect.x)) b.bonus(-3);
  // Upholstered panel behind the bed, spanning the bedside tables.
  const panelW = Math.round(Math.min(bw + 110, W, 360));
  if (panelW >= 140) b.wall("bed-panel", "north", cx, { w: panelW, group: "sleep", weight: 6 });
  for (const x of [bed.rect.x - 5 - 45, bed.rect.x + bw + 5]) {
    const table = b.at("bedside-table", { x, z: 10, w: 45, d: 40 }, 0, {
      group: "sleep",
      weight: 10,
      side: "north",
    });
    if (table) b.on("table-lamp", table, 0, -2, { weight: 2 });
  }
  b.wall("wall-art", "north", cx, { group: "sleep", weight: 4 });
  if (bed.catalogId === "bed-double") b.on("cushions", bed, 0, -bed.d / 2 + 63, { weight: 2 });
  // Wardrobe on a side wall, else facing the bed.
  const sideSpots: Array<[EdgeSide, (w: number) => number]> = [
    ["east", (w) => D - w / 2],
    ["west", (w) => D - w / 2],
    ["east", (w) => w / 2],
    ["west", (w) => w / 2],
  ];
  const endSpots: Array<[EdgeSide, (w: number) => number]> = [
    ["south", (w) => W - w / 2],
    ["south", (w) => w / 2],
    ["south", () => W / 2],
  ];
  wardrobe: for (const spots of [sideSpots, endSpots])
    for (const w of [150, 120, 100, 80])
      for (const [side, at] of spots)
        if (b.wall("wardrobe", side, at(w), { w, group: "store", weight: 25 })) break wardrobe;
  // A reading corner in roomy bedrooms.
  if (W >= 360 && D >= 380)
    for (const x of [W - 85, 0]) {
      const chair = b.at("armchair", { x, z: D - 85, w: 85, d: 85 }, 180, { group: "read", weight: 6 });
      if (chair) {
        b.at("floor-lamp", { x: x === 0 ? 90 : W - 135, z: D - 45, w: 40, d: 40 }, 0, { weight: 2 });
        break;
      }
    }
  b.rug(
    "rug-rect",
    { x: cx - (bw + 100) / 2, z: bed.rect.z + 75, w: bw + 100, d: Math.min(180, D - bed.rect.z - 75) },
    "sleep",
    4,
  );
  curtainsOnWindows(b);
  fanOver(b, W / 2, Math.max(D / 2, bed.rect.z + bed.rect.d * 0.6));
  b.corner("plant-floor", 2);
}

/** Sofa options: [catalog id, width, depth]. */
const SOFAS: Array<[string, number, number]> = [
  ["sofa-3", 240, 90],
  ["sofa-3", 220, 90],
  ["sofa-3", 180, 85],
  ["sofa-2", 160, 85],
  ["sofa-2", 130, 80],
  ["sofa-2", 100, 75],
];
function furnishLiving(b: Designer, [id, w, d]: [string, number, number]) {
  const { W, D, ctx } = b;
  let sofa: Placed | null = null;
  if (w <= Math.max(W * 0.72, 100) && d <= D)
    for (const c of centresAlong(W, w, W / 2)) {
      // A bigger sofa wins only when the rest of the room still works.
      sofa = b.wall(id, "north", c, { w, d, group: "seat", weight: 90 + w / 20 });
      if (sofa) {
        b.bonus(-Math.abs(c - W / 2) / 20);
        break;
      }
    }
  if (!sofa) {
    b.corner("plant-floor", 2);
    return;
  }
  if (doorOn(ctx, "north")) b.bonus(-6);
  const cx = sofa.rect.x + sofa.rect.w / 2,
    sw = sofa.rect.w,
    sd = sofa.rect.d;
  // A TV wall facing the sofa, far enough for a coffee table between.
  let tv: Placed | null = null;
  if (D - sd - 40 >= 170)
    for (const w of [200, 170]) {
      tv = b.wallScan("tv-panel", "south", cx, { w, group: "media", weight: 30, reach: 60 });
      if (tv) break;
    }
  const tw = Math.round(clamp(Math.round((sw * 0.55) / 10) * 10, 60, 140)),
    td = D - sd >= 250 ? 60 : 50,
    tz = sd + 40;
  const room = tv ? tv.rect.z - 60 : D - 30;
  const table =
    tz + td <= room
      ? b.at("coffee-table", { x: cx - tw / 2, z: tz, w: tw, d: td }, 0, { group: "seat", weight: 12 })
      : null;
  if (table)
    for (const [x, rot] of [
      [table.rect.x + tw + 45, 90],
      [table.rect.x - 45 - 85, 270],
    ] as const)
      if (b.at("armchair", { x, z: tz + td / 2 - 42.5, w: 85, d: 85 }, rot, { group: "seat", weight: 8 }))
        break;
  // Layered light: a lamp on a side table at one end, a floor lamp at the other.
  const ends = [sofa.rect.x + sw + 5, sofa.rect.x - 50];
  let lit: number | null = null;
  for (const x of ends) {
    const t = b.at("side-table", { x, z: 5, w: 45, d: 45 }, 0, { group: "seat", weight: 3, side: "north" });
    if (t) {
      b.on("table-lamp", t, 0, 0, { weight: 2 });
      lit = x;
      break;
    }
  }
  for (const x of ends)
    if (x !== lit && b.at("floor-lamp", { x: x + 2.5, z: 5, w: 40, d: 40 }, 0, { weight: 3, side: "north" }))
      break;
  if (sw >= 160) b.on("cushions", sofa, 0, -sd / 2 + 31, { weight: 2 });
  if (sw >= 215) {
    b.wall("wall-art", "north", cx - 55, { group: "seat", weight: 3 });
    b.wall("wall-art", "north", cx + 55, { group: "seat", weight: 2 });
  } else b.wall("wall-art", "north", cx, { group: "seat", weight: 4 });
  b.rug(
    "rug-rect",
    {
      x: cx - (sw + 60) / 2,
      z: sd - 25,
      w: sw + 60,
      d: (table ? table.rect.z + table.rect.d + 50 : sd + 150) - (sd - 25),
    },
    "seat",
    5,
  );
  // A living / dining room gets its dining set in the free end of the room.
  const named = /dining/i.test(b.room.name);
  if (named) diningSet(b, { x: cx, z: sd + 80 }, 30, false);
  // A jhula swing in big rooms, on a side wall facing in.
  if (W >= 420 && D >= 380)
    for (const [x, z, rot] of [
      [20, D / 2 - 95, 270],
      [W - 130, D / 2 - 95, 90],
      [20, D - 190, 270],
      [W - 130, D - 190, 90],
    ] as const)
      if (b.at("jhula", { x, z, w: 110, d: 190 }, rot, { group: "swing", weight: 8 })) break;
  // Very big living rooms also seat the family for meals.
  if (!named && W * D >= 220000) diningSet(b, { x: cx, z: sd + 80 }, 8, false);
  // A styled console on a free side wall.
  if (W >= 300 && D >= 300)
    for (const side of ["east", "west"] as const) {
      const c = b.wall("console-table", side, D / 2, { group: "console", weight: 3 });
      if (c) {
        b.on("vase-books", c, 20, 0, { weight: 2 });
        b.wall("wall-art", side, D / 2, { group: "console", weight: 2 });
        break;
      }
    }
  // Shoes off at the door, the Indian way.
  shoeRackByDoor(b);
  if (tv) b.bonus(-Math.max(0, tv.rect.z - sd - 400) / 40);
  curtainsOnWindows(b);
  fanOver(b, cx, (sd + (tv ? tv.rect.z : D)) / 2);
  b.corner("plant-floor", 2);
}

/**
 * A dining table with chairs (and a pendant) in the free floor farthest from
 * `away`, keeping the walkway to other furniture. Returns the table or null.
 */
function diningSet(b: Designer, away: { x: number; z: number }, weight: number, rug: boolean): Placed | null {
  const { W, D } = b;
  const spots: Array<{ x: number; z: number; far: number }> = [];
  for (let x = 0; x <= W; x += 20)
    for (let z = 0; z <= D; z += 20) spots.push({ x, z, far: Math.hypot(x - away.x, z - away.z) });
  spots.sort((p, q) => q.far - p.far || p.x - q.x || p.z - q.z);
  for (const [tw, td, n] of [
    [150, 90, 2],
    [120, 80, 2],
    [90, 70, 1],
  ] as const)
    for (const s of spots) {
      const tz = s.z - td / 2,
        tx = s.x - tw / 2;
      if (tx < 0 || tz - 55 < 0 || tx + tw > W || tz + td + 55 > D) continue;
      const cp = b.checkpoint();
      const table = b.at("dining-table", { x: tx, z: tz, w: tw, d: td }, 0, { group: "dine", weight });
      if (!table) continue;
      let chairs = 0;
      for (let i = 0; i < n; i++) {
        const x = tx + (tw * (i + 1)) / (n + 1) - 22.5;
        if (b.at("dining-chair", { x, z: tz - 55, w: 45, d: 50 }, 0, { group: "dine", weight: 3 })) chairs++;
        if (b.at("dining-chair", { x, z: tz + td + 5, w: 45, d: 50 }, 180, { group: "dine", weight: 3 })) chairs++;
      }
      if (chairs < 2) {
        b.restore(cp);
        continue;
      }
      b.at("pendant-light", { x: tx + tw / 2 - 22.5, z: tz + td / 2 - 22.5, w: 45, d: 45 }, 0, { weight: 2 });
      if (rug) b.rug("rug-rect", { x: tx - 60, z: tz - 75, w: tw + 120, d: td + 150 }, "dine", 2);
      return table;
    }
  return null;
}

function shoeRackByDoor(b: Designer) {
  for (const side of SIDES)
    for (const s of b.ctx.walls[side].doors)
      for (const c of [s.b + 20 + 45, s.a - 20 - 45])
        if (b.wall("shoe-rack", side, c, { group: "accent", weight: 2 })) return;
}

function furnishKitchen(b: Designer, fridgeBay: boolean) {
  const { W, D, ctx } = b;
  // Variant: the fridge closes the run at its west end (narrow galleys).
  let fridge: Placed | null = null;
  if (fridgeBay) {
    fridge = b.wall("fridge", "north", 35, { group: "fridge", weight: 20 });
    if (!fridge) return;
  }
  const from = fridge ? 75 : 0;
  // The main run on the north wall: the longest stretch clear of doors.
  let run: Placed | null = null;
  for (let w = Math.min(Math.floor((W - from) / 10) * 10, 480); w >= 60 && !run; w -= 10)
    run = b.wallScan("kitchen-counter", "north", from + w / 2, {
      w,
      d: 60,
      group: "cook",
      weight: 60 + (w >= 200 ? 40 : 0) + w / 20,
    });
  if (!run) return;
  const entry = CATALOG.get("kitchen-counter")!;
  const stove = tileModules(entry, run.w).find((m) => m.model === "kitchen-stove");
  const stoveX = stove ? run.rect.x + run.rect.w / 2 + stove.x : null;
  if (stoveX !== null)
    b.wall("kitchen-chimney", "north", clamp(stoveX, 37.5, W - 37.5), { group: "cook", weight: 8 });
  // Wall cabinets along the run, never over the hob.
  let uppers = 0;
  for (let x = run.rect.x; x + 60 <= run.rect.x + run.rect.w + 0.01 && uppers < 6; x += 65) {
    if (stoveX !== null && Math.abs(x + 30 - stoveX) < 60) continue;
    if (b.wall("kitchen-upper", "north", x + 30, { group: "cook", weight: 1 })) uppers++;
  }
  // Tiles between the worktop and the wall cabinets, broken by windows.
  const windows = ctx.walls.north.windows
    .filter((s) => s.y0 < 145)
    .map((s) => [s.a, s.b] as const)
    .sort((p, q) => p[0] - q[0]);
  let start = run.rect.x;
  for (const [a, z] of [...windows, [Infinity, Infinity] as const]) {
    const end = Math.min(a, run.rect.x + run.rect.w);
    const w = Math.floor((end - start) / 10) * 10;
    if (w >= 60) b.wall("backsplash", "north", start + w / 2, { w: Math.min(w, 480), group: "cook", weight: 2 });
    start = Math.max(start, z);
    if (start >= run.rect.x + run.rect.w) break;
  }
  // An L-return, then the fridge at its end (the work triangle).
  let ret: Placed | null = null,
    retSide: EdgeSide = "west";
  if (W >= 150)
    for (const side of ["west", "east"] as const) {
      for (let l = Math.min(180, Math.floor((D - 65 - 75) / 10) * 10); l >= 60 && !ret; l -= 10)
        ret = b.wall("kitchen-counter", side, 65 + l / 2, { w: l, d: 60, group: "cook", weight: 20 + l / 20 });
      if (ret) {
        retSide = side;
        break;
      }
    }
  const fridgeSpots: Array<[EdgeSide, number]> = [
    ...(ret ? ([[retSide, ret.rect.z + ret.rect.d + 5 + 35]] as Array<[EdgeSide, number]>) : []),
    ["west", D - 35],
    ["east", D - 35],
    ["east", 100],
    ["west", 100],
    ["south", 35],
    ["south", W - 35],
  ];
  // Its own group: the fridge keeps a full walkway to the counters (or sits snug at a run's end).
  if (!fridge)
    for (const [side, c] of fridgeSpots) if (b.wall("fridge", side, c, { group: "fridge", weight: 20 })) break;
  // A galley's second run when there is no return.
  if (!ret && D >= 220)
    for (let w = Math.min(Math.floor(W / 10) * 10, 190); w >= 90; w -= 10)
      if (b.wallScan("kitchen-counter", "south", W / 2, { w, d: 60, group: "galley", weight: 15 })) break;
}

function furnishDining(b: Designer) {
  const { W, D } = b;
  // [width, depth, chairs per long side]; the last is a chairless bistro table.
  const TABLES: Array<[number, number, number]> = [
    [180, 90, 3],
    [150, 90, 2],
    [120, 80, 2],
    [90, 70, 1],
    [80, 60, 0],
  ];
  let table: Placed | null = null,
    board: Placed | null = null,
    seats = 0;
  for (const withBoard of [true, false]) {
    const cp = b.checkpoint();
    board = null;
    if (withBoard)
      for (const w of [150, 120, 100]) {
        board = b.wallScan("sideboard", "north", W / 2, { w, group: "store", weight: 15, reach: 40 });
        if (board) break;
      }
    if (withBoard && !board) continue;
    const top = board ? board.rect.z + board.rect.d + AUTO_WALKWAY : 0;
    for (const [tw, td, n] of TABLES) {
      const chairs = n ? 110 : 0;
      if (tw > W || top + td + chairs > D) continue;
      const tz = top + (D - top - td - chairs) / 2 + chairs / 2;
      for (const c of centresAlong(W, tw, W / 2).slice(0, 7)) {
        table = b.at("dining-table", { x: c - tw / 2, z: tz, w: tw, d: td }, 0, {
          group: "dine",
          weight: 100 + tw / 10,
        });
        if (table) break;
      }
      if (table) {
        seats = n;
        break;
      }
    }
    if (table) break;
    b.restore(cp);
  }
  if (!table) return;
  const { x: tx, z: tz, w: tw, d: td } = table.rect;
  for (let i = 0; i < seats; i++) {
    const x = tx + (tw * (i + 1)) / (seats + 1) - 22.5;
    b.at("dining-chair", { x, z: tz - 55, w: 45, d: 50 }, 0, { group: "dine", weight: 6 });
    b.at("dining-chair", { x, z: tz + td + 5, w: 45, d: 50 }, 180, { group: "dine", weight: 6 });
  }
  b.at("pendant-light", { x: tx + tw / 2 - 22.5, z: tz + td / 2 - 22.5, w: 45, d: 45 }, 0, { weight: 4 });
  if (!board)
    for (const side of ["east", "west", "south"] as const) {
      for (const w of [150, 120, 100]) {
        board = b.wallScan("sideboard", side, b.len(side) / 2, { w, group: "store", weight: 12, reach: 60 });
        if (board) break;
      }
      if (board) break;
    }
  if (board) {
    b.on("vase-books", board, board.w * 0.22, 0, { weight: 2 });
    const side = board.side!;
    const c = side === "north" || side === "south" ? board.rect.x + board.rect.w / 2 : board.rect.z + board.rect.d / 2;
    b.wall("wall-art", side, c, { group: "store", weight: 3 });
  }
  b.rug("rug-rect", { x: tx - 60, z: tz - 75, w: tw + 120, d: td + 150 }, "dine", 4);
  curtainsOnWindows(b);
  b.corner("plant-floor", 2);
}

function furnishBathroom(b: Designer) {
  const { W, D } = b;
  let toilet: Placed | null = null;
  for (const c of [21, W - 21, ...centresAlong(W, 42, 21)]) {
    toilet = b.wall("toilet", "north", c, { group: "wet", weight: 100 });
    if (toilet) break;
  }
  if (!toilet) return;
  const west = toilet.rect.x < W / 2;
  let vanity: Placed | null = null;
  for (const w of [80, 60, 50]) {
    const spots: Array<[EdgeSide, number]> = [
      ["north", west ? W - w / 2 : w / 2],
      [west ? "east" : "west", w / 2],
      ["east", D - w / 2],
      ["west", D - w / 2],
      ["south", W / 2],
    ];
    for (const [side, c] of spots) {
      vanity = b.wall("vanity", side, c, { w, group: "wet", weight: 30 });
      if (vanity) break;
    }
    if (vanity) break;
  }
  if (vanity) {
    const side = vanity.side!;
    const c = side === "north" || side === "south" ? vanity.rect.x + vanity.rect.w / 2 : vanity.rect.z + vanity.rect.d / 2;
    b.wall("mirror-cabinet", side, c, { group: "wet", weight: 4 });
  }
  if (W >= 150 && D >= 175)
    for (const s of [90, 80]) {
      const shower =
        b.at("shower", { x: W - s, z: D - s, w: s, d: s }, 180, { w: s, d: s, group: "wet", weight: 20, side: "south" }) ??
        b.at("shower", { x: 0, z: D - s, w: s, d: s }, 180, { w: s, d: s, group: "wet", weight: 20, side: "south" });
      if (shower) break;
    }
  b.corner("plant-small", 1);
}

function furnishPrayer(b: Designer) {
  const shrine = b.wallScan("prayer-shrine", "north", b.W / 2, { group: "pooja", weight: 100 });
  if (!shrine) return;
  // The shrine faces the door, so it greets you as you come in.
  if (doorOn(b.ctx, "south")) b.bonus(6);
  else if (!doorOn(b.ctx, "north")) b.bonus(2);
  const cx = shrine.rect.x + shrine.rect.w / 2;
  const mat =
    b.D >= 125
      ? b.at("prayer-mat", { x: cx - 32.5, z: 62, w: 65, d: 56 }, 0, { group: "pooja", weight: 10 })
      : null;
  const dz = mat ? 84 : 56;
  for (const x of [cx - 32.5 - 22, cx + 32.5 + 6])
    b.at("diya", { x, z: dz, w: 16, d: 12 }, 0, { group: "pooja", weight: 2 });
  for (const x of [cx - 40 - 8 - 30, cx + 40 + 8])
    b.at("plant-small", { x, z: 0, w: 30, d: 30 }, 0, { weight: 2, side: "north" });
  b.wall("wall-light", "north", cx, { group: "pooja", weight: 2 });
}

function furnishStudy(b: Designer) {
  const { W, D } = b;
  let desk: Placed | null = null;
  for (const w of [130, 110, 90, 70]) {
    if (w > W) continue;
    desk = b.wallScan("desk", "north", W / 2, { w, d: 60, group: "work", weight: 100 });
    if (desk) break;
  }
  if (!desk) return;
  const cx = desk.rect.x + desk.rect.w / 2;
  b.at("office-chair", { x: cx - 30, z: 65, w: 60, d: 60 }, 180, { group: "work", weight: 20 });
  b.on("table-lamp", desk, -(desk.w / 2 - 20), -10, { weight: 2 });
  const spots: Array<[EdgeSide, number]> = [
    ["north", desk.rect.x + desk.rect.w + 10 + 45],
    ["north", desk.rect.x - 10 - 45],
    ["east", D - 45],
    ["west", D - 45],
    ["south", W / 2],
  ];
  for (const [side, c] of spots) if (b.wall("bookshelf", side, c, { group: "store", weight: 15 })) break;
  b.wall("wall-art", "north", cx, { group: "work", weight: 2 });
  curtainsOnWindows(b);
  fanOver(b, W / 2, D / 2);
  b.corner("plant-floor", 2);
}

function furnishUtility(b: Designer) {
  const { W } = b;
  let washer: Placed | null = null;
  for (const c of [30, W - 30, ...centresAlong(W, 60, 30)]) {
    washer = b.wall("washing-machine", "north", c, { group: "laundry", weight: 100 });
    if (washer) break;
  }
  if (washer)
    for (const dir of [1, -1]) {
      const room = dir > 0 ? W - (washer.rect.x + 65) : washer.rect.x - 5;
      const w = Math.floor(Math.min(110, room) / 10) * 10;
      if (w < 40) continue;
      const c = dir > 0 ? washer.rect.x + 65 + w / 2 : washer.rect.x - 5 - w / 2;
      if (b.wall("laundry-counter", "north", c, { w, group: "laundry", weight: 20 })) break;
    }
  for (const side of ["east", "west", "south"] as const)
    if (b.wallScan("shoe-rack", side, b.len(side) / 2, { group: "store", weight: 10 })) break;
}

function furnishShop(b: Designer) {
  const { W, D } = b;
  for (let w = Math.min(Math.floor(W / 10) * 10, 300); w >= 60; w -= 20)
    if (b.wallScan("display-shelf", "north", w / 2, { w, group: "retail", weight: 100 })) break;
  if (D >= 220) {
    const w = Math.min(140, Math.floor(W / 10) * 10);
    if (w >= 60) b.at("shop-counter", { x: W - w, z: D - 60, w, d: 60 }, 0, { group: "till", weight: 20 });
  }
  b.corner("plant-floor", 2);
}

/** A recipe tries each variant (a bed or sofa size) and keeps the best. */
const recipe =
  (...variants: Array<(b: Designer) => void>): LayoutFn =>
  (room, W, D, ctx) => {
    let best: AutoLayout | null = null;
    for (const furnish of variants) {
      const b = designer(W, D, ctx, room);
      furnish(b);
      const layout = b.done();
      if (!best || layout.score > best.score + 1e-6) best = layout;
    }
    return best!;
  };
export const AUTO_LAYOUTS: Record<AutoLayoutKind, LayoutFn> = {
  bedroom: recipe(...BEDS.map((bed) => (b: Designer) => furnishBedroom(b, bed))),
  living: recipe(...SOFAS.map((sofa) => (b: Designer) => furnishLiving(b, sofa))),
  kitchen: recipe(
    (b) => furnishKitchen(b, false),
    (b) => furnishKitchen(b, true),
  ),
  dining: recipe(furnishDining),
  bathroom: recipe(furnishBathroom),
  prayer: recipe(furnishPrayer),
  study: recipe(furnishStudy),
  utility: recipe(furnishUtility),
  shop: recipe(furnishShop),
};

/** Which recipe a room uses: its kind, or a study / prayer cue from its name. */
export function autoLayoutKind(room: Pick<Room, "kind" | "name">): AutoLayoutKind {
  if (
    room.kind === "bedroom" ||
    room.kind === "kitchen" ||
    room.kind === "dining" ||
    room.kind === "living" ||
    room.kind === "bathroom"
  )
    return room.kind;
  if (/prayer|pooja|puja|mandir/i.test(room.name)) return "prayer";
  if (/study|office/i.test(room.name)) return "study";
  return room.kind === "shop" ? "shop" : "utility";
}

export const AUTO_INSET = 13;
export const autoFurnitureId = (roomId: string, index: number) =>
  `auto:${roomId}:${index}`;

type OpeningSpan = { door: boolean; rect: Rect; y0: number; y1: number };
/** Doors and windows on a room's edges, as thin rects along the edge (plot cm). */
function roomOpeningSpans(room: Room, walls: readonly Wall[]): OpeningSpan[] {
  const r = room.bounds;
  const out: OpeningSpan[] = [];
  for (const wall of walls)
    for (const o of wall.openings) {
      const door = isPassable(o.kind),
        y0 = o.sill,
        y1 = o.sill + o.height;
      if (wall.axis === "x" && (wall.z === r.z || wall.z === r.z + r.d)) {
        const c = wall.x + o.offset;
        const a = Math.max(c - o.width / 2, r.x),
          b = Math.min(c + o.width / 2, r.x + r.w);
        if (b - a > 1)
          out.push({ door, y0, y1, rect: { x: a, z: wall.z === r.z ? r.z : r.z + r.d - 1, w: b - a, d: 1 } });
      } else if (wall.axis === "z" && (wall.x === r.x || wall.x === r.x + r.w)) {
        const c = wall.z + o.offset;
        const a = Math.max(c - o.width / 2, r.z),
          b = Math.min(c + o.width / 2, r.z + r.d);
        if (b - a > 1)
          out.push({ door, y0, y1, rect: { x: wall.x === r.x ? r.x : r.x + r.w - 1, z: a, w: 1, d: b - a } });
      }
    }
  return out;
}
/** Doors and windows seen from a recipe's canonical frame (room turned `turns`). */
function layoutContext(
  room: Room,
  approaches: readonly Rect[],
  spans: readonly OpeningSpan[],
  turns: number,
  W: number,
  D: number,
): LayoutContext {
  const inset = AUTO_INSET,
    rw = room.bounds.w - inset * 2,
    rd = room.bounds.d - inset * 2;
  const back = (r: Rect) =>
    turnRect(
      { x: r.x - room.bounds.x - inset, z: r.z - room.bounds.z - inset, w: r.w, d: r.d },
      rw,
      rd,
      (4 - turns) % 4,
    );
  const walls = noWalls();
  for (const s of spans) {
    const q = back(s.rect);
    let side: EdgeSide, a: number, b: number;
    if (q.z + q.d <= 0.5) [side, a, b] = ["north", q.x, q.x + q.w];
    else if (q.z >= D - 0.5) [side, a, b] = ["south", q.x, q.x + q.w];
    else if (q.x + q.w <= 0.5) [side, a, b] = ["west", q.z, q.z + q.d];
    else if (q.x >= W - 0.5) [side, a, b] = ["east", q.z, q.z + q.d];
    else continue;
    (s.door ? walls[side].doors : walls[side].windows).push({ a, b, y0: s.y0, y1: s.y1 });
  }
  return { doors: approaches.map(back), walls };
}

type Furnishing = { items: FurnitureItem[]; parts: RoomDetail[] };
const FURNISHED = new WeakMap<Room, { key: string; value: Furnishing }>();
/**
 * The automatic furnishing for a room: its designer recipe tried with the
 * room turned each permitted quarter turn (forced by `furnishingRotation`),
 * keeping the best-scoring layout (ties keep the first turn). Deterministic.
 */
export function autoFurnishing(room: Room, walls: readonly Wall[] = []): Furnishing {
  const inset = AUTO_INSET,
    rw = room.bounds.w - inset * 2,
    rd = room.bounds.d - inset * 2;
  if (rw <= 0 || rd <= 0) return { items: [], parts: [] };
  const approaches = roomDoorApproaches(room, walls);
  const spans = roomOpeningSpans(room, walls);
  const key = JSON.stringify([
    room.id,
    room.kind,
    room.name,
    room.bounds,
    room.furnishingRotation,
    approaches,
    spans,
  ]);
  const hit = FURNISHED.get(room);
  if (hit && hit.key === key) return { items: [...hit.value.items], parts: [...hit.value.parts] };
  const orientations =
    room.furnishingRotation === undefined ? [0, 1, 2, 3] : [room.furnishingRotation / 90];
  const recipeFor = AUTO_LAYOUTS[autoLayoutKind(room)];
  let best: { turns: number; w: number; d: number; layout: AutoLayout } | null = null;
  for (const turns of orientations) {
    const w = turns % 2 ? rd : rw,
      d = turns % 2 ? rw : rd;
    const layout = recipeFor(room, w, d, layoutContext(room, approaches, spans, turns, w, d));
    if (!best || layout.score > best.layout.score + 1e-6) best = { turns, w, d, layout };
  }
  const items = best!.layout.items.map((p, index): FurnitureItem => {
    const r = turnRect(p.rect, best!.w, best!.d, best!.turns);
    return {
      id: autoFurnitureId(room.id, index),
      catalogId: p.catalogId,
      x: r.x + inset + r.w / 2,
      z: r.z + inset + r.d / 2,
      rotation: ((p.rotation + best!.turns * 90) % 360) as QuarterTurn,
      w: p.w,
      d: p.d,
    };
  });
  const parts = items.flatMap((item) => furnitureParts(room, item, items));
  const value = { items, parts };
  FURNISHED.set(room, { key, value });
  return { items: [...items], parts: [...parts] };
}
/** Automatic furniture items (room-local centres, `auto:` ids). */
export const autoFurniture = (room: Room, walls: readonly Wall[] = []) =>
  autoFurnishing(room, walls).items;
const BACK_SIDE: Record<QuarterTurn, EdgeSide> = { 0: "north", 90: "east", 180: "south", 270: "west" };
/** Main pieces, in order, whose wall reads as a room's focal (feature) wall. */
const FOCAL_PIECES = [
  "bed-double",
  "bed-single",
  "sofa-3",
  "sofa-2",
  "diwan",
  "prayer-shrine",
  "tv-panel",
  "desk",
  "sideboard",
  "kitchen-counter",
];
/**
 * The wall a room's main piece stands against (the bed's headboard wall, the
 * sofa's back wall…), for an accent wall; null when there is none.
 */
export function roomFocalWall(room: Room, walls: readonly Wall[] = []): EdgeSide | null {
  const items = resolveFurniture(room, walls);
  for (const id of FOCAL_PIECES) {
    const item = items.find((i) => i.catalogId === id);
    if (item) return BACK_SIDE[item.rotation];
  }
  return null;
}
/** The furniture a room shows: explicit, none, or the automatic layout. */
export function resolveFurniture(
  room: Room,
  walls: readonly Wall[] = [],
): FurnitureItem[] {
  if (room.furniture) return room.furniture;
  if (room.furnishing === "none") return [];
  return autoFurniture(room, walls);
}

// ---------------------------------------------------------------------------
// Explicit items
// ---------------------------------------------------------------------------
export function itemSize(item: Pick<FurnitureItem, "catalogId" | "w" | "d">) {
  const entry = CATALOG.get(item.catalogId);
  return {
    w: item.w ?? entry?.size.w ?? 60,
    d: item.d ?? entry?.size.d ?? 60,
  };
}
/** Room-local footprint of an item after its rotation. */
export function furnitureFootprint(
  item: Pick<FurnitureItem, "catalogId" | "w" | "d" | "x" | "z" | "rotation">,
): Rect {
  const { w, d } = itemSize(item),
    turned = item.rotation % 180 !== 0,
    fw = turned ? d : w,
    fd = turned ? w : d;
  return { x: item.x - fw / 2, z: item.z - fd / 2, w: fw, d: fd };
}
/**
 * Height (cm) of an item's base above the floor: its wall mount, or for decor
 * pieces the top surface of the furniture under their centre (else the floor).
 */
export function furnitureBaseY(
  item: Pick<FurnitureItem, "id" | "catalogId" | "x" | "z">,
  siblings: readonly FurnitureItem[] = [],
): number {
  const entry = CATALOG.get(item.catalogId);
  if (!entry) return 0;
  if (entry.layer !== "decor") return entry.mountY ?? 0;
  let y = 0;
  for (const o of siblings) {
    if (o.id === item.id) continue;
    const host = CATALOG.get(o.catalogId);
    if (host?.surface === undefined || host.layer !== "standard") continue;
    const fp = furnitureFootprint(o);
    if (item.x > fp.x && item.x < fp.x + fp.w && item.z > fp.z && item.z < fp.z + fp.d)
      y = Math.max(y, host.surface);
  }
  return y;
}
/** An item's parts in plot centimetres, owned by the item (decor rests on `siblings`). */
export function furnitureParts(
  room: Room,
  item: FurnitureItem,
  siblings: readonly FurnitureItem[] = room.furniture ?? [],
): RoomDetail[] {
  const entry = CATALOG.get(item.catalogId),
    gen = GENERATORS[item.catalogId];
  if (!entry || !gen) return [];
  const lift = entry.layer === "decor" ? furnitureBaseY(item, siblings) : 0;
  const { w, d } = itemSize(item);
  const local: Array<{ part: RoomDetail; tint: boolean }> = [];
  gen(
    makeEmit((part, tint) => local.push({ part, tint }), sizeKeep),
    0,
    0,
    w,
    d,
  );
  const turns = ((item.rotation / 90) % 4 + 4) % 4,
    fp = furnitureFootprint(item),
    ox = room.bounds.x + fp.x,
    oz = room.bounds.z + fp.z,
    color = finishColor(entry, item.finish);
  return local.map(({ part, tint }) => {
    const r = turnRect(part.bounds, w, d, turns);
    return {
      ...part,
      bounds: { x: r.x + ox, z: r.z + oz, w: r.w, d: r.d },
      y: part.y + lift,
      ownerId: item.id,
      ...(tint && color ? { color } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export const FURNITURE_WALL_GAP = 10;
export const FURNITURE_GRID = 5;
export const snap5 = (n: number) => Math.round(n / FURNITURE_GRID) * FURNITURE_GRID;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const sameLayer = (a: FurnitureItem, b: FurnitureItem) =>
  CATALOG.get(a.catalogId)?.layer === CATALOG.get(b.catalogId)?.layer;
export const furnitureLabel = (item: Pick<FurnitureItem, "catalogId">) =>
  CATALOG.get(item.catalogId)?.label ?? "Furniture";

export type FurnitureProblem = { code: string; message: string };
/** Shape problems that depend only on the item and its catalog entry. */
export function furnitureShapeProblems(item: FurnitureItem): FurnitureProblem[] {
  const entry = CATALOG.get(item.catalogId);
  if (!entry)
    return [{ code: "furniture-unknown", message: "Choose furniture from the catalog." }];
  const problems: FurnitureProblem[] = [];
  if (![0, 90, 180, 270].includes(item.rotation))
    problems.push({
      code: "furniture-shape",
      message: "Furniture turns in quarter turns.",
    });
  if (
    !Number.isFinite(item.x) ||
    !Number.isFinite(item.z) ||
    item.x % FURNITURE_GRID !== 0 ||
    item.z % FURNITURE_GRID !== 0
  )
    problems.push({
      code: "furniture-shape",
      message: "Furniture snaps to a 5 cm grid.",
    });
  for (const key of ["w", "d"] as const) {
    const value = item[key];
    if (value === undefined) continue;
    const range = entry.stretch?.[key];
    if (
      !Number.isInteger(value) ||
      (range
        ? value < range[0] || value > range[1]
        : value !== entry.size[key])
    )
      problems.push({
        code: "furniture-shape",
        message: range
          ? `${entry.label} can stretch from ${range[0]} to ${range[1]} cm ${key === "w" ? "wide" : "deep"}.`
          : `${entry.label} has a fixed size.`,
      });
  }
  if (
    item.finish !== undefined &&
    !(entry.finishes ?? []).includes(item.finish)
  )
    problems.push({
      code: "furniture-finish",
      message: `Choose a finish ${entry.label.toLowerCase()} comes in.`,
    });
  return problems;
}
/** Whether a footprint keeps its 10 cm clearance inside the room. */
export function fitsRoom(room: Room, fp: Rect) {
  const gap = FURNITURE_WALL_GAP;
  return (
    fp.x >= gap &&
    fp.z >= gap &&
    fp.x + fp.w <= room.bounds.w - gap &&
    fp.z + fp.d <= room.bounds.d - gap
  );
}
/** Other items in the same layer this item overlaps. */
export function furnitureCollisions(
  item: FurnitureItem,
  others: readonly FurnitureItem[],
): FurnitureItem[] {
  const fp = furnitureFootprint(item);
  return others.filter(
    (o) =>
      o.id !== item.id &&
      sameLayer(o, item) &&
      overlaps(fp, furnitureFootprint(o)),
  );
}
const placeable = (
  room: Room,
  item: FurnitureItem,
  placed: readonly FurnitureItem[],
) =>
  fitsRoom(room, furnitureFootprint(item)) &&
  !furnitureCollisions(item, placed).length;

/** Spiral offsets on the 5 cm grid out to 100 cm, nearest first. */
const SPIRAL: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let dx = -100; dx <= 100; dx += 5)
    for (let dz = -100; dz <= 100; dz += 5) if (dx || dz) out.push([dx, dz]);
  return out.sort(
    (a, b) =>
      a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) ||
      a[0] - b[0] ||
      a[1] - b[1],
  );
})();
/** Moves an item's centre so its footprint sits inside the room, on the grid. */
export function clampInside(room: Room, item: FurnitureItem): FurnitureItem {
  const fp = furnitureFootprint(item),
    gap = FURNITURE_WALL_GAP;
  const axis = (value: number, size: number, span: number) => {
    const lo = Math.ceil((gap + size / 2) / 5) * 5,
      hi = Math.floor((span - gap - size / 2) / 5) * 5;
    return lo > hi ? snap5(span / 2) : Math.min(hi, Math.max(lo, snap5(value)));
  };
  return {
    ...item,
    x: axis(item.x, fp.w, room.bounds.w),
    z: axis(item.z, fp.d, room.bounds.d),
  };
}
/** The nearest valid spot for an item within 100 cm, or undefined. */
export function nudgeFurniture(
  room: Room,
  item: FurnitureItem,
  placed: readonly FurnitureItem[],
): FurnitureItem | undefined {
  if (placeable(room, item, placed)) return item;
  for (const [dx, dz] of SPIRAL) {
    const next = { ...item, x: item.x + dx, z: item.z + dz };
    if (placeable(room, next, placed)) return next;
  }
  return undefined;
}
/**
 * Keeps every item that fits: valid items stay, others are clamped inside the
 * room, then moved to the nearest free spot within 1 m, else removed.
 */
export function fitFurniture(
  room: Room,
  items: readonly FurnitureItem[],
): { items: FurnitureItem[]; removed: FurnitureItem[] } {
  const placed: FurnitureItem[] = [],
    removed: FurnitureItem[] = [];
  for (const item of items) {
    if (placeable(room, item, placed)) {
      placed.push(item);
      continue;
    }
    const fitted = nudgeFurniture(room, clampInside(room, item), placed);
    if (fitted) placed.push(fitted);
    else removed.push(item);
  }
  return { items: placed, removed };
}
/** Keeps items at the same absolute position when the room's origin moves. */
export function reframeForResize(
  before: Pick<Room, "bounds">,
  after: Pick<Room, "bounds">,
  items: readonly FurnitureItem[],
): FurnitureItem[] {
  const dx = before.bounds.x - after.bounds.x,
    dz = before.bounds.z - after.bounds.z;
  if (!dx && !dz) return [...items];
  return items.map((item) => ({ ...item, x: item.x + dx, z: item.z + dz }));
}
/**
 * Turns a room-local layout a quarter turn with its room (dir 1: clockwise,
 * matching a room whose width and depth swap). `room` is the room before.
 */
export function rotateLayout(
  room: Pick<Room, "bounds">,
  items: readonly FurnitureItem[],
  dir: 1 | -1 = 1,
): FurnitureItem[] {
  const { w, d } = room.bounds;
  return items.map((item) => ({
    ...item,
    x: dir === 1 ? d - item.z : item.z,
    z: dir === 1 ? item.x : w - item.x,
    rotation: ((item.rotation + (dir === 1 ? 90 : 270)) % 360) as QuarterTurn,
  }));
}
export const furnitureIdSeed = (roomId: string, catalogId: string) =>
  `${roomId}-${catalogId}`.slice(0, 56);
/** Converts an automatic item into a valid explicit one (grid, catalog sizes). */
export function normalizeAutoItem(item: FurnitureItem, id: string): FurnitureItem {
  const entry = CATALOG.get(item.catalogId);
  const size = (key: "w" | "d") => {
    const value = item[key],
      range = entry?.stretch?.[key];
    if (value === undefined || !range || !entry) return undefined;
    const clamped = Math.min(range[1], Math.max(range[0], Math.round(value)));
    return clamped === entry.size[key] ? undefined : clamped;
  };
  const w = size("w"),
    d = size("d");
  return {
    id,
    catalogId: item.catalogId,
    x: snap5(item.x),
    z: snap5(item.z),
    rotation: item.rotation,
    ...(w !== undefined ? { w } : {}),
    ...(d !== undefined ? { d } : {}),
    ...(item.finish !== undefined ? { finish: item.finish } : {}),
  };
}

export type RoomLocation = { floorId: string | null; room: Room };
/** Finds a room on a floor (floorId) or in the tray (floorId null). */
export function findRoom(
  project: Project,
  floorId: string | null,
  roomId: string,
): Room | undefined {
  if (floorId === null)
    return project.stagedRooms?.find((s) => s.room.id === roomId)?.room;
  return project.floors
    .find((f) => f.id === floorId)
    ?.rooms.find((r) => r.id === roomId);
}
export function replaceRoom(
  project: Project,
  floorId: string | null,
  room: Room,
): Project {
  if (floorId === null)
    return {
      ...project,
      stagedRooms: (project.stagedRooms ?? []).map((s) =>
        s.room.id === room.id ? { ...s, room } : s,
      ),
    };
  return {
    ...project,
    floors: project.floors.map((f) =>
      f.id === floorId
        ? { ...f, rooms: f.rooms.map((r) => (r.id === room.id ? room : r)) }
        : f,
    ),
  };
}
/** Walls used for a room's door approaches (none for rooms in the tray). */
export function roomWalls(project: Project, floorId: string | null): Wall[] {
  if (floorId === null || !project.floors.some((f) => f.id === floorId))
    return [];
  return deriveWalls(floorForGeometry(project, floorId), project.plot.road);
}
/**
 * Turns a room's automatic layout into explicit, valid items (snapped to the
 * grid, catalog sizes, overlaps resolved). No-op when already explicit.
 */
export function materializeFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
): { project: Project; idMap: Map<string, string>; removed: FurnitureItem[] } {
  const room = findRoom(project, floorId, roomId);
  const idMap = new Map<string, string>();
  if (!room || room.furniture) return { project, idMap, removed: [] };
  const auto =
    room.furnishing === "none"
      ? []
      : autoFurniture(room, roomWalls(project, floorId));
  const used = componentIds(project);
  const normalized = auto.map((item) => {
    const id = allocateId(furnitureIdSeed(room.id, item.catalogId), used);
    idMap.set(item.id, id);
    return normalizeAutoItem(item, id);
  });
  const { items, removed } = fitFurniture(room, normalized);
  for (const item of removed)
    for (const [auto, real] of idMap) if (real === item.id) idMap.delete(auto);
  return {
    project: replaceRoom(project, floorId, { ...room, furniture: items }),
    idMap,
    removed,
  };
}

const furnitureRef = (
  floorId: string | null,
  roomId: string,
  id: string,
): ComponentRef => ({ kind: "furniture", id, floorId, roomId });

/** Explicit, walk-blocking items that sit in a door approach. */
export function furnitureDoorConflicts(
  room: Room,
  walls: readonly Wall[],
): FurnitureItem[] {
  if (!room.furniture?.length) return [];
  const doors = roomDoorApproaches(room, walls);
  if (!doors.length) return [];
  return room.furniture.filter((item) => {
    if (!CATALOG.get(item.catalogId)?.blocksWalk) return false;
    const fp = furnitureFootprint(item);
    const plot = {
      x: fp.x + room.bounds.x,
      z: fp.z + room.bounds.z,
      w: fp.w,
      d: fp.d,
    };
    return doors.some((door) => overlapArea(plot, door) > 0);
  });
}

function validateRoomFurniture(
  room: Room,
  floorId: string | null,
  ids: Map<string, number>,
  issue: IssueSink,
  walls?: readonly Wall[],
) {
  const items = room.furniture;
  if (!items) return;
  const floorIds = floorId ? [floorId] : [];
  if (items.length > LIMITS.furniturePerRoom)
    issue("limit", "A room holds up to 32 pieces of furniture.", {
      source: floorId
        ? { kind: "room", id: room.id, floorId }
        : { kind: "staged", id: room.id },
      floorIds,
    });
  for (const [i, item] of items.entries()) {
    const source = furnitureRef(floorId, room.id, item.id);
    if (typeof item.id !== "string" || !ID.test(item.id) || (ids.get(item.id) ?? 0) > 1)
      issue("duplicate-id", "Every component must have a unique, valid ID.", {
        source,
        floorIds,
      });
    const shape = furnitureShapeProblems(item);
    for (const p of shape) issue(p.code, p.message, { source, floorIds });
    if (shape.some((p) => p.code === "furniture-unknown")) continue;
    const fp = furnitureFootprint(item);
    if (!fitsRoom(room, fp))
      issue(
        "furniture-outside",
        `${furnitureLabel(item)} must stay inside ${room.name}, 10 cm from the walls.`,
        {
          source,
          floorIds,
          attempted: {
            ...fp,
            x: fp.x + room.bounds.x,
            z: fp.z + room.bounds.z,
          },
        },
      );
    const hits = furnitureCollisions(item, items.slice(i + 1));
    if (hits.length)
      issue(
        "furniture-overlap",
        `${furnitureLabel(item)} overlaps ${furnitureLabel(hits[0]).toLowerCase()}. Leave space between furniture.`,
        {
          source,
          floorIds,
          blockers: hits.map((h) => furnitureRef(floorId, room.id, h.id)),
        },
      );
  }
  if (walls)
    for (const item of furnitureDoorConflicts(room, walls))
      issue(
        "furniture-blocks-door",
        `${furnitureLabel(item)} blocks a doorway in ${room.name}.`,
        {
          severity: "warning",
          source: furnitureRef(floorId, room.id, item.id),
          floorIds,
          fixes: [
            {
              kind: "edit",
              target: furnitureRef(floorId, room.id, item.id),
              focus: "move",
            },
          ],
        },
      );
}

registerValidation((project, issue) => {
  const explicit = (rooms: readonly Room[]) => rooms.some((r) => r.furniture);
  const staged = (project.stagedRooms ?? []).map((s) => s.room);
  if (!project.floors.some((f) => explicit(f.rooms)) && !explicit(staged)) return;
  const ids = idCounts(project);
  let total = 0;
  for (const floor of project.floors) {
    if (!explicit(floor.rooms)) continue;
    let walls: Wall[] | undefined;
    try {
      walls = roomWalls(project, floor.id);
    } catch {
      walls = undefined;
    }
    for (const room of floor.rooms) {
      total += room.furniture?.length ?? 0;
      validateRoomFurniture(room, floor.id, ids, issue, walls);
    }
  }
  for (const room of staged) {
    total += room.furniture?.length ?? 0;
    validateRoomFurniture(room, null, ids, issue);
  }
  if (total > LIMITS.furnitureTotal)
    issue("limit", "A home holds up to 800 pieces of furniture.");
});

/**
 * Structural reconcile: when a furnished room is resized (or changes use), its
 * explicit items keep their absolute positions where possible, then are
 * clamped, nudged up to 1 m, or removed with a notice. Pure moves carry the
 * room-local layout unchanged.
 */
export function reconcileFurniture(
  before: Project,
  after: Project,
  notices: EditIssue[],
): Project {
  if (before === after) return after;
  const old = new Map<string, Room>();
  for (const f of before.floors) for (const r of f.rooms) old.set(r.id, r);
  for (const s of before.stagedRooms ?? []) old.set(s.room.id, s.room);
  let changed = false;
  const fix = (room: Room, floorId: string | null): Room => {
    const prev = old.get(room.id);
    if (!room.furniture || !prev) return room;
    const sized =
      prev.bounds.w !== room.bounds.w || prev.bounds.d !== room.bounds.d;
    if (!sized && prev.kind === room.kind) return room;
    let source =
      sized && prev.furniture === room.furniture
        ? reframeForResize(prev, room, room.furniture)
        : room.furniture;
    // A new use keeps only the pieces that belong in it: a bedroom turned
    // into a kitchen loses its bed. If only accessories are left (art, rugs,
    // lamps, plants), the room furnishes itself automatically for its new use.
    if (prev.kind !== room.kind) {
      const misfits = source.filter((item) => !furnitureFitsRoom(item.catalogId, room.kind));
      if (misfits.length) {
        for (const item of misfits)
          notices.push(
            makeIssue(
              "furniture-removed",
              `${furnitureLabel(item)} doesn’t belong in ${room.name}, so it was taken out.`,
              {
                severity: "notice",
                source: furnitureRef(floorId, room.id, item.id),
                floorIds: floorId ? [floorId] : [],
              },
            ),
          );
        source = source.filter((item) => furnitureFitsRoom(item.catalogId, room.kind));
        if (!source.some((item) => !isAccessory(item.catalogId))) {
          changed = true;
          const { furniture: _gone, ...rest } = room;
          void _gone;
          return rest;
        }
      }
    }
    const { items, removed } = fitFurniture(room, source);
    const same =
      items.length === room.furniture.length &&
      items.every((item, i) => item === room.furniture![i]);
    if (same) return room;
    for (const item of removed)
      notices.push(
        makeIssue(
          "furniture-removed",
          `${furnitureLabel(item)} no longer fit in ${room.name}, so it was removed.`,
          {
            severity: "notice",
            source: furnitureRef(floorId, room.id, item.id),
            floorIds: floorId ? [floorId] : [],
          },
        ),
      );
    changed = true;
    return { ...room, furniture: items };
  };
  const floors = after.floors.map((f) => {
    const rooms = f.rooms.map((r) => fix(r, f.id));
    return rooms.every((r, i) => r === f.rooms[i]) ? f : { ...f, rooms };
  });
  const stagedRooms = after.stagedRooms?.map((s) => {
    const room = fix(s.room, null);
    return room === s.room ? s : { ...s, room };
  });
  if (!changed) return after;
  return {
    ...after,
    floors,
    ...(stagedRooms ? { stagedRooms } : {}),
  };
}
registerReconciler(reconcileFurniture);
