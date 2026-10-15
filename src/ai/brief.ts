// The AI Designer's inputs and outputs, shared by the browser and the server.
// Pure data and validation only: no React, no DOM, no network.
import type { EdgeSide } from "../domain/types";

export const FAMILIES = ["single", "couple", "young-family", "big-family", "joint-family"] as const;
export type Family = (typeof FAMILIES)[number];
export const MUSTS = [
  "ensuite",
  "pooja",
  "parking",
  "balcony",
  "office",
  "garden",
  "vastu",
  "guest",
] as const;
export type Must = (typeof MUSTS)[number];
export const VIBES = ["indian-modern", "indian-classic", "minimal", "colourful"] as const;
export type Vibe = (typeof VIBES)[number];
const SIDES: EdgeSide[] = ["north", "east", "south", "west"];

/** What the homeowner tells us in four taps (plus an optional note). */
export type HomeBrief = {
  /** Plot size in feet. */
  plot: { w: number; d: number };
  /** The side the plot faces (where the road and entrance are). */
  facing: EdgeSide;
  family: Family;
  bedrooms: number;
  floors: number | "auto";
  musts: Must[];
  vibe: Vibe;
  /** A free-text wish, at most 200 characters. Treated as data, never instructions. */
  note?: string;
};

/** "Make it nice" for one room. */
export type RoomBrief = {
  kind: "living" | "kitchen" | "bedroom" | "bathroom" | "dining" | "utility" | "shop";
  name: string;
  /** Room size in centimetres. */
  w: number;
  d: number;
  /** Catalog ids of the pieces in the room now. */
  items: string[];
  vibe: Vibe;
  note?: string;
};

export const NOTE_MAX = 200;
const clean = (s: unknown, max: number) =>
  typeof s === "string"
    ? s
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const int = (n: unknown, lo: number, hi: number) =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** Bedrooms a household usually wants. */
export const FAMILY_BEDROOMS: Record<Family, number> = {
  single: 1,
  couple: 2,
  "young-family": 3,
  "big-family": 4,
  "joint-family": 4,
};

/** Checks a brief from an untrusted client; returns a clean copy or an error. */
export function parseHomeBrief(raw: unknown): { ok: true; brief: HomeBrief } | { ok: false; error: string } {
  const b = raw as Partial<HomeBrief> | null;
  if (!b || typeof b !== "object") return { ok: false, error: "Missing brief." };
  if (!b.plot || !int(b.plot.w, 15, 200) || !int(b.plot.d, 15, 200))
    return { ok: false, error: "Plot sides must be 15–200 ft." };
  if (!SIDES.includes(b.facing as EdgeSide)) return { ok: false, error: "Choose which way the plot faces." };
  if (!FAMILIES.includes(b.family as Family)) return { ok: false, error: "Choose who lives here." };
  if (!int(b.bedrooms, 1, 6)) return { ok: false, error: "Choose 1–6 bedrooms." };
  if (b.floors !== "auto" && !int(b.floors, 1, 3)) return { ok: false, error: "Choose 1–3 floors." };
  if (!Array.isArray(b.musts) || b.musts.length > MUSTS.length || !b.musts.every((m) => MUSTS.includes(m)))
    return { ok: false, error: "Unknown must-have." };
  if (!VIBES.includes(b.vibe as Vibe)) return { ok: false, error: "Choose a look." };
  const note = clean(b.note, NOTE_MAX);
  return {
    ok: true,
    brief: {
      plot: { w: b.plot.w, d: b.plot.d },
      facing: b.facing as EdgeSide,
      family: b.family as Family,
      bedrooms: b.bedrooms as number,
      floors: b.floors as number | "auto",
      musts: [...new Set(b.musts)] as Must[],
      vibe: b.vibe as Vibe,
      ...(note ? { note } : {}),
    },
  };
}

const ROOM_KINDS = ["living", "kitchen", "bedroom", "bathroom", "dining", "utility", "shop"] as const;
export function parseRoomBrief(raw: unknown): { ok: true; brief: RoomBrief } | { ok: false; error: string } {
  const b = raw as Partial<RoomBrief> | null;
  if (!b || typeof b !== "object") return { ok: false, error: "Missing room." };
  if (!ROOM_KINDS.includes(b.kind as RoomBrief["kind"])) return { ok: false, error: "Unknown room kind." };
  if (!int(b.w, 60, 5000) || !int(b.d, 60, 5000)) return { ok: false, error: "Room size is out of range." };
  if (!Array.isArray(b.items) || b.items.length > 40 || !b.items.every((i) => typeof i === "string" && i.length <= 40))
    return { ok: false, error: "Too many pieces in this room." };
  if (!VIBES.includes(b.vibe as Vibe)) return { ok: false, error: "Choose a look." };
  const note = clean(b.note, NOTE_MAX);
  return {
    ok: true,
    brief: {
      kind: b.kind as RoomBrief["kind"],
      name: clean(b.name, 40) || "Room",
      w: b.w as number,
      d: b.d as number,
      items: b.items as string[],
      vibe: b.vibe as Vibe,
      ...(note ? { note } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// What the designer (Claude or the built-in planner) returns.
// ---------------------------------------------------------------------------
export const ROOM_USES = [
  "master-bedroom",
  "bedroom",
  "kids-bedroom",
  "grandparents-bedroom",
  "guest-bedroom",
  "living",
  "kitchen",
  "dining",
  "pooja",
  "office",
  "bathroom",
  "utility",
] as const;
export type RoomUse = (typeof ROOM_USES)[number];
export const ZONES = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
  "centre",
  "any",
] as const;
export type Zone = (typeof ZONES)[number];
export const LAYOUTS = ["family", "open", "courtyard"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Colours for a room's soft furnishings, wood and accents (catalog finish ids). */
export type Palette = { fabric: string; wood: string; accent: string };
export type PlannedRoom = Palette & {
  use: RoomUse;
  name: string;
  zone: Zone;
  paint: string;
  floor: string;
  /** Extra catalog pieces on top of the room's standard layout. */
  extras: string[];
};
export type HomePlan = {
  name: string;
  floors: number;
  layout: Layout;
  rooms: PlannedRoom[];
  exterior: { finish: string; trim: string; door: string; roof: string; roofMaterial: string };
  ground: string;
  garden: string[];
  notes: string[];
};
export type RoomPlan = Palette & {
  paint: string;
  floor: string;
  /** "fresh" starts from the standard layout; "keep" restyles what's there. */
  layout: "fresh" | "keep";
  extras: string[];
  notes: string[];
};

/** How the server answers. `plan` is null when the client should use the built-in planner. */
export type DesignResponse<P> =
  | { ok: true; plan: P; source: "ai"; left: number }
  | { ok: false; reason: "limit" | "busy" | "offline" | "invalid"; message: string; left?: number };

export const FREE_HOME_DESIGNS = 3;
export const FREE_ROOM_MAKEOVERS = 10;
