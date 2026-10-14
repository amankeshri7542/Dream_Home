// Furniture: the catalog (catalog/furniture.json), per-item procedural parts,
// the automatic layouts (an exact port of the original room recipes), and the
// rules every explicit `Room.furniture` list must satisfy.
//
// Part generators take an origin (ox, oz) so the automatic layouts can emit in
// the room's canonical frame with exactly the arithmetic the original recipes
// used, while explicit items emit at (0, 0) in their own back-north frame.
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
import { deriveWalls } from "./walls";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export type FurnitureLayer = "floor" | "standard" | "high" | "ceiling";
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
  light?: { y: number; color: string; intensity: number };
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
/** The original recipes drop any part that leaves the room's inset frame. */
const frameKeep =
  (W: number, D: number): Keep =>
  (x, z, w, d) =>
    !(w <= 0 || d <= 0 || x < 0 || z < 0 || x + w > W + 0.01 || z + d > D + 0.01);
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
    e.box("sink rim", ox + 10, oz + 8, 48, 42, 89, 2, "steel", true);
    e.box("sink bowl", ox + 14, oz + 12, 40, 34, 90, 1, "dark", true);
    e.box("sink bottom", ox + 18, oz + 16, 32, 26, 91, 1, "water", true);
    e.box("tap", ox + 29, oz + 5, 4, 4, 91, 22, "steel");
    e.box("tap spout", ox + 29, oz + 5, 4, 17, 111, 3, "steel");
    e.box("chopping board", ox + 67, oz + 15, 27, 34, 89, 2, "oak", true);
  }
}
/** The automatic L-return: plain cabinets in the canonical (west-wall) frame. */
function counterReturn(e: Emit, ox: number, oz: number, length: number) {
  e.box("return cabinets", ox, oz, 60, length, 0, 84, "cabinet");
  e.box("return countertop", ox, oz, 62, length, 84, 5, "stone");
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
  // Short runs read as plain cabinets (the automatic L-return is 120 cm).
  "kitchen-counter": (e, ox, oz, w, d) =>
    kitchenCounter(e, ox, oz, w, d, w >= 130),
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
  "rug-rect": rugRect,
  "rug-round": rugRound,
  "plant-floor": plant(28, 35),
  "plant-small": plant(18, 18),
  "floor-lamp": floorLamp,
  "pendant-light": pendantLight,
};
export const hasFurnitureParts = (catalogId: string) => catalogId in GENERATORS;

// ---------------------------------------------------------------------------
// Automatic layouts: canonical turn-0 placements inside the 13 cm inset frame
// ---------------------------------------------------------------------------
export type AutoLayoutKind =
  | RoomKind
  | "study"
  | "prayer";
