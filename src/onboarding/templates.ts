// Starting homes for the gallery, built from the existing blueprint generator.
import { projectAdvisories } from "../domain/advice";
import { createBlueprint, type BlueprintRequest } from "../domain/blueprints";
import { homeChecks } from "../domain/advice";
import { moveRoomStrict, swapRoomUses } from "../domain/model";
import { addRoomWindow } from "../domain/openingCommands";
import { addAttachedBathroom } from "../domain/ensuite";
import { withStylePreset } from "../domain/materials";
import type { EditResult, Project, RoomKind } from "../domain/types";

export const FEET = 30.48;
export const PLOT_SIZES: { label: string; w: number; d: number }[] = [
  { label: "20 × 40 ft", w: 20, d: 40 },
  { label: "30 × 40 ft", w: 30, d: 40 },
  { label: "30 × 50 ft", w: 30, d: 50 },
  { label: "40 × 60 ft", w: 40, d: 60 },
  { label: "50 × 80 ft", w: 50, d: 80 },
  { label: "60 × 90 ft", w: 60, d: 90 },
];
export type Template = {
  id: string;
  name: string;
  tagline: string;
  plot: { w: number; d: number }; // feet
  request: Omit<BlueprintRequest, "widthCm" | "depthCm" | "marginCm" | "road">;
  /** Which knobs make sense to tweak for this template. */
  tweak: { bedrooms?: [number, number]; floors?: [number, number] };
  /** The biggest bedroom gets its own attached bathroom when there's room. */
  ensuite?: boolean;
};
const base = {
  unitsPerFloor: 2,
  bedroomsPerUnit: 2,
  shopsPerFloor: 2,
  bedrooms: 2,
  floors: 1,
};
export const TEMPLATES: Template[] = [
  {
    id: "bungalow",
    name: "Cosy bungalow",
    tagline: "Everything on one easy floor",
    plot: { w: 30, d: 50 },
    request: { ...base, kind: "home", flavor: "bungalow", bedrooms: 2 },
    tweak: { bedrooms: [1, 4], floors: [1, 1] },
  },
  {
    id: "villa",
    name: "Garden villa",
    tagline: "Spacious rooms and a big garden",
    plot: { w: 40, d: 60 },
    request: { ...base, kind: "home", flavor: "villa", bedrooms: 3 },
    tweak: { bedrooms: [2, 5], floors: [1, 2] },
    ensuite: true,
  },
  {
    id: "duplex",
    name: "Two-storey duplex",
    tagline: "Living below, bedrooms upstairs",
    plot: { w: 30, d: 50 },
    request: { ...base, kind: "home", flavor: "duplex", bedrooms: 3, floors: 2 },
    tweak: { bedrooms: [2, 6], floors: [2, 3] },
    ensuite: true,
  },
  {
    id: "courtyard",
    name: "Courtyard home",
    tagline: "Rooms around a sunny open courtyard",
    plot: { w: 40, d: 60 },
    request: { ...base, kind: "home", bedrooms: 3, courtyard: true },
    tweak: { bedrooms: [2, 5], floors: [1, 2] },
  },
  {
    id: "apartments",
    name: "Apartment block",
    tagline: "Flats around shared stairs",
    // Two one-bedroom flats per floor: every flat gets daylight on two sides.
    plot: { w: 40, d: 60 },
    request: { ...base, kind: "apartments", floors: 3, bedroomsPerUnit: 1 },
    tweak: { floors: [2, 8] },
  },
  {
    id: "shop-home",
    name: "Shop + home",
    tagline: "Shops below, a home above",
    plot: { w: 30, d: 50 },
    request: {
      ...base,
      kind: "mixed",
      floors: 2,
      shopsPerFloor: 2,
      unitsPerFloor: 1,
      bedroomsPerUnit: 2,
    },
    tweak: { floors: [2, 4] },
  },
  {
    id: "market",
    name: "Little market",
    tagline: "A row of shops with shared access",
    plot: { w: 40, d: 60 },
    request: { ...base, kind: "market", floors: 1, shopsPerFloor: 4 },
    tweak: { floors: [1, 3] },
  },
  {
    id: "blank",
    name: "Blank plot",
    tagline: "An empty outline — build from scratch",
    plot: { w: 40, d: 60 },
    request: { ...base, kind: "blank" },
    tweak: { floors: [1, 4] },
  },
];

export function buildTemplate(
  template: Template,
  options: { plot?: { w: number; d: number }; bedrooms?: number; floors?: number } = {},
): EditResult {
  const plot = options.plot ?? template.plot;
  const result = createBlueprint({
    ...template.request,
    bedrooms: options.bedrooms ?? template.request.bedrooms,
    floors: options.floors ?? template.request.floors,
    widthCm: Math.round(plot.w * FEET),
    depthCm: Math.round(plot.d * FEET),
    marginCm: 60,
    road: "south",
  });
  if (!result.ok) return result;
  const polished = polishTemplate(result.project);
  const home = template.ensuite ? withEnsuite(polished) : polished;
  // New homes start with the Indian modern look.
  return { ...result, project: home.style?.preset ? home : withStylePreset(home, "indian-modern") };
}

