// Domain material ids → renderer looks (texture kind, physical tile size in
// metres, roughness, bump). Colours come from src/domain/materials.ts so the
// 2D plan and 3D view agree.
import {
  EXTERIOR_FINISHES,
  FLOOR_MATERIALS,
  GROUND_STYLES,
  ROOF_MATERIALS,
  type ExteriorFinishId,
  type FloorMaterialId,
  type GroundId,
  type RoofMaterialId,
} from "../../domain/materials";

export type TextureKind =
  | "plaster"
  | "stucco"
  | "render"
  | "brick"
  | "sandstone"
  | "ashlar"
  | "timber"
  | "boardConcrete"
  | "planks"
  | "herringbone"
  | "tile"
  | "terrazzo"
  | "marble"
  | "limestone"
  | "slate"
  | "polished"
  | "carpet"
  | "terracottaRoof"
  | "slateRoof"
  | "metalRoof"
  | "membrane"
  | "lawn"
  | "meadow"
  | "gravel"
  | "soil"
  | "paint"
  | "stoneSmall"
  | "concrete"
  | "asphalt"
  | "pavers";

export type Look = {
  texture: TextureKind;
  color: string;
  /** Physical size of one texture tile, metres [u, v]. */
  tile: [number, number];
  roughness: number;
  bumpScale: number;
  metalness?: number;
};

export type FacadeLook = Look & {
  /** Stone used for sills, lintels and the plinth band. */
  stone: string;
  /** Optional accent band at each floor line and on the parapet (two-tone). */
  band?: string;
};

