// The built-in planner: a careful, rule-based designer used when the AI is
// unavailable (offline, out of free designs, or not set up). It follows the
// same brief and returns the same plan shape, so the engine treats both alike.
import { LOOK_BUNDLES, LOOK_GARDENS, LOOK_PALETTES } from "../domain/looks";
import { ACCENT_FOR_PAINT, isWallPaint } from "../domain/materials";
import type { StylePreset } from "../domain/types";
import { REGIONAL_VIBES, type HomeBrief, type HomePlan, type PlannedRoom, type RegionalVibe, type RoomBrief, type RoomPlan, type RoomUse, type Vibe, type Zone } from "./brief";
import { defaultRoomName } from "./schema";

type Look = {
  name: string;
  exterior: HomePlan["exterior"];
  ground: string;
  paints: { living: string; bedroom: string[]; kitchen: string; other: string };
  floors: { living: string; bedroom: string; wet: string };
  palette: { fabric: string[]; wood: string; accent: string[] };
  garden: string[];
};
/** The home Look each vibe builds: the everyday vibes share the Indian modern outside. */
export const VIBE_LOOK: Record<Vibe, StylePreset> = {
  "indian-modern": "indian-modern",
  "indian-classic": "indian-classic",
  minimal: "indian-modern",
  colourful: "indian-modern",
  kerala: "kerala",
  chettinad: "chettinad",
  rajasthani: "rajasthani",
  goan: "goan",
  "mumbai-modern": "mumbai-modern",
  "bengaluru-contemporary": "bengaluru-contemporary",
};

const REGIONAL_NAMES: Record<RegionalVibe, [string, string]> = {
  kerala: ["Kerala tharavad home", "Kerala garden house"],
  chettinad: ["Chettinad mansion", "Chettinad courtyard home"],
  rajasthani: ["Rajasthani haveli", "Desert sandstone home"],
  goan: ["Goan villa", "Goan cottage"],
  "mumbai-modern": ["Mumbai modern home", "City-smart home"],
  "bengaluru-contemporary": ["Bengaluru garden home", "Brick and green home"],
};
const unique = <T,>(list: T[]) => [...new Set(list)];
const rotate = <T,>(list: T[], by: number) => list.map((_, i) => list[(i + by) % list.length]);
/**
 * A regional vibe's planner looks come straight from the home Look (its
 * outside, room palettes and garden), so the offline designer and the Look
 * card always agree. The second take starts from the second palettes.
 */
function regionalLooks(vibe: RegionalVibe): Look[] {
  const bundle = LOOK_BUNDLES[vibe],
    palettes = LOOK_PALETTES[vibe],
    garden = LOOK_GARDENS[vibe];
  return REGIONAL_NAMES[vibe].map((name, take) => {
    const living = palettes.living[take % palettes.living.length];
    const bedrooms = rotate(palettes.bedroom, take);
    return {
      name,
      exterior: { finish: bundle.exterior, trim: bundle.trim, door: bundle.frontDoor, roof: bundle.roof.style, roofMaterial: bundle.roof.material },
      ground: "lawn",
      paints: { living: living.paint, bedroom: bedrooms.map((p) => p.paint), kitchen: palettes.kitchen[0].paint, other: palettes.utility[0].paint },
      floors: { living: living.floor, bedroom: bedrooms[0].floor, wet: palettes.bathroom[0].floor },
      palette: {
        fabric: unique(bedrooms.map((p) => p.fabric)),
        wood: living.wood,
        accent: unique([living.accent, ...bedrooms.map((p) => p.accent)]),
      },
      garden: [garden.tree ?? "tree-blossom", garden.tulsi ? "tulsi-planter" : "planter", "flowerbed"],
    };
  });
}