export type AutoPlacement = {
  catalogId: string;
  /** Footprint in the canonical (unturned) inset frame. */
  rect: Rect;
  /** Item-local size, before the item's own rotation. */
  w: number;
  d: number;
  /** Direction the item's back faces in the canonical frame. */
  rotation: QuarterTurn;
};
export type AutoLayout = {
  items: AutoPlacement[];
  /** Parts in recipe order, tagged with the index of their owning item. */
  parts: Array<{ owner: number; part: RoomDetail }>;
};
function layoutBuilder(W: number, D: number) {
  const items: AutoPlacement[] = [],
    parts: AutoLayout["parts"] = [];
  let owner = -1;
  const e = makeEmit((part) => parts.push({ owner, part }), frameKeep(W, D));
  return {
    e,
    place(
      catalogId: string,
      x: number,
      z: number,
      w: number,
      d: number,
      rotation: QuarterTurn = 0,
    ) {
      const turned = rotation % 180 !== 0;
      items.push({
        catalogId,
        rect: { x, z, w: turned ? d : w, d: turned ? w : d },
        w,
        d,
        rotation,
      });
      owner = items.length - 1;
      return owner;
    },
    use(index: number) {
      owner = index;
    },
    done: (): AutoLayout => ({ items, parts }),
  };
}
type LayoutFn = (room: Room, w: number, d: number) => AutoLayout;
export const AUTO_LAYOUTS: Record<AutoLayoutKind, LayoutFn> = {
  bedroom: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = W >= 215 ? 155 : 90;
    if (W >= width && D >= 200) {
      const x = Math.max(0, (W - width) / 2);
      b.place(width === 155 ? "bed-double" : "bed-single", x, 0, width, 200);
      bed(b.e, x, 0, width, 200);
      if (x >= 36) {
        const sx = x - 36;
        b.place("bedside-table", sx, 5, 30, 38);
        bedsideTable(b.e, sx, 5, 30, 38);
      }
    } else {
      // A folded sleeping mat identifies a too-small sleeping space without a tiny bed.
      const x = Math.max(0, (W - 76) / 2),
        w = Math.min(76, W),
        d = Math.min(115, D);
      b.place("sleeping-mat", x, 0, w, d);
      sleepingMat(b.e, x, 0, w, d);
    }
    return b.done();
  },
  kitchen: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = Math.min(W, 330);
    b.place("kitchen-counter", 0, 0, width, 60);
    kitchenCounter(b.e, 0, 0, width, 60, true);
    if (D >= 190 && W >= 250) {
      const length = Math.min(120, D - 62);
      b.place("kitchen-counter", 0, 62, length, 60, 270);
      counterReturn(b.e, 0, 62, length);
    }
    return b.done();
  },
  dining: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = W >= 230 ? 145 : 90,
      depth = D >= 225 ? 86 : 66;
    const x = (W - width) / 2,
      z = (D - depth) / 2;
    const table = b.place("dining-table", x, z, width, depth);
    diningTop(b.e, x, z, width, depth);
    for (let i = 0; i < diningSeats(width); i++) {
      const cx = seatX(x, width, i);
      if (z >= 43) {
        b.place("dining-chair", cx, z - 43, 40, 40, 0);
        chair(b.e, cx, z - 43, 40, 40, "north");
      }
      if (z + depth + 43 <= D) {
        b.place("dining-chair", cx, z + depth + 3, 40, 40, 180);
        chair(b.e, cx, z + depth + 3, 40, 40, "south");
      }
      b.use(table);
      diningPlates(b.e, cx, z, depth);
    }
    b.use(table);
    diningBowl(b.e, x, z, width, depth);
    return b.done();
  },
  living: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = Math.min(220, W),
      depth = Math.min(85, D);
    b.place(width > 170 ? "sofa-3" : "sofa-2", 0, 0, width, depth);
    sofa(b.e, 0, 0, width, depth);
    if (D >= 210 && W >= 140) {
      const x = (width - 100) / 2;
      b.place("coffee-table", x, 127, 100, 55);
      coffeeTable(b.e, x, 127, 100, 55);
    }
    return b.done();
  },
  bathroom: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    b.place("toilet", 0, 0, 42, 68);
    toilet(b.e, 0, 0, 42, 68);
    if (W >= 108) {
      b.place("vanity", W - 54, 0, 54, 46);
      vanity(b.e, W - 54, 0, 54, 46);
    }
    if (W >= 150 && D >= 175) {
      b.place("shower", W - 82, D - 82, 82, 82);
      shower(b.e, W - 82, D - 82, 82, 82);
    }
    return b.done();
  },
  prayer: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const x = (W - 80) / 2;
    b.place("prayer-shrine", x, 0, 80, 50);
    prayerShrine(b.e, x, 0, 80, 50);
    if (D >= 120) {
      const mx = (W - 65) / 2;
      b.place("prayer-mat", mx, 61, 65, 56);
      prayerMat(b.e, mx, 61, 65, 56);
    }
    return b.done();
  },
  study: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = Math.min(130, W);
    b.place("desk", 0, 0, width, 55);
    desk(b.e, 0, 0, width, 55);
    if (D >= 112) {
      const x = width / 2 - 20;
      b.place("office-chair", x, 68, 40, 40, 180);
      chair(b.e, x, 68, 40, 40, "south");
    }
    return b.done();
  },
  shop: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    const width = Math.min(W, 300);
    b.place("display-shelf", 0, 0, width, 38);
    displayShelf(b.e, 0, 0, width, 38);
    if (D >= 220) {
      const x = Math.max(0, W - 140),
        w = Math.min(140, W);
      b.place("shop-counter", x, D - 60, w, 60);
      shopCounter(b.e, x, D - 60, w, 60);
    }
    return b.done();
  },
  utility: (_room, W, D) => {
    const b = layoutBuilder(W, D);
    b.place("washing-machine", 0, 0, 60, 60);
    washingMachine(b.e, 0, 0, 60, 60);
    if (W >= 125) {
      const w = Math.min(110, W - 67);
      b.place("laundry-counter", 67, 0, w, 55);
      laundryCounter(b.e, 67, 0, w, 55);
    }
    return b.done();
  },
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
  if (/prayer|pooja|puja/i.test(room.name)) return "prayer";
  if (/study|office/i.test(room.name)) return "study";
  return room.kind === "shop" ? "shop" : "utility";
}