/**
 * Gives the biggest bedroom its own bathroom, if it fits without breaking any
 * checklist essential; otherwise the home stays as it was.
 */
function withEnsuite(project: Project): Project {
  const rooms = project.floors.flatMap((f) =>
    f.rooms.filter((r) => r.kind === "bedroom").map((r) => ({ floorId: f.id, room: r })),
  );
  const biggest = rooms.sort(
    (a, b) => b.room.bounds.w * b.room.bounds.d - a.room.bounds.w * a.room.bounds.d,
  )[0];
  if (!biggest) return project;
  const result = addAttachedBathroom(project, biggest.floorId, biggest.room.id);
  if (!result.ok) return project;
  const before = homeChecks(project).essentials.filter((c) => !c.done).length;
  const after = homeChecks(result.project).essentials.filter((c) => !c.done).length;
  return after <= before ? result.project : project;
}

/** Rooms that are fine without a window, in the order we'd rather swap them. */
const WINDOWLESS_OK: RoomKind[] = ["bathroom", "utility", "dining"];

const darkBedrooms = (p: Project) =>
  projectAdvisories(p).filter(
    (i) =>
      i.code === "room-no-window" &&
      p.floors.some((f) => f.rooms.some((r) => r.id === i.source?.id && r.kind === "bedroom")),
  );

/**
 * A starting home should pass its own checklist: every bedroom gets a window,
 * either by adding one on an outside wall or, for an inner bedroom, by
 * swapping uses with a nearby bathroom or utility room that has daylight.
 */
export function polishTemplate(project: Project): Project {
  let p = project;
  for (let guard = 0; guard < 16; guard++) {
    const dark = darkBedrooms(p);
    const issue = dark[0];
    const source = issue?.source;
    if (!source || !("floorId" in source) || !source.floorId) break;
    const floorId = source.floorId;
    const windowed = addRoomWindow(p, floorId, source.id);
    if (windowed.ok && darkBedrooms(windowed.project).length < dark.length) {
      p = windowed.project;
      continue;
    }
    const floor = p.floors.find((f) => f.id === floorId)!;
    const bedroom = floor.rooms.find((r) => r.id === source.id)!;
    const area = bedroom.bounds.w * bedroom.bounds.d;
    const candidates = floor.rooms
      .filter(
        (r) =>
          r.id !== bedroom.id &&
          r.unitId === bedroom.unitId &&
          WINDOWLESS_OK.includes(r.kind) &&
          // An attached bathroom stays with its bedroom.
          !r.attachedTo &&
          // Never squeeze a bedroom into a cupboard-sized room.
          Math.min(r.bounds.w, r.bounds.d) >= 240 &&
          r.bounds.w * r.bounds.d >= area * 0.6,
      )
      .sort(
        (a, b) =>
          WINDOWLESS_OK.indexOf(a.kind) - WINDOWLESS_OK.indexOf(b.kind) ||
          Math.abs(a.bounds.w * a.bounds.d - area) - Math.abs(b.bounds.w * b.bounds.d - area),
      );
    let fixed = false;
    for (const c of candidates) {
      const swapped = swapRoomUses(p, floorId, bedroom.id, c.id);
      if (swapped.ok && darkBedrooms(swapped.project).length < dark.length) {
        p = swapped.project;
        fixed = true;
        break;
      }
    }
    if (!fixed) {
      const moved = slideToDaylight(p, floorId, bedroom.id, dark.length);
      if (!moved) break;
      p = moved;
    }
  }
  return p;
}

/** Other checklist essentials still failing (doors, stairs…), by id. */
const otherFailures = (p: Project) =>
  homeChecks(p)
    .essentials.filter((c) => !c.done && c.id !== "windows")
    .map((c) => c.id)
    .sort()
    .join(",");

/**
 * The nearest valid spot for a dark room against an outside wall of its
 * floor, when it leaves fewer dark bedrooms and breaks nothing else.
 */
function slideToDaylight(p: Project, floorId: string, roomId: string, darkCount: number): Project | null {
  const floor = p.floors.find((f) => f.id === floorId)!;
  const room = floor.rooms.find((r) => r.id === roomId)!;
  const fp = floor.footprint,
    { w, d } = room.bounds;
  const before = otherFailures(p);
  const spots: { x: number; z: number; cost: number }[] = [];
  for (let x = fp.x; x <= fp.x + fp.w - w; x += 10)
    for (let z = fp.z; z <= fp.z + fp.d - d; z += 10) {
      const edge = x === fp.x || z === fp.z || x + w === fp.x + fp.w || z + d === fp.z + fp.d;
      if (edge) spots.push({ x, z, cost: Math.hypot(x - room.bounds.x, z - room.bounds.z) });
    }
  spots.sort((a, b) => a.cost - b.cost);
  for (const spot of spots.slice(0, 400)) {
    const result = moveRoomStrict(p, floorId, roomId, { x: spot.x, z: spot.z, w, d });
    if (!result.ok) continue;
    if (darkBedrooms(result.project).length >= darkCount) continue;
    if (otherFailures(result.project) !== before) continue;
    return result.project;
  }
  return null;
}