/** Two looks per vibe, so "Try another" gives a different take. */
const LOOKS: Record<Vibe, Look[]> = {
  ...(Object.fromEntries(REGIONAL_VIBES.map((v) => [v, regionalLooks(v)])) as Record<RegionalVibe, Look[]>),
  "indian-modern": [
    {
      name: "Sunlit modern home",
      exterior: { finish: "two-tone", trim: "warm-white", door: "teak", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "warm-white", bedroom: ["sage", "dusty-blue", "blush", "linen"], kitchen: "linen", other: "warm-white" },
      floors: { living: "marble", bedroom: "oak", wet: "light-tile" },
      palette: { fabric: ["oat", "sage", "navy", "terracotta"], wood: "walnut", accent: ["mustard", "sage", "terracotta"] },
      garden: ["tulsi-planter", "tree-palm", "bench"],
    },
    {
      name: "Terracotta courtyard house",
      exterior: { finish: "peach", trim: "warm-white", door: "teak", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "linen", bedroom: ["terracotta", "ochre", "eucalyptus", "clay"], kitchen: "warm-white", other: "linen" },
      floors: { living: "terrazzo", bedroom: "herringbone", wet: "terrazzo" },
      palette: { fabric: ["terracotta", "mustard", "oat", "sage"], wood: "oak", accent: ["terracotta", "mustard", "white"] },
      garden: ["tulsi-planter", "tree-neem", "flowerbed"],
    },
  ],
  "indian-classic": [
    {
      name: "Haveli-style family home",
      exterior: { finish: "ochre", trim: "maroon", door: "peacock", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "ochre", bedroom: ["terracotta", "clay", "blush", "linen"], kitchen: "linen", other: "warm-white" },
      floors: { living: "marble", bedroom: "walnut", wet: "limestone" },
      palette: { fabric: ["mustard", "terracotta", "navy", "blush"], wood: "walnut", accent: ["mustard", "terracotta", "navy"] },
      garden: ["tulsi-planter", "tree-neem", "flowerbed"],
    },
    {
      name: "Saffron heritage home",
      exterior: { finish: "saffron", trim: "warm-white", door: "teak", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "clay", bedroom: ["ochre", "terracotta", "linen", "sage"], kitchen: "warm-white", other: "linen" },
      floors: { living: "limestone", bedroom: "walnut", wet: "limestone" },
      palette: { fabric: ["terracotta", "mustard", "oat", "navy"], wood: "walnut", accent: ["terracotta", "mustard", "sage"] },
      garden: ["tulsi-planter", "tree-oak", "bench"],
    },
  ],
  minimal: [
    {
      name: "Calm minimal home",
      exterior: { finish: "white-stucco", trim: "charcoal", door: "charcoal", roof: "flat", roofMaterial: "membrane" },
      ground: "gravel",
      paints: { living: "warm-white", bedroom: ["greige", "linen", "warm-white", "greige"], kitchen: "warm-white", other: "warm-white" },
      floors: { living: "concrete", bedroom: "oak", wet: "light-tile" },
      palette: { fabric: ["oat", "charcoal", "oat", "sage"], wood: "oak", accent: ["white", "charcoal", "sage"] },
      garden: ["tree-pine", "rock", "planter"],
    },
    {
      name: "Soft grey modern home",
      exterior: { finish: "grey-render", trim: "warm-white", door: "oak", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "greige", bedroom: ["linen", "dusty-blue", "greige", "sage"], kitchen: "warm-white", other: "warm-white" },
      floors: { living: "light-tile", bedroom: "oak", wet: "light-tile" },
      palette: { fabric: ["charcoal", "oat", "sage", "navy"], wood: "white", accent: ["charcoal", "white", "sage"] },
      garden: ["tree-blossom", "planter", "bench"],
    },
  ],
  colourful: [
    {
      name: "Joyful colour-pop home",
      exterior: { finish: "sky", trim: "warm-white", door: "terracotta", roof: "flat", roofMaterial: "membrane" },
      ground: "lawn",
      paints: { living: "ochre", bedroom: ["dusty-blue", "blush", "eucalyptus", "terracotta"], kitchen: "sage", other: "linen" },
      floors: { living: "terrazzo", bedroom: "oak", wet: "terrazzo" },
      palette: { fabric: ["mustard", "terracotta", "navy", "blush"], wood: "oak", accent: ["mustard", "terracotta", "navy"] },
      garden: ["tree-blossom", "flowerbed", "parasol"],
    },
    {
      name: "Garden-green happy home",
      exterior: { finish: "mint", trim: "teal", door: "peacock", roof: "flat", roofMaterial: "membrane" },
      ground: "meadow",
      paints: { living: "eucalyptus", bedroom: ["blush", "ochre", "dusty-blue", "sage"], kitchen: "linen", other: "warm-white" },
      floors: { living: "herringbone", bedroom: "oak", wet: "terrazzo" },
      palette: { fabric: ["sage", "mustard", "blush", "navy"], wood: "oak", accent: ["sage", "mustard", "terracotta"] },
      garden: ["tree-palm", "flowerbed", "sun-lounger"],
    },
  ],
};