export const AUTO_INSET = 13;
export const autoFurnitureId = (roomId: string, index: number) =>
  `auto:${roomId}:${index}`;

/**
 * The automatic furnishing for a room: the recipe for its kind tried in each
 * permitted orientation, scored against door approaches (forced by
 * `furnishingRotation`). Parts are byte-identical to the original recipes.
 */
export function autoFurnishing(
  room: Room,
  walls: readonly Wall[] = [],
): { items: FurnitureItem[]; parts: RoomDetail[] } {
  const inset = AUTO_INSET,
    rw = room.bounds.w - inset * 2,
    rd = room.bounds.d - inset * 2;
  if (rw <= 0 || rd <= 0) return { items: [], parts: [] };
  const doors = roomDoorApproaches(room, walls);
  const orientations =
    room.furnishingRotation === undefined
      ? [0, 1, 2, 3]
      : [room.furnishingRotation / 90];
  const recipe = AUTO_LAYOUTS[autoLayoutKind(room)];
  const candidates = orientations.map((turns) => {
    const w = turns % 2 ? rd : rw,
      d = turns % 2 ? rw : rd;
    const layout = recipe(room, w, d);
    const parts = layout.parts.map(({ owner, part }) => {
      const r = turnRect(part.bounds, w, d, turns);
      return {
        ...part,
        bounds: {
          ...r,
          x: r.x + room.bounds.x + inset,
          z: r.z + room.bounds.z + inset,
        },
        ownerId: autoFurnitureId(room.id, owner),
      };
    });
    const obstruction = parts.reduce(
      (sum, part) =>
        sum + doors.reduce((n, door) => n + overlapArea(part.bounds, door), 0),
      0,
    );
    return { turns, w, d, layout, parts, score: parts.length * 40 - obstruction };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { items: [], parts: [] };
  const owners = new Set(best.layout.parts.map((p) => p.owner));
  const items = best.layout.items.flatMap((placement, index): FurnitureItem[] => {
    if (!owners.has(index)) return [];
    const r = turnRect(placement.rect, best.w, best.d, best.turns);
    return [
      {
        id: autoFurnitureId(room.id, index),
        catalogId: placement.catalogId,
        x: r.x + inset + r.w / 2,
        z: r.z + inset + r.d / 2,
        rotation: ((placement.rotation + best.turns * 90) % 360) as QuarterTurn,
        w: placement.w,
        d: placement.d,
      },
    ];
  });
  return { items, parts: best.parts };
}
/** Automatic furniture items (room-local centres, `auto:` ids). */
export const autoFurniture = (room: Room, walls: readonly Wall[] = []) =>
  autoFurnishing(room, walls).items;
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
/** An item's parts in plot centimetres, owned by the item. */
export function furnitureParts(room: Room, item: FurnitureItem): RoomDetail[] {
  const entry = CATALOG.get(item.catalogId),
    gen = GENERATORS[item.catalogId];
  if (!entry || !gen) return [];
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
    const source =
      sized && prev.furniture === room.furniture
        ? reframeForResize(prev, room, room.furniture)
        : room.furniture;
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
