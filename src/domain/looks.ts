// Looks: curated, one-tap bundles of choices. Each look sets the outside
// (finish, trim, door, roof, regional details, boundary), coordinated room
// palettes per room use, and what the automatic garden plants. Pure data; the
// commands that apply a look live in materials.ts. Names stay generic: places
// and crafts, never brands.
import type { AutoLayoutKind } from "./furniture";
import type {
  DoorColorId,
  ExteriorFinishId,
  RoomPalette,
  TrimColorId,
} from "./materials";
import type { ProjectStyle, StyleDetails, StylePreset } from "./types";

export type LookInfo = {
  label: string;
  description: string;
  /** A few words for small cards (the AI designer's style step). */
  short: string;
  /** Wall, trim and accent colours for the small fallback card art. */
  colors: [string, string, string];
  /** The region a look comes from (null for the everyday looks). */
  region: string | null;
};

/** Card order: the everyday Indian looks, the regions, then the toy look. */
export const LOOK_ORDER: readonly StylePreset[] = [
  "indian-modern",
  "indian-classic",
  "kerala",
  "chettinad",
  "rajasthani",
  "goan",
  "mumbai-modern",
  "bengaluru-contemporary",
  "diorama",
];

export const STYLE_PRESET_INFO: Record<StylePreset, LookInfo> = {
  "indian-modern": {
    label: "Indian modern",
    description: "Bright walls, flat roof with a parapet, sunshades, a water tank and a compound wall",
    short: "Bright walls, flat roof, sunshades",
    colors: ["#f7d3b4", "#f4f1ea", "#7a4a27"],
    region: null,
  },
  "indian-classic": {
    label: "Indian classic",
    description: "Warm ochre limewash, maroon trim, jaali balconies and a compound wall",
    short: "Ochre limewash, maroon, jaali",
    colors: ["#d9a443", "#7c2f2b", "#1f6b70"],
    region: null,
  },
  kerala: {
    label: "Kerala",
    description: "Sloping clay-tile roof, white lime walls on a laterite plinth, teak doors and red-oxide floors",
    short: "Clay-tile roof, red-oxide floors",
    colors: ["#f3eee2", "#b4553a", "#7a4a27"],
    region: "Kerala",
  },
  chettinad: {
    label: "Chettinad",
    description: "Glossy egg-white plaster with ochre bands, arched windows and patterned Athangudi floors",
    short: "Athangudi tiles, arches, teak",
    colors: ["#f6f1e3", "#c58a2e", "#7c2f2b"],
    region: "Tamil Nadu",
  },
  rajasthani: {
    label: "Rajasthani",
    description: "Golden sandstone, arched windows, jaali balconies, an indigo door and Kota stone floors",
    short: "Sandstone, jaali, Kota stone",
    colors: ["#d4a159", "#e8c98f", "#2f4a7a"],
    region: "Rajasthan",
  },
  goan: {
    label: "Goan",
    description: "Indigo walls with white trims, arched windows, a clay-tile roof and blue azulejo tiles",
    short: "Indigo walls, azulejo tiles",
    colors: ["#41639e", "#f4f1ea", "#b4553a"],
    region: "Goa",
  },
  "mumbai-modern": {
    label: "Mumbai modern",
    description: "Grey and white render, glass railings, sunshades and glossy vitrified floors",
    short: "Grey and white, glossy floors",
    colors: ["#c3c0b9", "#f2efe8", "#3c3a36"],
    region: "Mumbai",
  },
  "bengaluru-contemporary": {
    label: "Bengaluru contemporary",
    description: "Exposed brick and concrete, terracotta jaali, polished concrete floors and a lush garden",
    short: "Brick, concrete, lots of green",
    colors: ["#b2613f", "#bab5ab", "#a87a52"],
    region: "Bengaluru",
  },
  diorama: {
    label: "Diorama",
    description: "The original toy look: ivory walls and a terracotta roof",
    short: "Ivory walls, terracotta roof",
    colors: ["#ede5d3", "#c2693f", "#a87a52"],
    region: null,
  },
};

