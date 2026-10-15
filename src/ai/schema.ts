// JSON schemas for Claude's structured output, built from our own catalogs so
// the model can only name things the app can draw. Plus a sanitiser that
// clamps any plan (from Claude or a saved fixture) into what the engine expects.
import furnitureJson from "../domain/catalog/furniture.json" with { type: "json" };
import landscapeJson from "../domain/catalog/landscape.json" with { type: "json" };
import {
  DOOR_COLORS,
  EXTERIOR_FINISHES,
  FLOOR_MATERIALS,
  GROUND_STYLES,
  ROOF_MATERIALS,
  TRIM_COLORS,
  WALL_PAINTS,
} from "../domain/materials";
import {
  LAYOUTS,
  ROOM_USES,
  ZONES,
  type HomePlan,
  type PlannedRoom,
  type RoomPlan,
  type RoomUse,
} from "./brief";

const keys = (o: object) => Object.keys(o);
/** Pieces the designer may add: no shop fittings, no half-built kitchen modules. */
const NOT_EXTRAS = new Set([
  "display-shelf",
  "display-shelf-module",
  "shop-counter",
  "kitchen-base",
  "kitchen-upper",
  "kitchen-counter",
  "kitchen-sink",
  "kitchen-stove",
  "toilet",
  "shower",
  "bathtub",
  "vanity",
]);
export const EXTRA_IDS = furnitureJson.items.map((i) => i.id).filter((id) => !NOT_EXTRAS.has(id));
/** Garden pieces the designer may add; the parking pad follows the parking switch. */
export const GARDEN_IDS = landscapeJson.items
  .map((i) => i.id)
  .filter((id) => !["parking", "path", "hedge"].includes(id));
const finishes = furnitureJson.finishes as Record<"fabric" | "wood" | "accent", Record<string, string>>;
export const ENUMS = {
  paint: keys(WALL_PAINTS),
  floor: keys(FLOOR_MATERIALS),
  fabric: keys(finishes.fabric),
  wood: keys(finishes.wood),
  accent: keys(finishes.accent),
  exterior: keys(EXTERIOR_FINISHES),
  trim: keys(TRIM_COLORS),
  door: keys(DOOR_COLORS),
  roof: ["flat", "gable", "hip", "shed"],
  roofMaterial: keys(ROOF_MATERIALS),
  ground: keys(GROUND_STYLES),
};

const str = { type: "string" } as const;
const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const list = (items: object) => ({ type: "array", items });
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const palette = {
  paint: oneOf(ENUMS.paint),
  floor: oneOf(ENUMS.floor),
  fabric: oneOf(ENUMS.fabric),
  wood: oneOf(ENUMS.wood),
  accent: oneOf(ENUMS.accent),
};

export const HOME_PLAN_SCHEMA = object({
  name: str,
  floors: { type: "integer", enum: [1, 2, 3] },
  layout: oneOf(LAYOUTS),
  rooms: list(
    object({
      use: oneOf(ROOM_USES),
      name: str,
      zone: oneOf(ZONES),
      ...palette,
      extras: list(oneOf(EXTRA_IDS)),
    }),
  ),
  exterior: object({
    finish: oneOf(ENUMS.exterior),
    trim: oneOf(ENUMS.trim),
    door: oneOf(ENUMS.door),
    roof: oneOf(ENUMS.roof),
    roofMaterial: oneOf(ENUMS.roofMaterial),
  }),
  ground: oneOf(ENUMS.ground),
  garden: list(oneOf(GARDEN_IDS)),
  notes: list(str),
});

export const ROOM_PLAN_SCHEMA = object({
  ...palette,
  layout: oneOf(["fresh", "keep"]),
  extras: list(oneOf(EXTRA_IDS)),
  notes: list(str),
});

// ---------------------------------------------------------------------------
// Sanitising: structured outputs guarantee the shape; this guarantees sense.
// ---------------------------------------------------------------------------
const pick = (value: unknown, allowed: readonly string[], fallback: string) =>
  typeof value === "string" && allowed.includes(value) ? value : fallback;