/** Vastu-friendly spots for each use (the most common guidance). */
const VASTU: Partial<Record<RoomUse, Zone>> = {
  "master-bedroom": "southwest",
  kitchen: "southeast",
  pooja: "northeast",
  living: "north",
  "kids-bedroom": "west",
  "guest-bedroom": "northwest",
  "grandparents-bedroom": "south",
  office: "west",
  bathroom: "northwest",
};

/** The rooms a household needs, main bedroom first. */
function program(brief: HomeBrief): RoomUse[] {
  const beds: RoomUse[] = ["master-bedroom"];
  const others: RoomUse[] =
    brief.family === "joint-family"
      ? ["grandparents-bedroom", "kids-bedroom", "bedroom", "bedroom"]
      : brief.family === "young-family" || brief.family === "big-family"
        ? ["kids-bedroom", "kids-bedroom", "bedroom", "bedroom"]
        : ["bedroom", "bedroom", "bedroom", "bedroom"];
  while (others.length < 6) others.push("bedroom");
  const guest = brief.musts.includes("guest");
  for (let i = 1; i < brief.bedrooms; i++) beds.push(guest && i === brief.bedrooms - 1 ? "guest-bedroom" : others[i - 1]);
  const uses: RoomUse[] = ["living", "kitchen", ...beds, "bathroom"];
  if (brief.bedrooms >= 3) uses.push("bathroom");
  if (brief.musts.includes("pooja")) uses.push("pooja");
  if (brief.musts.includes("office")) uses.push("office");
  if (brief.bedrooms >= 4) uses.push("dining");
  return uses;
}

const BEDROOM_NAMES: Partial<Record<RoomUse, string[]>> = {
  "kids-bedroom": ["Kids’ room", "Kids’ room 2"],
  bedroom: ["Bedroom 2", "Bedroom 3", "Bedroom 4", "Bedroom 5"],
};

/**
 * Pieces added on top of the designer layout (which already brings rugs,
 * lamps, art, curtains and fans): a little character per room use.
 */
const EXTRAS: Partial<Record<RoomUse, string[]>> = {
  living: ["ottoman", "wall-light", "diya"],
  "master-bedroom": ["dresser", "ottoman", "wall-light"],
  "kids-bedroom": ["rug-round", "desk", "bookshelf"],
  "grandparents-bedroom": ["armchair", "wall-light"],
  "guest-bedroom": ["console-table", "plant-small"],
  bedroom: ["plant-small", "wall-light"],
  kitchen: ["plant-small", "pendant-light"],
  dining: ["wall-light", "plant-floor"],
  pooja: ["plant-small", "wall-light"],
  office: ["plant-floor", "wall-art"],
  bathroom: ["plant-small", "wall-light"],
  utility: ["shoe-rack"],
};
/** Rooms whose main wall (behind the bed) gets a deeper feature colour. */
const FEATURE_WALL: ReadonlySet<RoomUse> = new Set(["master-bedroom", "kids-bedroom", "guest-bedroom"]);
const featureWall = (use: RoomUse, paint: string) =>
  FEATURE_WALL.has(use) && isWallPaint(paint) ? { accentWall: ACCENT_FOR_PAINT[paint] } : {};