export type LookBundle = {
  exterior: ExteriorFinishId;
  trim: TrimColorId;
  frontDoor: DoorColorId;
  roof: NonNullable<ProjectStyle["roof"]>;
  details: StyleDetails | undefined;
  fence: string | null;
};

const FLAT = { style: "flat", material: "membrane", pitch: 30 } as const;

export const LOOK_BUNDLES: Record<StylePreset, LookBundle> = {
  "indian-modern": {
    exterior: "peach",
    trim: "warm-white",
    frontDoor: "teak",
    roof: FLAT,
    details: { chhajja: true, waterTank: true, carPorch: true, railing: "grille" },
    fence: "compound-wall",
  },
  "indian-classic": {
    exterior: "ochre",
    trim: "maroon",
    frontDoor: "peacock",
    roof: FLAT,
    details: { chhajja: true, waterTank: true, carPorch: true, railing: "jaali" },
    fence: "compound-wall",
  },
  // Deep eaves do the sunshades' job, and a sloping roof has no terrace tank.
  kerala: {
    exterior: "lime-plaster",
    trim: "teak",
    frontDoor: "teak",
    roof: { style: "hip", material: "mangalore", pitch: 30 },
    details: { chhajja: false, waterTank: false, carPorch: true, railing: "jaali" },
    fence: "compound-wall",
  },
  chettinad: {
    exterior: "egg-plaster",
    trim: "maroon",
    frontDoor: "teak",
    roof: FLAT,
    details: { chhajja: true, waterTank: false, carPorch: true, railing: "grille", arches: true },
    fence: "compound-wall",
  },
  rajasthani: {
    exterior: "jaisalmer",
    trim: "maroon",
    frontDoor: "indigo",
    roof: FLAT,
    details: { chhajja: true, waterTank: true, carPorch: true, railing: "jaali", arches: true },
    fence: "compound-wall",
  },
  goan: {
    exterior: "indigo",
    trim: "warm-white",
    frontDoor: "forest",
    roof: { style: "hip", material: "mangalore", pitch: 30 },
    details: { chhajja: false, waterTank: false, carPorch: true, railing: "grille", arches: true },
    fence: "compound-wall",
  },
  "mumbai-modern": {
    exterior: "grey-white",
    trim: "charcoal",
    frontDoor: "oak",
    roof: FLAT,
    details: { chhajja: true, waterTank: true, carPorch: false, railing: "glass" },
    fence: "compound-wall",
  },
  "bengaluru-contemporary": {
    exterior: "brick-concrete",
    trim: "charcoal",
    frontDoor: "teak",
    roof: FLAT,
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

// ---------------------------------------------------------------------------
// Room palettes: every automatic room already looks designed. A look picks a
// coordinated palette per room use (bedrooms vary by room). Kitchen cabinets
// and backsplash tiles default to the room's accent.
// ---------------------------------------------------------------------------
export type PaletteKind = Exclude<AutoLayoutKind, "shop">;
export type Swatches = Omit<RoomPalette, "cabinet" | "tile"> & Partial<Pick<RoomPalette, "cabinet" | "tile">>;

export const LOOK_PALETTES: Record<StylePreset, Record<PaletteKind, Swatches[]>> = {
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
  // Cool red-oxide floors, teak, brass (mustard) and cane-coloured fabrics.
  kerala: {
    living: [
      { paint: "warm-white", floor: "red-oxide", fabric: "oat", soft: "mustard", pop: "mustard", wood: "teak", accent: "mustard" },
      { paint: "linen", floor: "red-oxide", fabric: "sage", soft: "oat", pop: "terracotta", wood: "teak", accent: "terracotta" },
    ],
    bedroom: [
      { paint: "linen", floor: "red-oxide", fabric: "oat", soft: "sage", pop: "mustard", wood: "teak", accent: "mustard" },
      { paint: "sage", floor: "red-oxide", fabric: "oat", soft: "oat", pop: "terracotta", wood: "teak", accent: "terracotta" },
      { paint: "warm-white", floor: "red-oxide", fabric: "mustard", soft: "maroon", pop: "mustard", wood: "walnut", accent: "maroon" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "red-oxide", fabric: "oat", soft: "oat", pop: "mustard", wood: "teak", accent: "charcoal", cabinet: "sage", tile: "white" },
    ],
    dining: [
      { paint: "linen", floor: "red-oxide", fabric: "oat", soft: "mustard", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "kota", fabric: "oat", soft: "sage", pop: "sage", wood: "teak", accent: "white", tile: "sage" },
    ],
    prayer: [
      { paint: "warm-white", floor: "red-oxide", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "sage", floor: "red-oxide", fabric: "oat", soft: "oat", pop: "terracotta", wood: "teak", accent: "mustard" },
    ],
    utility: [
      { paint: "warm-white", floor: "red-oxide", fabric: "oat", soft: "oat", pop: "mustard", wood: "teak", accent: "white" },
    ],
  },
  // Patterned Athangudi floors, deep teak, maroon and peacock with brass.
  chettinad: {
    living: [
      { paint: "warm-white", floor: "athangudi", fabric: "maroon", soft: "mustard", pop: "peacock", wood: "walnut", accent: "mustard" },
      { paint: "linen", floor: "athangudi-green", fabric: "peacock", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    bedroom: [
      { paint: "ochre", floor: "athangudi-indigo", fabric: "oat", soft: "navy", pop: "mustard", wood: "walnut", accent: "navy" },
      { paint: "clay", floor: "red-oxide", fabric: "maroon", soft: "mustard", pop: "peacock", wood: "teak", accent: "mustard" },
      { paint: "eucalyptus", floor: "athangudi-green", fabric: "oat", soft: "maroon", pop: "mustard", wood: "walnut", accent: "maroon" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "red-oxide", fabric: "oat", soft: "maroon", pop: "mustard", wood: "walnut", accent: "charcoal", cabinet: "maroon", tile: "mustard" },
    ],
    dining: [
      { paint: "ochre", floor: "athangudi", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "walnut", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "kota", fabric: "oat", soft: "maroon", pop: "mustard", wood: "walnut", accent: "mustard", tile: "maroon" },
    ],
    prayer: [
      { paint: "ochre", floor: "athangudi", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "eucalyptus", floor: "athangudi-indigo", fabric: "oat", soft: "mustard", pop: "maroon", wood: "walnut", accent: "mustard" },
    ],
    utility: [
      { paint: "linen", floor: "red-oxide", fabric: "oat", soft: "oat", pop: "mustard", wood: "walnut", accent: "white" },
    ],
  },
  // Kota stone and marble, sandstone-warm walls, indigo and turmeric accents.
  rajasthani: {
    living: [
      { paint: "linen", floor: "kota", fabric: "navy", soft: "mustard", pop: "mustard", wood: "walnut", accent: "navy" },
      { paint: "ochre", floor: "kota", fabric: "oat", soft: "navy", pop: "maroon", wood: "teak", accent: "mustard" },
    ],
    bedroom: [
      { paint: "dusty-blue", floor: "kota", fabric: "oat", soft: "navy", pop: "mustard", wood: "walnut", accent: "mustard" },
      { paint: "clay", floor: "kota", fabric: "mustard", soft: "maroon", pop: "navy", wood: "teak", accent: "navy" },
      { paint: "linen", floor: "marble", fabric: "navy", soft: "mustard", pop: "maroon", wood: "walnut", accent: "mustard" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "kota", fabric: "oat", soft: "oat", pop: "mustard", wood: "walnut", accent: "charcoal", cabinet: "navy", tile: "mustard" },
    ],
    dining: [
      { paint: "terracotta", floor: "kota", fabric: "mustard", soft: "navy", pop: "maroon", wood: "walnut", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "kota", fabric: "oat", soft: "navy", pop: "mustard", wood: "walnut", accent: "white", tile: "navy" },
    ],
    prayer: [
      { paint: "ochre", floor: "marble", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "linen", floor: "kota", fabric: "oat", soft: "navy", pop: "mustard", wood: "walnut", accent: "navy" },
    ],
    utility: [
      { paint: "linen", floor: "kota", fabric: "oat", soft: "oat", pop: "mustard", wood: "walnut", accent: "white" },
    ],
  },
  // Red-oxide and blue azulejo tiles, white woodwork, bright cotton colours.
  goan: {
    living: [
      { paint: "warm-white", floor: "red-oxide", fabric: "navy", soft: "mustard", pop: "terracotta", wood: "walnut", accent: "navy" },
      { paint: "ochre", floor: "athangudi-indigo", fabric: "oat", soft: "navy", pop: "mustard", wood: "white", accent: "navy" },
    ],
    bedroom: [
      { paint: "dusty-blue", floor: "oak", fabric: "oat", soft: "navy", pop: "mustard", wood: "white", accent: "navy" },
      { paint: "blush", floor: "red-oxide", fabric: "oat", soft: "terracotta", pop: "mustard", wood: "walnut", accent: "terracotta" },
      { paint: "eucalyptus", floor: "oak", fabric: "mustard", soft: "oat", pop: "navy", wood: "white", accent: "mustard" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "azulejo", fabric: "oat", soft: "oat", pop: "mustard", wood: "walnut", accent: "charcoal", cabinet: "white", tile: "navy" },
    ],
    dining: [
      { paint: "ochre", floor: "red-oxide", fabric: "navy", soft: "mustard", pop: "terracotta", wood: "walnut", accent: "navy" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "azulejo", fabric: "oat", soft: "navy", pop: "navy", wood: "white", accent: "white", tile: "navy" },
    ],
    prayer: [
      { paint: "warm-white", floor: "red-oxide", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "walnut", accent: "mustard" },
    ],
    study: [
      { paint: "dusty-blue", floor: "oak", fabric: "oat", soft: "oat", pop: "mustard", wood: "white", accent: "navy" },
    ],
    utility: [
      { paint: "warm-white", floor: "azulejo", fabric: "oat", soft: "oat", pop: "navy", wood: "white", accent: "white" },
    ],
  },
  // Glossy vitrified floors, greige and white, charcoal with a single pop.
  "mumbai-modern": {
    living: [
      { paint: "greige", floor: "vitrified", fabric: "charcoal", soft: "oat", pop: "mustard", wood: "oak", accent: "mustard" },
      { paint: "warm-white", floor: "vitrified", fabric: "oat", soft: "charcoal", pop: "peacock", wood: "black", accent: "peacock" },
    ],
    bedroom: [
      { paint: "linen", floor: "oak", fabric: "oat", soft: "charcoal", pop: "mustard", wood: "oak", accent: "charcoal" },
      { paint: "dusty-blue", floor: "vitrified", fabric: "oat", soft: "navy", pop: "mustard", wood: "white", accent: "navy" },
      { paint: "greige", floor: "oak", fabric: "charcoal", soft: "oat", pop: "terracotta", wood: "black", accent: "terracotta" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "vitrified", fabric: "oat", soft: "oat", pop: "mustard", wood: "oak", accent: "charcoal", cabinet: "white", tile: "charcoal" },
    ],
    dining: [
      { paint: "greige", floor: "vitrified", fabric: "charcoal", soft: "oat", pop: "mustard", wood: "oak", accent: "mustard" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "vitrified", fabric: "oat", soft: "charcoal", pop: "sage", wood: "white", accent: "white", tile: "charcoal" },
    ],
    prayer: [
      { paint: "warm-white", floor: "marble", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "oak", accent: "mustard" },
    ],
    study: [
      { paint: "greige", floor: "oak", fabric: "oat", soft: "charcoal", pop: "navy", wood: "black", accent: "navy" },
    ],
    utility: [
      { paint: "warm-white", floor: "vitrified", fabric: "oat", soft: "oat", pop: "sage", wood: "white", accent: "white" },
    ],
  },
  // Polished concrete, oak and terrazzo, earthy terracotta and leaf greens.
  "bengaluru-contemporary": {
    living: [
      { paint: "warm-white", floor: "concrete", fabric: "oat", soft: "terracotta", pop: "sage", wood: "oak", accent: "terracotta" },
      { paint: "linen", floor: "concrete", fabric: "sage", soft: "oat", pop: "terracotta", wood: "teak", accent: "sage" },
    ],
    bedroom: [
      { paint: "sage", floor: "oak", fabric: "oat", soft: "sage", pop: "terracotta", wood: "oak", accent: "terracotta" },
      { paint: "terracotta", floor: "oak", fabric: "oat", soft: "oat", pop: "sage", wood: "teak", accent: "sage" },
      { paint: "eucalyptus", floor: "concrete", fabric: "oat", soft: "terracotta", pop: "mustard", wood: "oak", accent: "mustard" },
    ],
    kitchen: [
      { paint: "warm-white", floor: "terrazzo", fabric: "oat", soft: "oat", pop: "sage", wood: "oak", accent: "charcoal", cabinet: "sage", tile: "terracotta" },
    ],
    dining: [
      { paint: "linen", floor: "concrete", fabric: "sage", soft: "terracotta", pop: "mustard", wood: "teak", accent: "terracotta" },
    ],
    bathroom: [
      { paint: "warm-white", floor: "terrazzo", fabric: "oat", soft: "sage", pop: "sage", wood: "oak", accent: "white", tile: "sage" },
    ],
    prayer: [
      { paint: "warm-white", floor: "terrazzo", fabric: "maroon", soft: "maroon", pop: "mustard", wood: "teak", accent: "mustard" },
    ],
    study: [
      { paint: "sage", floor: "oak", fabric: "oat", soft: "oat", pop: "terracotta", wood: "oak", accent: "terracotta" },
    ],
    utility: [
      { paint: "warm-white", floor: "concrete", fabric: "oat", soft: "oat", pop: "sage", wood: "oak", accent: "white" },
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

// ---------------------------------------------------------------------------
// Gardens: what the automatic garden plants for a look. `tree` replaces the
// big shade trees (null keeps the mixed oak, pine and blossom); `tulsi` puts a
// tulsi planter by the path; `lush` adds planters and shrubs along the front.
// ---------------------------------------------------------------------------
export type LookGarden = {
  tree: "tree-neem" | "tree-palm" | "tree-blossom" | null;
  tulsi: boolean;
  lush: boolean;
};
const NO_GARDEN: LookGarden = { tree: null, tulsi: false, lush: false };
export const LOOK_GARDENS: Record<StylePreset, LookGarden> = {
  "indian-modern": { tree: "tree-neem", tulsi: true, lush: false },
  "indian-classic": { tree: "tree-neem", tulsi: true, lush: false },
  kerala: { tree: "tree-palm", tulsi: true, lush: true },
  chettinad: { tree: "tree-neem", tulsi: true, lush: false },
  rajasthani: { tree: "tree-neem", tulsi: true, lush: false },
  goan: { tree: "tree-palm", tulsi: false, lush: true },
  "mumbai-modern": { tree: "tree-blossom", tulsi: false, lush: false },
  "bengaluru-contemporary": { tree: null, tulsi: false, lush: true },
  diorama: NO_GARDEN,
};
/** The garden a home's look plants (homes without a look keep the original). */
export const lookGarden = (preset: StylePreset | null | undefined): LookGarden =>
  (preset && LOOK_GARDENS[preset]) || NO_GARDEN;