const text = (value: unknown, max: number, fallback: string) => {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : fallback;
};
const NAMES: Record<RoomUse, string> = {
  "master-bedroom": "Main bedroom",
  bedroom: "Bedroom",
  "kids-bedroom": "Kids’ room",
  "grandparents-bedroom": "Grandparents’ room",
  "guest-bedroom": "Guest room",
  living: "Living room",
  kitchen: "Kitchen",
  dining: "Dining",
  pooja: "Pooja room",
  office: "Home office",
  bathroom: "Bathroom",
  utility: "Utility",
};
export const defaultRoomName = (use: RoomUse) => NAMES[use];
const notes = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .map((n) => text(n, 140, ""))
    .filter(Boolean)
    .slice(0, 5);
const extras = (raw: unknown) =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((x) => EXTRA_IDS.includes(x)))].slice(0, 4) as string[];

function sanitizeRoom(raw: Partial<PlannedRoom>): PlannedRoom | null {
  if (!raw || !ROOM_USES.includes(raw.use as RoomUse)) return null;
  const use = raw.use as RoomUse;
  return {
    use,
    name: text(raw.name, 24, NAMES[use]),
    zone: pick(raw.zone, ZONES, "any") as PlannedRoom["zone"],
    paint: pick(raw.paint, ENUMS.paint, "warm-white"),
    floor: pick(raw.floor, ENUMS.floor, "light-tile"),
    fabric: pick(raw.fabric, ENUMS.fabric, "oat"),
    wood: pick(raw.wood, ENUMS.wood, "oak"),
    accent: pick(raw.accent, ENUMS.accent, "sage"),
    extras: extras(raw.extras),
  };
}

const isBedroomUse = (use: RoomUse) => use.endsWith("bedroom");
/** Clamps a plan to what the engine builds well; never throws. */
export function sanitizeHomePlan(raw: unknown): HomePlan {
  const p = (raw ?? {}) as Partial<HomePlan>;
  const ex = (p.exterior ?? {}) as Partial<HomePlan["exterior"]>;
  let rooms = (Array.isArray(p.rooms) ? p.rooms : [])
    .map((r) => sanitizeRoom(r as Partial<PlannedRoom>))
    .filter((r): r is PlannedRoom => !!r);
  // At most 6 bedrooms (one main), 5 bathrooms, and one of everything else.
  const counts = new Map<string, number>();
  const bump = (key: string) => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n;
  };
  rooms = rooms.filter((r) => {
    if (isBedroomUse(r.use)) return bump("bedrooms") <= 6 && (r.use !== "master-bedroom" || bump(r.use) <= 1);
    return bump(r.use) <= (r.use === "bathroom" ? 5 : 1);
  });
  // Unique names, so later steps can find each room.
  const seen = new Set<string>();
  for (const r of rooms) {
    let name = r.name,
      i = 2;
    while (seen.has(name.toLowerCase())) name = `${r.name.slice(0, 20)} ${i++}`;
    seen.add(name.toLowerCase());
    r.name = name;
  }
  return {
    name: text(p.name, 40, "Our Dream Home"),
    floors: [1, 2, 3].includes(p.floors as number) ? (p.floors as number) : 1,
    layout: pick(p.layout, LAYOUTS, "family") as HomePlan["layout"],
    rooms,
    exterior: {
      finish: pick(ex.finish, ENUMS.exterior, "white-stucco"),
      trim: pick(ex.trim, ENUMS.trim, "warm-white"),
      door: pick(ex.door, ENUMS.door, "oak"),
      roof: pick(ex.roof, ENUMS.roof, "flat"),
      roofMaterial: pick(ex.roofMaterial, ENUMS.roofMaterial, "membrane"),
    },
    ground: pick(p.ground, ENUMS.ground, "lawn"),
    garden: [...new Set((Array.isArray(p.garden) ? p.garden : []).filter((g) => GARDEN_IDS.includes(g)))].slice(0, 6),
    notes: notes(p.notes),
  };
}

export function sanitizeRoomPlan(raw: unknown): RoomPlan {
  const p = (raw ?? {}) as Partial<RoomPlan>;
  return {
    paint: pick(p.paint, ENUMS.paint, "warm-white"),
    floor: pick(p.floor, ENUMS.floor, "oak"),
    fabric: pick(p.fabric, ENUMS.fabric, "oat"),
    wood: pick(p.wood, ENUMS.wood, "oak"),
    accent: pick(p.accent, ENUMS.accent, "sage"),
    layout: p.layout === "keep" ? "keep" : "fresh",
    extras: extras(p.extras),
    notes: notes(p.notes).slice(0, 3),
  };
}
