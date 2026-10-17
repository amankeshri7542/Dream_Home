// Material identities and resolution rules. The renderer maps ids to textures;
// the domain owns which ids exist and how legacy fields stay in sync.
import { finalizeEdit } from "./edit";
import {
  FURNITURE_FINISHES,
  autoLayoutKind,
  findRoom,
  furnitureCatalogItem,
  replaceRoom,
  type AutoLayoutKind,
  type FinishSlot,
} from "./furniture";
import { allocateId, componentIds } from "./geometry";
import {
  autoLandscape,
  findLandscapeSpot,
  isFence,
  nudgeLandscape,
  normalizeLandscapeItem,
} from "./landscape";
import { roomFloorFinish } from "./roomDetails";
import { RAILING_KINDS, STYLE_PRESETS } from "./persist";
import type {
  AccentWall,
  ComponentRef,
  EdgeSide,
  EditResult,
  FurnitureItem,
  LandscapeItem,
  Project,
  ProjectStyle,
  RailingKind,
  RoofStyle,
  Room,
  RoomKind,
  SiteStyle,
  StyleDetails,
  StylePreset,
} from "./types";
import { registerValidation } from "./validate";

type Swatch = { label: string; color: string };
type LegacyFinish = NonNullable<Project["finish"]>;

export const EXTERIOR_FINISHES = {
  ivory: { label: "Ivory plaster", color: "#ede5d3", legacy: "ivory" },
  brick: { label: "Warm brick", color: "#b5654a", legacy: "brick" },
  sand: { label: "Sandstone", color: "#d8be95", legacy: "sand" },
  "white-stucco": { label: "White stucco", color: "#f3efe6", legacy: "ivory" },
  "grey-render": { label: "Soft grey render", color: "#c9c5bd", legacy: "ivory" },
  timber: { label: "Timber cladding", color: "#a8774f", legacy: "brick" },
  stone: { label: "Ashlar stone", color: "#cbbfa8", legacy: "sand" },
  concrete: { label: "Board concrete", color: "#bdb8ae", legacy: "ivory" },
  charcoal: { label: "Charcoal render", color: "#55514c", legacy: "brick" },
  // Bright limewash and emulsion colours of Indian homes. `legacy` is the
  // nearest of the three original families (by RGB distance).
  saffron: { label: "Saffron", color: "#f0a447", legacy: "sand" },
  peach: { label: "Peach", color: "#f7d3b4", legacy: "ivory" },
  mint: { label: "Mint", color: "#bfe2c6", legacy: "ivory" },
  sky: { label: "Sky blue", color: "#a8d2ea", legacy: "ivory" },
  lime: { label: "Lime", color: "#d2e07c", legacy: "sand" },
  rose: { label: "Rose pink", color: "#eeb1b8", legacy: "sand" },
  ochre: { label: "Ochre", color: "#d9a443", legacy: "brick" },
  "two-tone": { label: "Indian modern two-tone", color: "#f4ede0", legacy: "ivory" },
} as const satisfies Record<string, Swatch & { legacy: LegacyFinish }>;
export type ExteriorFinishId = keyof typeof EXTERIOR_FINISHES;

export const WALL_PAINTS = {
  "warm-white": { label: "Warm white", color: "#f2ede4" },
  linen: { label: "Linen", color: "#e9dfcf" },
  greige: { label: "Greige", color: "#d8cfc2" },
  sage: { label: "Sage", color: "#c9d3c0" },
  eucalyptus: { label: "Eucalyptus", color: "#a9bcab" },
  "dusty-blue": { label: "Dusty blue", color: "#bfcfd9" },
  navy: { label: "Deep navy", color: "#4a5a74" },
  terracotta: { label: "Terracotta", color: "#d39a7f" },
  blush: { label: "Blush", color: "#ebd3c8" },
  ochre: { label: "Ochre", color: "#e2c07f" },
  clay: { label: "Clay", color: "#d9b8a0" },
  charcoal: { label: "Charcoal", color: "#5a5652" },
} as const satisfies Record<string, Swatch>;
export type WallPaintId = keyof typeof WALL_PAINTS;