export const FACADE_LOOKS: Record<ExteriorFinishId, FacadeLook> = {
  ivory: { texture: "plaster", color: EXTERIOR_FINISHES.ivory.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#cfc4ae" },
  brick: { texture: "brick", color: EXTERIOR_FINISHES.brick.color, tile: [1, 0.6], roughness: 0.9, bumpScale: 2.2, stone: "#ddd2bd" },
  sand: { texture: "sandstone", color: EXTERIOR_FINISHES.sand.color, tile: [1.6, 1.2], roughness: 0.9, bumpScale: 1.4, stone: "#e4d8c0" },
  "white-stucco": { texture: "stucco", color: EXTERIOR_FINISHES["white-stucco"].color, tile: [1.5, 1.5], roughness: 0.94, bumpScale: 1.1, stone: "#cfc7b8" },
  "grey-render": { texture: "render", color: EXTERIOR_FINISHES["grey-render"].color, tile: [2, 2], roughness: 0.9, bumpScale: 0.5, stone: "#e6e1d6" },
  timber: { texture: "timber", color: EXTERIOR_FINISHES.timber.color, tile: [2.4, 1.2], roughness: 0.8, bumpScale: 1.6, stone: "#c9bfae" },
  stone: { texture: "ashlar", color: EXTERIOR_FINISHES.stone.color, tile: [1.6, 1.2], roughness: 0.88, bumpScale: 1.8, stone: "#e6dcc8" },
  concrete: { texture: "boardConcrete", color: EXTERIOR_FINISHES.concrete.color, tile: [2.4, 1.2], roughness: 0.86, bumpScale: 1.0, stone: "#d9d4ca" },
  charcoal: { texture: "render", color: EXTERIOR_FINISHES.charcoal.color, tile: [2, 2], roughness: 0.9, bumpScale: 0.5, stone: "#b9b2a6" },
  saffron: { texture: "plaster", color: EXTERIOR_FINISHES.saffron.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#e9e0cf" },
  peach: { texture: "plaster", color: EXTERIOR_FINISHES.peach.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#e8dfcf" },
  mint: { texture: "plaster", color: EXTERIOR_FINISHES.mint.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#e6e1d6" },
  sky: { texture: "plaster", color: EXTERIOR_FINISHES.sky.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#e6e1d6" },
  lime: { texture: "plaster", color: EXTERIOR_FINISHES.lime.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#e8e2d2" },
  rose: { texture: "plaster", color: EXTERIOR_FINISHES.rose.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#ebe2d6" },
  ochre: { texture: "stucco", color: EXTERIOR_FINISHES.ochre.color, tile: [1.5, 1.5], roughness: 0.94, bumpScale: 1.0, stone: "#e6dcc8" },
  "two-tone": { texture: "plaster", color: EXTERIOR_FINISHES["two-tone"].color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6, stone: "#d9d3c8", band: "#b9603f" },
};

export const FLOOR_LOOKS: Record<FloorMaterialId, Look> = {
  oak: { texture: "planks", color: FLOOR_MATERIALS.oak.color, tile: [2.4, 1.44], roughness: 0.62, bumpScale: 0.6 },
  walnut: { texture: "planks", color: FLOOR_MATERIALS.walnut.color, tile: [2.4, 1.44], roughness: 0.55, bumpScale: 0.6 },
  herringbone: { texture: "herringbone", color: FLOOR_MATERIALS.herringbone.color, tile: [1.0, 1.0], roughness: 0.6, bumpScale: 0.6 },
  "light-tile": { texture: "tile", color: FLOOR_MATERIALS["light-tile"].color, tile: [1.2, 1.2], roughness: 0.38, bumpScale: 0.8 },
  terrazzo: { texture: "terrazzo", color: FLOOR_MATERIALS.terrazzo.color, tile: [1.2, 1.2], roughness: 0.32, bumpScale: 0.3 },
  marble: { texture: "marble", color: FLOOR_MATERIALS.marble.color, tile: [1.2, 1.2], roughness: 0.18, bumpScale: 0.3 },
  limestone: { texture: "limestone", color: FLOOR_MATERIALS.limestone.color, tile: [1.2, 1.2], roughness: 0.6, bumpScale: 0.6 },
  slate: { texture: "slate", color: FLOOR_MATERIALS.slate.color, tile: [0.8, 0.8], roughness: 0.7, bumpScale: 1.2 },
  concrete: { texture: "polished", color: FLOOR_MATERIALS.concrete.color, tile: [2.4, 2.4], roughness: 0.42, bumpScale: 0.3 },
  carpet: { texture: "carpet", color: FLOOR_MATERIALS.carpet.color, tile: [1, 1], roughness: 0.98, bumpScale: 0.8 },
};

export const ROOF_LOOKS: Record<RoofMaterialId, Look> = {
  terracotta: { texture: "terracottaRoof", color: ROOF_MATERIALS.terracotta.color, tile: [1.0, 1.2], roughness: 0.75, bumpScale: 3 },
  slate: { texture: "slateRoof", color: ROOF_MATERIALS.slate.color, tile: [1.2, 0.88], roughness: 0.7, bumpScale: 2 },
  metal: { texture: "metalRoof", color: ROOF_MATERIALS.metal.color, tile: [0.9, 2.0], roughness: 0.45, bumpScale: 2, metalness: 0.35 },
  membrane: { texture: "membrane", color: ROOF_MATERIALS.membrane.color, tile: [2, 2], roughness: 0.92, bumpScale: 0.6 },
};

export const GROUND_LOOKS: Record<GroundId, Look> = {
  lawn: { texture: "lawn", color: GROUND_STYLES.lawn.color, tile: [3, 3], roughness: 0.96, bumpScale: 1.2 },
  meadow: { texture: "meadow", color: GROUND_STYLES.meadow.color, tile: [3, 3], roughness: 0.97, bumpScale: 1.4 },
  gravel: { texture: "gravel", color: GROUND_STYLES.gravel.color, tile: [1.2, 1.2], roughness: 0.95, bumpScale: 2 },
  soil: { texture: "soil", color: GROUND_STYLES.soil.color, tile: [2, 2], roughness: 0.98, bumpScale: 1.5 },
};

/** Neutral (near-white) textures multiplied by vertex colours. */
export const NEUTRAL_LOOKS = {
  paint: { texture: "paint", color: "#ffffff", tile: [2, 2], roughness: 0.9, bumpScale: 0.35 },
  stone: { texture: "stoneSmall", color: "#ffffff", tile: [1.2, 0.6], roughness: 0.85, bumpScale: 1.2 },
  slab: { texture: "concrete", color: "#ffffff", tile: [2, 2], roughness: 0.9, bumpScale: 0.5 },
  asphalt: { texture: "asphalt", color: "#ffffff", tile: [3, 3], roughness: 0.95, bumpScale: 0.8 },
  pavers: { texture: "pavers", color: "#ffffff", tile: [1.2, 1.2], roughness: 0.88, bumpScale: 1 },
} satisfies Record<string, Look>;

/** Sun-gold selection, crimson blocked, sage valid, amber snap. */
export const UI_COLORS = {
  selection: "#f4bc55",
  blocked: "#b3283f",
  valid: "#4d7a53",
  snap: "#d89b23",
  hover: "#ffe2a3",
  poche: "#4b443d",
};

/** Procedural furniture buckets (DETAIL_MATERIALS keys → finish group). */
export const FURNITURE_GROUP: Record<string, "soft" | "matte" | "gloss"> = {
  timber: "matte",
  oak: "matte",
  linen: "soft",
  fabric: "soft",
  cushion: "soft",
  cabinet: "matte",
  stone: "matte",
  ceramic: "gloss",
  steel: "gloss",
  dark: "gloss",
  water: "gloss",
  clay: "matte",
  leaf: "soft",
  glow: "gloss",
};