/** A complete plan from the brief alone. `variant` picks between looks. */
export function plannerHomePlan(brief: HomeBrief, variant = 0): HomePlan {
  const looks = LOOKS[brief.vibe];
  const look = looks[variant % looks.length];
  const vastu = brief.musts.includes("vastu");
  const used = new Map<RoomUse, number>();
  const rooms: PlannedRoom[] = program(brief).map((use) => {
    const n = used.get(use) ?? 0;
    used.set(use, n + 1);
    const bedroomIndex = [...used.entries()].filter(([u]) => u.endsWith("bedroom")).reduce((s, [, c]) => s + c, 0) - 1;
    const name =
      BEDROOM_NAMES[use]?.[n] ?? (use === "bathroom" && n > 0 ? `Bathroom ${n + 1}` : defaultRoomName(use));
    const wet = use === "bathroom" || use === "kitchen";
    const bedroom = use.endsWith("bedroom");
    const paint = bedroom
      ? look.paints.bedroom[bedroomIndex % look.paints.bedroom.length]
      : use === "living" || use === "dining"
        ? look.paints.living
        : use === "kitchen"
          ? look.paints.kitchen
          : look.paints.other;
    return {
      use,
      name,
      zone: vastu ? (VASTU[use] ?? "any") : "any",
      paint,
      floor: wet ? look.floors.wet : bedroom ? look.floors.bedroom : look.floors.living,
      fabric: look.palette.fabric[Math.max(0, bedroomIndex) % look.palette.fabric.length],
      wood: look.palette.wood,
      accent: look.palette.accent[n % look.palette.accent.length],
      extras: EXTRAS[use] ?? [],
      ...featureWall(use, paint),
    };
  });
  const notes = [
    vastu
      ? "Kitchen toward the south-east, pooja room toward the north-east and the main bedroom in the south-west, following Vastu."
      : "Living spaces face the road; bedrooms sit at the quiet back.",
    brief.musts.includes("ensuite") ? "The main bedroom has its own attached bathroom." : "",
    `${look.name}: colours chosen to feel warm in Indian daylight.`,
    "Tap any room to change it — everything stays editable.",
  ].filter(Boolean);
  return {
    name: brief.family === "joint-family" ? "Our Family Home" : look.name.replace(/^./, (c) => c.toUpperCase()),
    floors: brief.floors === "auto" ? (brief.bedrooms >= 4 || brief.plot.w * brief.plot.d < 1000 ? 2 : 1) : brief.floors,
    layout: brief.plot.w >= 40 && brief.plot.d >= 60 && brief.bedrooms <= 3 && variant % 2 === 1 ? "courtyard" : "family",
    rooms,
    exterior: look.exterior,
    ground: look.ground,
    garden: brief.musts.includes("garden") ? look.garden : look.garden.slice(0, 1),
    notes,
  };
}

/** A room makeover from the brief alone. */
export function plannerRoomPlan(brief: RoomBrief, variant = 0): RoomPlan {
  const look = LOOKS[brief.vibe][variant % 2];
  const use: RoomUse =
    brief.kind === "bedroom" ? "bedroom" : brief.kind === "shop" ? "living" : (brief.kind as RoomUse);
  const wet = brief.kind === "bathroom" || brief.kind === "kitchen";
  const paint =
    brief.kind === "bedroom"
      ? look.paints.bedroom[variant % look.paints.bedroom.length]
      : brief.kind === "kitchen"
        ? look.paints.kitchen
        : look.paints.living;
  return {
    paint,
    floor: wet ? look.floors.wet : brief.kind === "bedroom" ? look.floors.bedroom : look.floors.living,
    fabric: look.palette.fabric[variant % look.palette.fabric.length],
    wood: look.palette.wood,
    accent: look.palette.accent[variant % look.palette.accent.length],
    layout: brief.items.length < 2 ? "fresh" : "keep",
    extras: EXTRAS[use] ?? [],
    ...featureWall(brief.kind === "bedroom" ? "master-bedroom" : use, paint),
    notes: [`${look.name.replace(/ (home|house)$/i, "")} colours for ${brief.name}.`],
  };
}