export const FLOOR_MATERIALS = {
  oak: { label: "Warm oak", color: "#c9a273", family: "wood" },
  walnut: { label: "Walnut", color: "#7c5a40", family: "wood" },
  herringbone: { label: "Herringbone", color: "#c49a6c", family: "wood" },
  "light-tile": { label: "Light tile", color: "#dcdcd3", family: "tile" },
  terrazzo: { label: "Terrazzo", color: "#e6e0d6", family: "tile" },
  marble: { label: "Marble", color: "#eeebe6", family: "stone" },
  limestone: { label: "Natural stone", color: "#cfc6b5", family: "stone" },
  slate: { label: "Slate", color: "#6d7175", family: "stone" },
  concrete: { label: "Polished concrete", color: "#b9b5ad", family: "stone" },
  carpet: { label: "Soft carpet", color: "#cdbfae", family: "wood" },
} as const satisfies Record<
  string,
  Swatch & { family: "wood" | "tile" | "stone" }
>;
export type FloorMaterialId = keyof typeof FLOOR_MATERIALS;
const LEGACY_FLOOR: Record<"wood" | "tile" | "stone", FloorMaterialId> = {
  wood: "oak",
  tile: "light-tile",
  stone: "limestone",
};

export const ROOF_MATERIALS = {
  terracotta: { label: "Terracotta tiles", color: "#c2693f" },
  slate: { label: "Slate", color: "#5d6670" },
  metal: { label: "Standing seam", color: "#7f8b8f" },
  membrane: { label: "Flat membrane", color: "#b9b3a6" },
} as const satisfies Record<string, Swatch>;
export type RoofMaterialId = keyof typeof ROOF_MATERIALS;
export const ROOF_STYLES: Record<RoofStyle, { label: string }> = {
  flat: { label: "Flat" },
  gable: { label: "Gable" },
  hip: { label: "Hip" },
  shed: { label: "Shed" },
};

export const TRIM_COLORS = {
  "warm-white": { label: "Warm white", color: "#f4f1ea" },
  charcoal: { label: "Charcoal", color: "#3c3a36" },
  oak: { label: "Oak", color: "#b98b5e" },
  sage: { label: "Sage", color: "#8fa58e" },
  maroon: { label: "Maroon", color: "#7c2f2b" },
  teal: { label: "Peacock teal", color: "#1f6b70" },
} as const satisfies Record<string, Swatch>;
export type TrimColorId = keyof typeof TRIM_COLORS;

export const DOOR_COLORS = {
  oak: { label: "Oak", color: "#a87a52" },
  sage: { label: "Sage", color: "#7f9a83" },
  navy: { label: "Navy", color: "#3f4f6b" },
  terracotta: { label: "Terracotta", color: "#b5562f" },
  charcoal: { label: "Charcoal", color: "#3b3936" },
  white: { label: "White", color: "#efebe3" },
  teak: { label: "Teak", color: "#7a4a27" },
  peacock: { label: "Peacock teal", color: "#1f6b70" },
} as const satisfies Record<string, Swatch>;
export type DoorColorId = keyof typeof DOOR_COLORS;

export const GROUND_STYLES = {
  lawn: { label: "Lawn", color: "#8daa74" },
  meadow: { label: "Wild meadow", color: "#9fb07a" },
  gravel: { label: "Gravel", color: "#cfc4ae" },
  soil: { label: "Bare soil", color: "#a88664" },
} as const satisfies Record<string, Swatch>;
export type GroundId = keyof typeof GROUND_STYLES;

export const isExterior = (id: unknown): id is ExteriorFinishId =>
  typeof id === "string" && id in EXTERIOR_FINISHES;
export const isWallPaint = (id: unknown): id is WallPaintId =>
  typeof id === "string" && id in WALL_PAINTS;
export const isFloorMaterial = (id: unknown): id is FloorMaterialId =>
  typeof id === "string" && id in FLOOR_MATERIALS;
export const isRoofMaterial = (id: unknown): id is RoofMaterialId =>
  typeof id === "string" && id in ROOF_MATERIALS;
export const isTrim = (id: unknown): id is TrimColorId =>
  typeof id === "string" && id in TRIM_COLORS;
export const isDoorColor = (id: unknown): id is DoorColorId =>
  typeof id === "string" && id in DOOR_COLORS;
export const isGround = (id: unknown): id is GroundId =>
  typeof id === "string" && id in GROUND_STYLES;

