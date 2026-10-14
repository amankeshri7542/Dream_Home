// Material identities and resolution rules. The renderer maps ids to textures;
// the domain owns which ids exist and how legacy fields stay in sync.
import { finalizeEdit } from "./edit";
import { findRoom, replaceRoom } from "./furniture";
import { allocateId, componentIds } from "./geometry";
import {
  autoLandscape,
  findLandscapeSpot,
  isFence,
  nudgeLandscape,
  normalizeLandscapeItem,
} from "./landscape";
import { roomFloorFinish } from "./roomDetails";
import type {
  ComponentRef,
  EditResult,
  LandscapeItem,
  Project,
  ProjectStyle,
  RoofStyle,
  Room,
  RoomKind,
  SiteStyle,
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
} as const satisfies Record<string, Swatch>;
export type TrimColorId = keyof typeof TRIM_COLORS;

export const DOOR_COLORS = {
  oak: { label: "Oak", color: "#a87a52" },
  sage: { label: "Sage", color: "#7f9a83" },
  navy: { label: "Navy", color: "#3f4f6b" },
  terracotta: { label: "Terracotta", color: "#b5562f" },
  charcoal: { label: "Charcoal", color: "#3b3936" },
  white: { label: "White", color: "#efebe3" },
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
export function roomFloorMaterial(room: Room): FloorMaterialId {
  if (isFloorMaterial(room.floorMaterial)) return room.floorMaterial;
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
export function roomWallPaint(room: Room): WallPaintId {
  return isWallPaint(room.wallColor) ? room.wallColor : DEFAULT_PAINT[room.kind];
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
      (r.wallColor !== undefined && !isWallPaint(r.wallColor))
    )
      bad(source, floorIds);
  };
  for (const f of p.floors)
    for (const r of f.rooms)
      room(r, { kind: "room", id: r.id, floorId: f.id }, [f.id]);
  for (const s of p.stagedRooms ?? [])
    room(s.room, { kind: "staged", id: s.room.id }, []);
});