export function exteriorFinish(p: Project): ExteriorFinishId {
  if (isExterior(p.style?.exterior)) return p.style.exterior;
  return p.finish ?? "ivory";
}
/**
 * A room's floor: its chosen material, else its legacy family, else (with a
 * Look) the look's floor for the room, else the room-type default.
 */
export function roomFloorMaterial(room: Room, look?: StylePreset | null): FloorMaterialId {
  if (isFloorMaterial(room.floorMaterial)) return room.floorMaterial;
  if (!room.floorFinish || room.floorFinish === "auto") {
    const palette = roomPalette(look, room);
    if (palette) return palette.floor;
  }
  return LEGACY_FLOOR[roomFloorFinish(room)];
}
const DEFAULT_PAINT: Record<RoomKind, WallPaintId> = {
  living: "warm-white",
  kitchen: "linen",
  bedroom: "greige",
  bathroom: "warm-white",
  dining: "linen",
  utility: "warm-white",
  shop: "warm-white",
};
/** A room's wall paint: its own, else (with a Look) the look's, else the room-type default. */
export function roomWallPaint(room: Room, look?: StylePreset | null): WallPaintId {
  if (isWallPaint(room.wallColor)) return room.wallColor;
  return roomPalette(look, room)?.paint ?? DEFAULT_PAINT[room.kind];
}
/** A room's accent wall, when it has a valid one. */
export function roomAccentWall(room: Room): { edge: EdgeSide; color: WallPaintId } | null {
  const a = room.accentWall;
  return a && EDGE_SIDES.includes(a.edge) && isWallPaint(a.color) ? { edge: a.edge, color: a.color } : null;
}
const EDGE_SIDES: readonly EdgeSide[] = ["north", "east", "south", "west"];

// ---------------------------------------------------------------------------
// Room palettes: every automatic room already looks designed. A Look picks a
// coordinated palette per room use (bedrooms vary by room); pieces without a
// chosen finish, walls without a paint and floors without a material use it.
// Homes without a Look keep the original defaults.
// ---------------------------------------------------------------------------
export type RoomPalette = {
  paint: WallPaintId;
  floor: FloorMaterialId;
  /** Upholstery: beds, sofas, diwans. */
  fabric: string;
  /** Soft furnishings: rugs, curtains, headboard panels, mats. */
  soft: string;
  /** Pops of colour: cushions, poufs, armchairs, desk chairs. */
  pop: string;
  /** Wood: tables, storage, frames. */
  wood: string;
  /** One accent colour per room: lamps, art, accessories. */
  accent: string;
  /** Kitchen cabinets. */
  cabinet: string;
  /** Tiles: backsplashes. */
  tile: string;
};
type PaletteKind = Exclude<AutoLayoutKind, "shop">;
type Swatches = Omit<RoomPalette, "cabinet" | "tile"> & Partial<Pick<RoomPalette, "cabinet" | "tile">>;
const LOOK_PALETTES: Record<StylePreset, Record<PaletteKind, Swatches[]>> = {
  "indian-modern": {
    living: [
      { paint: "warm-white", floor: "marble", fabric: "oat", soft: "terracotta", pop: "mustard", wood: "walnut", accent: "mustard" },
      { paint: "linen", floor: "marble", fabric: "sage", soft: "oat", pop: "terracotta", wood: "teak", accent: "terracotta" },
    ],
    bedroom: [
      { paint: "sage", floor: "oak", fabric: "oat", soft: "sage", pop: "mustard", wood: "walnut", accent: "mustard" },
      { paint: "dusty-blue", floor: "oak", fabric: "oat", soft: "navy", pop: "mustard", wood: "oak", accent: "navy" },
      { paint: "blush", floor: "herringbone", fabric: "oat", soft: "blush", pop: "terracotta", wood: "teak", accent: "terracotta" },
      { paint: "linen", floor: "oak", fabric: "sage", soft: "oat", pop: "peacock", wood: "walnut", accent: "peacock" },
    ],
    kitchen: [
      { paint: "linen", floor: "terrazzo", fabric: "oat", soft: "oat", pop: "mustard", wood: "oak", accent: "charcoal", cabinet: "sage", tile: "mustard" },
      { paint: "warm-white", floor: "terrazzo", fabric: "oat", soft: "oat", pop: "terracotta", wood: "walnut", accent: "charcoal", cabinet: "white", tile: "peacock" },
    ],
    dining: [
      { paint: "linen", floor: "marble", fabric: "oat", soft: "terracotta", pop: "mustard", wood: "walnut", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "light-tile", fabric: "oat", soft: "sage", pop: "sage", wood: "oak", accent: "white", tile: "peacock" },
    ],
    prayer: [
      { paint: "warm-white", floor: "marble", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "sage", floor: "oak", fabric: "oat", soft: "oat", pop: "navy", wood: "oak", accent: "mustard" },
    ],
    utility: [
      { paint: "warm-white", floor: "light-tile", fabric: "oat", soft: "oat", pop: "sage", wood: "oak", accent: "white" },
    ],
  },
  "indian-classic": {
    living: [
      { paint: "ochre", floor: "marble", fabric: "maroon", soft: "mustard", pop: "peacock", wood: "walnut", accent: "peacock" },
      { paint: "clay", floor: "marble", fabric: "peacock", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    bedroom: [
      { paint: "clay", floor: "walnut", fabric: "maroon", soft: "mustard", pop: "peacock", wood: "walnut", accent: "mustard" },
      { paint: "terracotta", floor: "walnut", fabric: "oat", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
      { paint: "eucalyptus", floor: "walnut", fabric: "peacock", soft: "oat", pop: "mustard", wood: "walnut", accent: "mustard" },
      { paint: "linen", floor: "herringbone", fabric: "mustard", soft: "maroon", pop: "peacock", wood: "teak", accent: "maroon" },
    ],
    kitchen: [
      { paint: "linen", floor: "limestone", fabric: "oat", soft: "maroon", pop: "mustard", wood: "walnut", accent: "charcoal", cabinet: "peacock", tile: "mustard" },
    ],
    dining: [
      { paint: "clay", floor: "marble", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "walnut", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "limestone", fabric: "oat", soft: "maroon", pop: "mustard", wood: "walnut", accent: "mustard", tile: "maroon" },
    ],
    prayer: [
      { paint: "ochre", floor: "marble", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "eucalyptus", floor: "walnut", fabric: "oat", soft: "mustard", pop: "maroon", wood: "walnut", accent: "mustard" },
    ],
    utility: [
      { paint: "linen", floor: "limestone", fabric: "oat", soft: "oat", pop: "mustard", wood: "walnut", accent: "white" },
    ],
  },
  diorama: {
    living: [
      { paint: "warm-white", floor: "oak", fabric: "sage", soft: "oat", pop: "mustard", wood: "oak", accent: "terracotta" },
    ],
    bedroom: [
      { paint: "greige", floor: "oak", fabric: "sage", soft: "oat", pop: "blush", wood: "oak", accent: "sage" },
      { paint: "dusty-blue", floor: "oak", fabric: "navy", soft: "oat", pop: "mustard", wood: "oak", accent: "mustard" },
      { paint: "blush", floor: "oak", fabric: "oat", soft: "blush", pop: "terracotta", wood: "white", accent: "terracotta" },
    ],
    kitchen: [
      { paint: "linen", floor: "light-tile", fabric: "oat", soft: "oat", pop: "terracotta", wood: "oak", accent: "white", cabinet: "sage", tile: "white" },
    ],
    dining: [
      { paint: "linen", floor: "limestone", fabric: "sage", soft: "oat", pop: "mustard", wood: "oak", accent: "terracotta" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "light-tile", fabric: "oat", soft: "sage", pop: "sage", wood: "oak", accent: "white", tile: "sage" },
    ],
    prayer: [
      { paint: "warm-white", floor: "limestone", fabric: "terracotta", soft: "terracotta", pop: "mustard", wood: "walnut", accent: "mustard" },
    ],
    study: [
      { paint: "sage", floor: "oak", fabric: "oat", soft: "oat", pop: "charcoal", wood: "oak", accent: "mustard" },
    ],
    utility: [
      { paint: "warm-white", floor: "light-tile", fabric: "oat", soft: "oat", pop: "sage", wood: "oak", accent: "white" },
    ],
  },
};
/** Stable small hash of a room id (bedrooms pick their palette by it). */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** The coordinated palette a Look gives a room (null without a Look, or for shops). */
export function roomPalette(
  look: StylePreset | null | undefined,
  room: Pick<Room, "id" | "kind" | "name">,
): RoomPalette | null {
  if (!look || !(look in LOOK_PALETTES)) return null;
  const kind = autoLayoutKind(room);
  if (kind === "shop") return null;
  const options = LOOK_PALETTES[look][kind];
  const s = options[hashId(room.id) % options.length];
  return { cabinet: s.accent, tile: s.accent, ...s };
}
/** The palette for a room of this project (null for homes without a Look). */
export function autoPalette(project: Pick<Project, "style">, room: Room): RoomPalette | null {
  return roomPalette(project.style?.preset ?? null, room);
}
const SOFT_PIECES = new Set(["rug-rect", "rug-round", "curtains", "bed-panel", "prayer-mat", "sleeping-mat"]);
const POP_PIECES = new Set(["cushions", "ottoman", "armchair", "office-chair"]);
const CABINETS = new Set(["kitchen-counter", "kitchen-base", "kitchen-sink", "kitchen-stove", "kitchen-upper", "kitchen-island"]);
const TILES = new Set(["backsplash", "backsplash-module"]);
/** Appliances keep their catalog colour. */
const APPLIANCES = new Set(["fridge"]);
/** The palette's finish for a catalog piece (only one the piece comes in). */
export function paletteFinish(palette: RoomPalette | null, catalogId: string): string | undefined {
  const entry = furnitureCatalogItem(catalogId);
  if (!palette || !entry?.finishSlot || APPLIANCES.has(catalogId)) return undefined;
  const pick =
    entry.finishSlot === "fabric"
      ? SOFT_PIECES.has(catalogId)
        ? palette.soft
        : POP_PIECES.has(catalogId)
          ? palette.pop
          : palette.fabric
      : entry.finishSlot === "wood"
        ? palette.wood
        : CABINETS.has(catalogId)
          ? palette.cabinet
          : TILES.has(catalogId)
            ? palette.tile
            : palette.accent;
  return entry.finishes?.includes(pick) ? pick : undefined;
}
/** Colour for a piece's other tintable parts (a bed's frame, an artwork's frame, a jhula's cushion). */
export function paletteTint(palette: RoomPalette | null, slot: FinishSlot): string | undefined {
  if (!palette) return undefined;
  const id = slot === "fabric" ? palette.pop : slot === "wood" ? palette.wood : palette.accent;
  return FURNITURE_FINISHES[slot]?.[id];
}
/** The finish a piece shows: its own, else its room's palette, else the catalog default. */
export function effectiveFinish(
  project: Pick<Project, "style">,
  room: Room,
  item: Pick<FurnitureItem, "catalogId" | "finish">,
): string | undefined {
  return (
    item.finish ??
    paletteFinish(autoPalette(project, room), item.catalogId) ??
    furnitureCatalogItem(item.catalogId)?.defaultFinish
  );
}
/** A contrasting paint for a feature wall, from a room's main paint. */
export const ACCENT_FOR_PAINT: Record<WallPaintId, WallPaintId> = {
  "warm-white": "terracotta",
  linen: "ochre",
  greige: "charcoal",
  sage: "eucalyptus",
  eucalyptus: "navy",
  "dusty-blue": "navy",
  navy: "dusty-blue",
  terracotta: "clay",
  blush: "terracotta",
  ochre: "terracotta",
  clay: "terracotta",
  charcoal: "linen",
};
/** A tasteful accent-wall colour for a room (from its paint and the home's Look). */
export function suggestAccentWall(project: Pick<Project, "style">, room: Room): WallPaintId {
  return ACCENT_FOR_PAINT[roomWallPaint(room, project.style?.preset ?? null)];
}
export const hasCourtyard = (p: Project) =>
  p.verticalSpaces.some((v) => v.kind === "courtyard");
/** The roof actually built: pitched roofs fall back to flat around courtyards. */
export function effectiveRoof(p: Project): {
  style: RoofStyle;
  material: RoofMaterialId;
  pitch: 20 | 30 | 40;
} {
  const roof = p.style?.roof;
  const style = roof && !hasCourtyard(p) ? roof.style : "flat";
  const material = isRoofMaterial(roof?.material)
    ? roof.material
    : style === "flat"
      ? "membrane"
      : "terracotta";
  return { style, material, pitch: roof?.pitch ?? 30 };
}
export function trimColor(p: Project): TrimColorId {
  return isTrim(p.style?.trim) ? p.style.trim : "warm-white";
}
export function frontDoorColor(p: Project): DoorColorId {
  return isDoorColor(p.style?.frontDoor) ? p.style.frontDoor : "oak";
}
/** Resolved regional details (absent flags are off, railings glass). */
export function styleDetails(p: Project): Required<StyleDetails> {
  const d = p.style?.details ?? {};
  return {
    chhajja: d.chhajja === true,
    waterTank: d.waterTank === true,
    carPorch: d.carPorch === true,
    railing: d.railing && RAILING_KINDS.includes(d.railing) ? d.railing : "glass",
  };
}
export const stylePreset = (p: Project): StylePreset | null => p.style?.preset ?? null;
export function siteGround(p: Project): GroundId {
  if (isGround(p.site?.ground)) return p.site.ground;
  return p.garden ? "lawn" : "soil";
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
const INVALID: EditResult = { ok: false, error: "Choose a valid finish." };
const compact = <T extends object>(o: T): T | undefined =>
  Object.keys(o).length ? o : undefined;
function withStyle(p: Project, style: ProjectStyle | undefined): Project {
  const { style: _old, ...rest } = p;
  void _old;
  return style ? { ...rest, style } : rest;
}

/**
 * Sets the exterior finish. Richer finishes live in `style.exterior` with the
 * legacy `finish` kept to their family; the three legacy ids clear it.
 */
export function setExterior(p: Project, id: string): EditResult {
  if (!isExterior(id)) return INVALID;
  const legacy = EXTERIOR_FINISHES[id].legacy;
  const { exterior: _exterior, ...style } = p.style ?? {};
  void _exterior;
  return finalizeEdit(
    p,
    withStyle(
      { ...p, finish: legacy },
      compact(id === legacy ? style : { ...style, exterior: id }),
    ),
  );
}
function editRoom(
  p: Project,
  floorId: string | null,
  roomId: string,
  change: (room: Room) => Room,
): EditResult {
  const room = findRoom(p, floorId, roomId);
  if (!room) return { ok: false, error: "Room not found." };
  return finalizeEdit(p, replaceRoom(p, floorId, change(room)), {
    subject: roomId,
  });
}
/** Sets a room's floor material ("auto" returns to the room-type default). */
export function setRoomFloorMaterial(
  p: Project,
  floorId: string | null,
  roomId: string,
  id: string,
): EditResult {
  if (id !== "auto" && !isFloorMaterial(id)) return INVALID;
  return editRoom(p, floorId, roomId, (room) => {
    const { floorMaterial: _m, floorFinish: _f, ...rest } = room;
    void [_m, _f];
    return id === "auto"
      ? rest
      : { ...rest, floorFinish: FLOOR_MATERIALS[id].family, floorMaterial: id };
  });
}
/** Paints a room's walls (null returns to the room-type default). */
export function setRoomWallColor(
  p: Project,
  floorId: string | null,
  roomId: string,
  id: string | null,
): EditResult {
  if (id !== null && !isWallPaint(id)) return INVALID;
  return editRoom(p, floorId, roomId, (room) => {
    const { wallColor: _c, ...rest } = room;
    void _c;
    return id === null ? rest : { ...rest, wallColor: id };
  });
}
/**
 * Paints one wall of a room (its inside face) as a feature wall, or clears it
 * (edge null). Without a colour it picks one that suits the room's paint.
 */
export function setRoomAccentWall(
  p: Project,
  floorId: string | null,
  roomId: string,
  edge: EdgeSide | null,
  color?: string,
): EditResult {
  if (edge !== null && !EDGE_SIDES.includes(edge)) return INVALID;
  if (color !== undefined && !isWallPaint(color)) return INVALID;
  return editRoom(p, floorId, roomId, (room) => {
    const { accentWall: _a, ...rest } = room;
    void _a;
    if (edge === null) return rest;
    const accentWall: AccentWall = { edge, color: color ?? suggestAccentWall(p, room) };
    return { ...rest, accentWall };
  });
}
export type StylePatch = {
  trim?: string | null;
  frontDoor?: string | null;
  roof?: ProjectStyle["roof"] | null;
};
/** Sets trim, front door and roof choices (null clears one). */
export function setStyle(p: Project, patch: StylePatch): EditResult {
  const style: ProjectStyle = { ...(p.style ?? {}) };
  for (const key of ["trim", "frontDoor", "roof"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete style[key];
    else Object.assign(style, { [key]: key === "roof" ? { ...(value as object) } : value });
  }
  return finalizeEdit(p, withStyle(p, compact(style)));
}
/** Sets the plot's ground cover and fence (null clears one). */
export function setSite(
  p: Project,
  patch: { ground?: string | null; fence?: string | null },
): EditResult {
  const site: SiteStyle = { ...(p.site ?? {}) };
  for (const key of ["ground", "fence"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete site[key];
    else site[key] = value;
  }
  const { site: _old, ...rest } = p;
  void _old;
  const next = compact(site);
  return finalizeEdit(p, next ? { ...rest, site: next } : rest);
}
// ---------------------------------------------------------------------------
// Style presets ("Look"): one tap sets a coherent bundle of choices.
// ---------------------------------------------------------------------------
export const STYLE_PRESET_INFO: Record<
  StylePreset,
  { label: string; description: string; colors: [string, string, string] }
> = {
  "indian-modern": {
    label: "Indian modern",
    description: "Bright walls, flat roof with a parapet, sunshades, a water tank and a compound wall",
    colors: [EXTERIOR_FINISHES.peach.color, "#f4f1ea", "#7a4a27"],
  },
  "indian-classic": {
    label: "Indian classic",
    description: "Warm ochre limewash, maroon trim, jaali balconies and a compound wall",
    colors: [EXTERIOR_FINISHES.ochre.color, "#7c2f2b", "#1f6b70"],
  },
  diorama: {
    label: "Diorama",
    description: "The original toy look: ivory walls and a terracotta roof",
    colors: [EXTERIOR_FINISHES.ivory.color, "#c2693f", "#a87a52"],
  },
};
type PresetBundle = {
  exterior: ExteriorFinishId;
  trim: TrimColorId;
  frontDoor: DoorColorId;
  roof: NonNullable<ProjectStyle["roof"]>;
  details: StyleDetails | undefined;
  fence: string | null;
};
const PRESETS: Record<StylePreset, PresetBundle> = {
  "indian-modern": {
    exterior: "peach",
    trim: "warm-white",
    frontDoor: "teak",
    roof: { style: "flat", material: "membrane", pitch: 30 },
    details: { chhajja: true, waterTank: true, carPorch: true, railing: "grille" },
    fence: "compound-wall",
  },
  "indian-classic": {
    exterior: "ochre",
    trim: "maroon",
    frontDoor: "peacock",
    roof: { style: "flat", material: "membrane", pitch: 30 },
    details: { chhajja: true, waterTank: true, carPorch: true, railing: "jaali" },
    fence: "compound-wall",
  },
  diorama: {
    exterior: "ivory",
    trim: "warm-white",
    frontDoor: "oak",
    roof: { style: "gable", material: "terracotta", pitch: 30 },
    details: undefined,
    fence: null,
  },
};
/** The project with a preset's bundle applied (no validation). */
export function withStylePreset(p: Project, preset: StylePreset): Project {
  const b = PRESETS[preset];
  const legacy = EXTERIOR_FINISHES[b.exterior].legacy;
  const style: ProjectStyle = {
    preset,
    ...(b.exterior !== legacy ? { exterior: b.exterior } : {}),
    trim: b.trim,
    frontDoor: b.frontDoor,
    roof: { ...b.roof },
    ...(b.details ? { details: { ...b.details } } : {}),
  };
  const site: SiteStyle = { ...(p.site ?? {}) };
  if (b.fence) site.fence = b.fence;
  else delete site.fence;
  const { site: _site, ...rest } = p;
  void _site;
  return { ...rest, finish: legacy, style, ...(Object.keys(site).length ? { site } : {}) };
}
/**
 * Applies a Look: exterior, trim, front door, roof (flat with a parapet for
 * the Indian looks), regional details and the boundary wall, in one edit.
 */
export function applyStylePreset(p: Project, preset: string): EditResult {
  if (!STYLE_PRESETS.includes(preset as StylePreset))
    return { ok: false, error: "Choose a valid look." };
  return finalizeEdit(p, withStylePreset(p, preset as StylePreset));
}
/** Turns one regional detail on or off, or picks the balcony railing. */
export function setStyleDetails(p: Project, patch: StyleDetails): EditResult {
  if (patch.railing !== undefined && !RAILING_KINDS.includes(patch.railing as RailingKind))
    return INVALID;
  const details: StyleDetails = { ...(p.style?.details ?? {}), ...patch };
  for (const key of Object.keys(details) as (keyof StyleDetails)[])
    if (details[key] === undefined) delete details[key];
  const style: ProjectStyle = { ...(p.style ?? {}) };
  if (Object.keys(details).length) style.details = details;
  else delete style.details;
  return finalizeEdit(p, withStyle(p, compact(style)));
}

/** Turns the automatic garden (trees, lawn) on or off. */
export function setGarden(p: Project, on: boolean): EditResult {
  return finalizeEdit(p, { ...p, garden: on });
}
/**
 * Turns parking on or off. With a customised garden this also adds a parking
 * spot (where the automatic one would go, else the nearest free spot) or
 * removes every parking spot.
 */
export function setParking(p: Project, on: boolean): EditResult {
  const next: Project = { ...p, parking: on };
  if (!p.landscape) return finalizeEdit(p, next);
  if (!on)
    return finalizeEdit(p, {
      ...next,
      landscape: p.landscape.filter((i) => i.kind !== "parking"),
    });
  if (p.landscape.some((i) => i.kind === "parking")) return finalizeEdit(p, next);
  const id = allocateId("parking", componentIds(p));
  const auto = autoLandscape(next).find((i) => i.kind === "parking");
  let item: LandscapeItem | undefined = auto
    ? nudgeLandscape(next, normalizeLandscapeItem(auto, id), p.landscape)
    : undefined;
  if (!item) {
    const spot = findLandscapeSpot(next, "parking", {
      rotation:
        p.plot.road === "east" || p.plot.road === "west" ? 90 : 0,
    });
    if (spot) item = { id, kind: "parking", ...spot };
  }
  return finalizeEdit(
    p,
    item ? { ...next, landscape: [...p.landscape, item] } : next,
    item ? { focusId: id } : {},
  );
}

registerValidation((p, issue) => {
  const bad = (source?: ComponentRef, floorIds: string[] = []) =>
    issue("material", "Choose a valid finish.", {
      ...(source ? { source } : {}),
      floorIds,
    });
  const style = p.style;
  if (style) {
    if (style.exterior !== undefined && !isExterior(style.exterior)) bad();
    if (style.trim !== undefined && !isTrim(style.trim)) bad();
    if (style.frontDoor !== undefined && !isDoorColor(style.frontDoor)) bad();
    if (style.preset !== undefined && !STYLE_PRESETS.includes(style.preset)) bad();
    if (
      style.details?.railing !== undefined &&
      !RAILING_KINDS.includes(style.details.railing)
    )
      bad();
    if (
      style.roof !== undefined &&
      (!(style.roof.style in ROOF_STYLES) ||
        !isRoofMaterial(style.roof.material) ||
        ![20, 30, 40].includes(style.roof.pitch))
    )
      bad();
  }
  if (p.site) {
    if (p.site.ground !== undefined && !isGround(p.site.ground)) bad();
    if (p.site.fence !== undefined && !isFence(p.site.fence)) bad();
  }
  const room = (r: Room, source: ComponentRef, floorIds: string[]) => {
    if (
      (r.floorMaterial !== undefined && !isFloorMaterial(r.floorMaterial)) ||
      (r.wallColor !== undefined && !isWallPaint(r.wallColor)) ||
      (r.accentWall !== undefined && !roomAccentWall(r))
    )
      bad(source, floorIds);
  };
  for (const f of p.floors)
    for (const r of f.rooms)
      room(r, { kind: "room", id: r.id, floorId: f.id }, [f.id]);
  for (const s of p.stagedRooms ?? [])
    room(s.room, { kind: "staged", id: s.room.id }, []);
});
