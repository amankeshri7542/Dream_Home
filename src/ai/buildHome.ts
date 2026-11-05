// Turns a designer's plan into a real, valid home. The plan only proposes:
// every step here goes through the same domain commands as a tap in the app,
// and a step that would break the home is skipped, so the result is always
// a project the editor accepts.
import { homeChecks } from "../domain/advice";
import { COMPASS_ANGLE, roomBearing, roomZone } from "../domain/compass";
import { createBlueprint } from "../domain/blueprints";
import { ROOM_CATALOG, addCatalogRoom, resizeBuilding } from "../domain/builder";
import { addAttachedBathroom } from "../domain/ensuite";
import { ensuiteHost, sharedEdge } from "../domain/walls";
import { replaceFloor } from "../domain/core";
import { finalizeEdit } from "../domain/edit";
import { mainDoor } from "../domain/entrance";
import { allocateId, componentIds, inside, snap } from "../domain/geometry";
import { furnitureCatalogItem, furnitureFitsRoom } from "../domain/furniture";
import { addFurniture, customizeFurniture, resetFurniture, updateFurniture } from "../domain/furnitureCommands";
import { addLandscape } from "../domain/landscapeCommands";
import { ensureRoomDoor } from "../domain/openingCommands";
import {
  applyStylePreset,
  setExterior,
  setGarden,
  setParking,
  setRoomFloorMaterial,
  setRoomWallColor,
  setSite,
  setStyle,
} from "../domain/materials";
import { addBalcony, swapRoomUses, updateRoom, validateProject } from "../domain/model";
import type { EdgeSide, EditResult, Project, Room, RoomKind } from "../domain/types";
import { FEET, polishTemplate } from "../onboarding/templates";
import { isRegionalVibe, type HomeBrief, type HomePlan, type Palette, type PlannedRoom, type RoomPlan, type RoomUse, type Zone } from "./brief";
import { VIBE_LOOK } from "./planner";

const MARGIN = 60;
const BALCONY_DEPTH = 150;
const BALCONY_WIDTH = 360;
/** The road runs along the plan's south edge; `north` turns the compass to match the facing. */
const NORTH_FOR_FACING: Record<EdgeSide, number> = { south: 0, east: 90, north: 180, west: 270 };

type Step = (p: Project) => EditResult;
/** Applies a step if it succeeds; otherwise keeps the home as it was. */
const attempt = (p: Project, step: Step): { project: Project; ok: boolean } => {
  const r = step(p);
  return r.ok ? { project: r.project, ok: true } : { project: p, ok: false };
};
const allRooms = (p: Project) => p.floors.flatMap((f) => f.rooms.map((room) => ({ floorId: f.id, room })));
const area = (r: Room) => r.bounds.w * r.bounds.d;
const failing = (p: Project) => homeChecks(p).essentials.filter((c) => !c.done).length;
const isBedroomUse = (use: RoomUse) => use.endsWith("bedroom");

const KIND_OF: Record<RoomUse, RoomKind> = {
  "master-bedroom": "bedroom",
  bedroom: "bedroom",
  "kids-bedroom": "bedroom",
  "grandparents-bedroom": "bedroom",
  "guest-bedroom": "bedroom",
  living: "living",
  kitchen: "kitchen",
  dining: "dining",
  pooja: "utility",
  office: "utility",
  bathroom: "bathroom",
  utility: "utility",
};
/** Rooms the generator doesn't make, and the catalog entry that adds one. */
const ADDED: Partial<Record<RoomUse, { catalog: string; size: "small" | "regular" }>> = {
  pooja: { catalog: "prayer", size: "regular" },
  office: { catalog: "study", size: "small" },
  dining: { catalog: "dining", size: "small" },
  utility: { catalog: "utility", size: "small" },
  bathroom: { catalog: "bathroom", size: "regular" },
};

// Compass zones (Vastu): which ninth of the footprint a room sits in (src/domain/compass.ts).
export { roomBearing, roomZone };
function zoneCost(p: Project, floorId: string, room: Room, want: Zone): number {
  if (want === "any") return 0;
  const { angle, reach } = roomBearing(p, floorId, room);
  if (want === "centre") return reach;
  const diff = Math.abs(((angle - COMPASS_ANGLE[want] + 540) % 360) - 180);
  return (diff / 180) * (0.5 + reach / 2);
}
/** The smallest sensible side for a room in each use. */
const MIN_SIDE: Partial<Record<RoomKind, number>> = { bedroom: 260, living: 280, kitchen: 200, dining: 220 };
function swapFits(a: Room, b: Room) {
  const ratio = area(a) / area(b);
  const side = (r: Room) => Math.min(r.bounds.w, r.bounds.d);
  return (
    ratio > 0.6 &&
    ratio < 1.67 &&
    side(b) >= (MIN_SIDE[a.kind] ?? 0) &&
    side(a) >= (MIN_SIDE[b.kind] ?? 0) &&
    !a.attachedTo &&
    !b.attachedTo
  );
}
// ---------------------------------------------------------------------------
// The layout a designer would draw: who sits next to whom, and room shapes.
// ---------------------------------------------------------------------------
const POOJA = /prayer|pooja|puja|mandir/i;
const aspect = (r: Room) => Math.max(r.bounds.w, r.bounds.d) / Math.max(1, Math.min(r.bounds.w, r.bounds.d));
/** Rooms that share a wall long enough for a doorway. */
const touching = (a: Room, b: Room) => sharedEdge(a.bounds, b.bounds) >= 90;
/** The room the front door opens into. */
function entryRoom(p: Project): Room | null {
  const door = mainDoor(p);
  if (!door) return null;
  const step = door.line - door.out * 40;
  const [x, z] = door.axis === "x" ? [door.along, step] : [step, door.along];
  return p.floors.find((f) => f.id === door.floorId)?.rooms.find((r) => inside(r.bounds, x, z)) ?? null;
}

/**
 * How far a home's layout is from what a designer would draw (0 is ideal):
 * the kitchen opens onto the dining or living room, dining sits by living,
 * bedrooms keep away from the kitchen and the front door, the pooja room never
 * shares a wall with a bathroom, and no room is a corridor (24 × 9 ft).
 */
export function layoutCost(p: Project): number {
  let cost = 0;
  for (const floor of p.floors) {
    const rooms = floor.rooms;
    const social = rooms.filter((r) => r.kind === "living" || r.kind === "dining");
    const living = rooms.filter((r) => r.kind === "living");
    for (const r of rooms) {
      if (r.kind === "kitchen") {
        if (social.length && !social.some((o) => touching(r, o))) cost += 1;
        cost += Math.max(0, aspect(r) - 2) * 0.8;
      }
      if (r.kind === "dining" && living.length && !living.some((o) => touching(r, o))) cost += 0.4;
      if (r.kind === "bedroom") {
        if (rooms.some((o) => o.kind === "kitchen" && touching(r, o))) cost += 0.3;
        cost += Math.max(0, aspect(r) - 2) * 0.5;
      }
      // A long hall is traditional; a living room past 3 : 1 is a corridor.
      if (r.kind === "living") cost += Math.max(0, aspect(r) - 3) * 0.5;
      if (r.kind === "bathroom" && !r.attachedTo) cost += Math.max(0, aspect(r) - 2.2) * 0.3;
      if (POOJA.test(r.name) && rooms.some((o) => o.kind === "bathroom" && touching(r, o))) cost += 1;
    }
  }
  if (entryRoom(p)?.kind === "bedroom") cost += 1;
  return cost;
}

/** What the layout pass weighs: the design cost, and whether a change keeps the zones that are already right. */
type Judge = { cost: (p: Project) => number; keeps: (before: Project, after: Project) => boolean };
/** The layout and the zone wishes in one sum (Vastu homes weigh their zones more); a room already in its zone stays. */
function designJudge(wants: Map<string, Zone>, vastu: boolean): Judge {
  const weight = vastu ? 2 : 0.6;
  const zones = (q: Project) => new Map(allRooms(q).map(({ floorId, room }) => [room.name, roomZone(q, floorId, room)] as const));
  return {
    cost: (q) =>
      layoutCost(q) +
      weight * allRooms(q).reduce((sum, { floorId, room }) => sum + zoneCost(q, floorId, room, wants.get(room.name) ?? "any"), 0),
    keeps: (before, after) => {
      const was = zones(before),
        now = zones(after);
      return [...wants].every(([name, want]) => was.get(name) !== want || now.get(name) === want);
    },
  };
}

/** Swaps room uses (never shapes) while the design cost falls. */
function arrangeLayout(project: Project, judge: Judge, fixedId: string | null): Project {
  let p = project;
  let now = judge.cost(p);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const floor of p.floors) {
      const count = floor.rooms.length;
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++) {
          const rooms = p.floors.find((f) => f.id === floor.id)!.rooms;
          const a = rooms[i],
            b = rooms[j];
          if (!a || !b || a.unitId !== b.unitId || a.kind === b.kind || !swapFits(a, b)) continue;
          if (a.id === fixedId || b.id === fixedId) continue;
          const r = swapRoomUses(p, floor.id, a.id, b.id);
          if (!r.ok) continue;
          const next = judge.cost(r.project);
          if (next >= now - 0.05 || !judge.keeps(p, r.project) || failing(r.project) > failing(p)) continue;
          p = r.project;
          now = next;
          improved = true;
        }
    }
    if (!improved) break;
  }
  return p;
}

/** What the piece cut off a too-long room becomes. */
const OFFCUT: Partial<Record<RoomKind, string>> = {
  kitchen: "Store room",
  bathroom: "Utility",
  bedroom: "Dressing room",
  dining: "Store room",
};
/** The longest a room may be for its width before it's cut, and the shortest it's cut to. */
const LONGEST: Partial<Record<RoomKind, number>> = { kitchen: 2, bedroom: 2.2, dining: 2.2, bathroom: 2.2 };
const KEEP_MIN: Partial<Record<RoomKind, number>> = { kitchen: 300, bedroom: 330, dining: 280, bathroom: 210 };
/** Bigger than this (about 105 sq ft) a bathroom gives its far end to a utility. */
const BATH_MAX = 98_000;
const OFFCUT_MIN = 150;
/** An offcut is held to the same shape rule, or it would be the next corridor. */
const OFFCUT_LONGEST = 2.2;

/**
 * Cuts a room that's too long for its width (or a bathroom that's a hall) in
 * two across its length: the room keeps a good shape, the rest becomes a store,
 * utility or dressing room. Tries both ends and keeps the better layout.
 */
function splitRoom(p: Project, floorId: string, room: Room, judge: Judge): Project | null {
  const name = OFFCUT[room.kind];
  if (!name || room.attachedTo) return null;
  const b = room.bounds;
  const along = b.w >= b.d ? "w" : "d";
  const long = b[along],
    short = along === "w" ? b.d : b.w;
  const tooLong = aspect(room) > (LONGEST[room.kind] ?? 9);
  const hall = room.kind === "bathroom" && b.w * b.d > BATH_MAX;
  if (!tooLong && !hall) return null;
  const ideal = room.kind === "bathroom" ? Math.max(240, Math.min(short * 1.5, 70_000 / short)) : short * 1.5;
  const target = snap(Math.max(KEEP_MIN[room.kind] ?? 0, ideal));
  const floor = p.floors.find((f) => f.id === floorId)!;
  const id = allocateId("room-utility", componentIds(p));
  let best: { project: Project; cost: number } | null = null;
  // The ideal cut first, then a little either side (a cut can land on a door).
  const tries = [0, -20, 20, -40, 40].flatMap((d) => [true, false].map((atStart) => ({ keep: target + d, atStart })));
  for (const { keep, atStart } of tries) {
    const rest = long - keep;
    // Each piece must be a real room, not a sliver or another corridor.
    if (keep < (KEEP_MIN[room.kind] ?? 0) || rest < OFFCUT_MIN || Math.max(rest, short) / Math.min(rest, short) > OFFCUT_LONGEST) continue;
    const main = { ...b, [along]: keep, ...(atStart ? {} : along === "w" ? { x: b.x + rest } : { z: b.z + rest }) };
    const cut = { ...b, [along]: rest, ...(atStart ? (along === "w" ? { x: b.x + keep } : { z: b.z + keep }) : {}) };
    const offcut: Room = {
      id,
      name,
      kind: "utility",
      bounds: cut,
      unitId: room.unitId,
      ...(room.wallColor ? { wallColor: room.wallColor } : {}),
      ...(room.floorMaterial ? { floorMaterial: room.floorMaterial } : {}),
    };
    const rooms = floor.rooms.flatMap((r) => (r.id === room.id ? [{ ...r, bounds: main }, offcut] : [r]));
    const cut1 = finalizeEdit(p, replaceFloor(p, { ...floor, rooms }));
    // Each piece keeps a door it inherits, or gets its own like the automatic doors do.
    const door1 = cut1.ok ? ensureRoomDoor(cut1.project, floorId, id) : cut1;
    const r = door1.ok ? ensureRoomDoor(door1.project, floorId, room.id) : door1;
    if (!r.ok || !judge.keeps(p, r.project) || failing(r.project) > failing(p)) continue;
    // Nearer the ideal cut wins a tie.
    const cost = judge.cost(r.project);
    if (!best || cost < best.cost - 0.01) best = { project: r.project, cost };
  }
  return best?.project ?? null;
}

/** Cuts every room that's a corridor into a good room and a useful one. */
function proportionRooms(project: Project, judge: Judge): Project {
  let p = project;
  for (const floor of project.floors)
    for (const room of floor.rooms) {
      const now = p.floors.find((f) => f.id === floor.id)?.rooms.find((r) => r.id === room.id);
      if (!now) continue;
      p = splitRoom(p, floor.id, now, judge) ?? p;
    }
  return p;
}

/** Swaps room uses (never shapes) while that brings rooms closer to their wished-for zones. */
function arrangeZones(project: Project, wants: Map<string, Zone>, fixedId: string | null): Project {
  let p = project;
  const cost = (q: Project) =>
    allRooms(q).reduce((sum, { floorId, room }) => sum + zoneCost(q, floorId, room, wants.get(room.name) ?? "any"), 0);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const floor of p.floors) {
      const rooms = floor.rooms;
      for (let i = 0; i < rooms.length; i++)
        for (let j = i + 1; j < rooms.length; j++) {
          const a = p.floors.find((f) => f.id === floor.id)!.rooms[i];
          const b = p.floors.find((f) => f.id === floor.id)!.rooms[j];
          if (!a || !b || a.unitId !== b.unitId || a.kind === b.kind || !swapFits(a, b)) continue;
          // The bedroom with the attached bathroom keeps its use.
          if (a.id === fixedId || b.id === fixedId) continue;
          if (!wants.has(a.name) && !wants.has(b.name)) continue;
          const r = swapRoomUses(p, floor.id, a.id, b.id);
          if (!r.ok || cost(r.project) >= cost(p) - 0.05 || failing(r.project) > failing(p)) continue;
          p = r.project;
          improved = true;
        }
    }
    if (!improved) break;
  }
  return p;
}

// ---------------------------------------------------------------------------
// The program: how many floors and bedrooms the plot can really take.
// ---------------------------------------------------------------------------
function blueprint(brief: HomeBrief, plan: HomePlan, notes: string[]): Project | null {
  const bedroomCount = Math.max(1, plan.rooms.filter((r) => isBedroomUse(r.use)).length || brief.bedrooms);
  let floors = brief.floors === "auto" ? plan.floors : brief.floors;
  // A balcony needs an upper floor.
  if (brief.floors === "auto" && brief.musts.includes("balcony")) floors = Math.max(floors, 2);
  const request = (beds: number, levels: number, front: number) =>
    createBlueprint({
      kind: "home",
      flavor: levels > 1 ? "duplex" : plan.layout === "open" ? "villa" : "bungalow",
      courtyard: plan.layout === "courtyard",
      floors: levels,
      bedrooms: beds,
      unitsPerFloor: 1,
      bedroomsPerUnit: 2,
      shopsPerFloor: 1,
      widthCm: Math.round(brief.plot.w * FEET),
      depthCm: Math.round(brief.plot.d * FEET) - front,
      marginCm: MARGIN,
      road: "south",
      north: NORTH_FOR_FACING[brief.facing],
    });
  // The homeowner's floor count is kept; "AI picks" may add floors to fit.
  const maxLevels = brief.floors === "auto" ? 3 : floors;
  // Keep a strip free at the front so a balcony can project over it, if the plot allows.
  const fronts = brief.musts.includes("balcony") ? [BALCONY_DEPTH, 0] : [0];
  for (const front of fronts)
    for (let beds = bedroomCount; beds >= 1; beds--)
      for (let levels = floors; levels <= maxLevels; levels++) {
        const r = request(beds, levels, front);
        if (!r.ok) continue;
        // The real plot is deeper by the front strip; the house keeps its place at the back.
        r.project.plot.depth += front;
        // The homeowner told us which way it faces: the compass is real.
        r.project.plot.compass = true;
        if (validateProject(r.project).length) continue;
        if (levels !== floors) notes.push(`We used ${levels} floors so every room fits on this plot.`);
        if (beds < bedroomCount) notes.push(`This plot fits ${beds} bedroom${beds === 1 ? "" : "s"} comfortably.`);
        return r.project;
      }
  return null;
}

/** Adds a room by catalog id on the best floor, growing the house a little if needed. */
function addRoom(p: Project, use: RoomUse, preferUpper: boolean): { project: Project; id: string } | null {
  const spec = ADDED[use];
  if (!spec) return null;
  const order = preferUpper ? [...p.floors].reverse() : p.floors;
  const before = new Set(allRooms(p).map((r) => r.room.id));
  const added = (q: Project) => allRooms(q).find((r) => !before.has(r.room.id))?.room.id;
  for (const size of [spec.size, "small"] as const)
    for (const floor of order) {
      const r = addCatalogRoom(p, floor.id, spec.catalog, size);
      if (r.ok && failing(r.project) <= failing(p)) return { project: r.project, id: added(r.project)! };
    }
  // Grow the ground floor by exactly the room's depth (keeping the garden) and
  // set the room flush in the new strip, so no thin gap is left behind it.
  const fp = p.floors[0].footprint;
  const maxD = Math.floor((p.plot.depth - p.plot.setback - fp.z) / 10) * 10;
  const item = ROOM_CATALOG.find((r) => r.id === spec.catalog)!;
  for (const size of ["regular", "small"] as const) {
    const scale = size === "small" ? 0.8 : 1;
    const depth = Math.round((item.depth * scale) / 10) * 10;
    const d = fp.d + depth;
    if (d > maxD) continue;
    const grown = resizeBuilding(p, p.floors[0].id, { w: fp.w, d });
    if (!grown.ok) continue;
    for (const at of [{ x: fp.x, z: fp.z + fp.d }, undefined]) {
      const r = addCatalogRoom(grown.project, p.floors[0].id, spec.catalog, size, at);
      if (r.ok && failing(r.project) <= failing(p)) return { project: r.project, id: added(r.project)! };
    }
  }
  return null;
}

/** Bedrooms ranked for each planned use: the main bedroom gets the biggest, grandparents stay downstairs. */
function assignBedrooms(p: Project, planned: PlannedRoom[], mainId: string | null): Map<string, PlannedRoom> {
  const out = new Map<string, PlannedRoom>();
  const free = allRooms(p)
    .filter((r) => r.room.kind === "bedroom" && !r.room.attachedTo)
    .sort((a, b) => Number(b.room.id === mainId) - Number(a.room.id === mainId) || area(b.room) - area(a.room));
  const ground = p.floors[0].id;
  const order: RoomUse[] = ["master-bedroom", "grandparents-bedroom", "bedroom", "kids-bedroom", "guest-bedroom"];
  const wants = planned
    .filter((r) => isBedroomUse(r.use))
    .sort((a, b) => order.indexOf(a.use) - order.indexOf(b.use));
  for (const want of wants) {
    const i =
      want.use === "grandparents-bedroom" || want.use === "guest-bedroom"
        ? Math.max(0, free.findIndex((r) => r.floorId === ground))
        : 0;
    const pick = free.splice(i, 1)[0];
    if (pick) out.set(pick.room.id, want);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Styling a room: paint, floor, furniture colours and a few extra pieces.
// ---------------------------------------------------------------------------
function finishFor(catalogId: string, palette: Palette): string | undefined {
  const entry = furnitureCatalogItem(catalogId);
  const slot = entry?.finishSlot;
  const value = slot ? palette[slot] : undefined;
  return value && entry?.finishes?.includes(value) ? value : undefined;
}
export function styleRoom(
  project: Project,
  floorId: string,
  roomId: string,
  style: Palette & { paint: string; floor: string; extras: string[] },
  fresh: boolean,
): Project {
  let p = project;
  p = attempt(p, (q) => setRoomWallColor(q, floorId, roomId, style.paint)).project;
  p = attempt(p, (q) => setRoomFloorMaterial(q, floorId, roomId, style.floor)).project;
  if (fresh) p = attempt(p, (q) => resetFurniture(q, floorId, roomId)).project;
  p = attempt(p, (q) => customizeFurniture(q, floorId, roomId)).project;
  const room = () => p.floors.find((f) => f.id === floorId)!.rooms.find((r) => r.id === roomId)!;
  const has = new Set((room().furniture ?? []).map((i) => i.catalogId));
  for (const id of style.extras) {
    if (has.has(id) || !furnitureFitsRoom(id, room().kind)) continue;
    const r = addFurniture(p, floorId, roomId, id);
    if (r.ok) {
      p = r.project;
      has.add(id);
    }
  }
  for (const item of room().furniture ?? []) {
    const finish = finishFor(item.catalogId, style);
    if (finish && finish !== item.finish)
      p = attempt(p, (q) => updateFurniture(q, floorId, roomId, item.id, { finish })).project;
  }
  return p;
}

export type BuiltHome = { project: Project; notes: string[] };
type Attempt = BuiltHome & { skipped: string[] };

/** Words that tie a design note to a room the engine had to leave out. */
const NOTE_WORDS: Partial<Record<RoomUse, string>> = {
  pooja: "pooja",
  office: "office",
  dining: "dining",
  utility: "utility",
};

/**
 * Builds the whole home and the notes to show with it. When the floors are
 * left to us and a wished-for room doesn't fit, it tries one more floor.
 * Returns null only if no home fits the plot at all.
 */
/** `arrange: false` skips the designer's layout pass (tests compare with and without it). */
export type BuildOptions = { arrange?: boolean };
export function buildHome(brief: HomeBrief, plan: HomePlan, options: BuildOptions = {}): BuiltHome | null {
  let best = buildOnce(brief, plan, options);
  if (best && best.skipped.length && brief.floors === "auto" && plan.floors < 3) {
    const taller = buildOnce(brief, { ...plan, floors: plan.floors + 1 }, options);
    if (taller && taller.skipped.length < best.skipped.length)
      best = { ...taller, notes: [`We used ${plan.floors + 1} floors so every room fits.`, ...taller.notes] };
  }
  if (!best) return null;
  const { skipped } = best;
  const planNotes = plan.notes.filter((n) => !skipped.some((word) => n.toLowerCase().includes(word)));
  // What we had to change comes first, so it's never hidden on a phone.
  return { project: best.project, notes: [...best.notes, ...planNotes].slice(0, 6) };
}

/** How many bedrooms a plot takes (up to 6), for a gentle hint while choosing. */
export function bedroomsThatFit(plot: { w: number; d: number }, floors: number | "auto"): number {
  const levels = floors === "auto" ? [1, 2, 3] : [floors];
  for (let beds = 6; beds >= 1; beds--)
    for (const n of levels) {
      const r = createBlueprint({
        kind: "home",
        flavor: n > 1 ? "duplex" : "bungalow",
        floors: n,
        bedrooms: beds,
        unitsPerFloor: 1,
        bedroomsPerUnit: 2,
        shopsPerFloor: 1,
        widthCm: Math.round(plot.w * FEET),
        depthCm: Math.round(plot.d * FEET),
        marginCm: MARGIN,
        road: "south",
      });
      if (r.ok && !validateProject(r.project).length) return beds;
    }
  return 0;
}

function buildOnce(brief: HomeBrief, plan: HomePlan, options: BuildOptions = {}): Attempt | null {
  const notes: string[] = [];
  const skipped: string[] = [];
  const base = blueprint(brief, plan, notes);
  if (!base) return null;
  // Daylight for every bedroom before anything is added around them.
  let p: Project = { ...polishTemplate(base), name: plan.name };

  // 1. The main (biggest) bedroom gets its attached bathroom first, while there's free floor.
  let mainId: string | null = null;
  if (brief.musts.includes("ensuite")) {
    // Biggest first; a bedroom with free floor beside it wins over a bigger, boxed-in one.
    const bedrooms = allRooms(p)
      .filter(({ room }) => room.kind === "bedroom")
      .sort((a, b) => area(b.room) - area(a.room));
    for (const main of bedrooms) {
      const r = addAttachedBathroom(p, main.floorId, main.room.id);
      if (!r.ok || failing(r.project) > failing(p)) continue;
      p = r.project;
      mainId = main.room.id;
      break;
    }
    if (!mainId) {
      notes.push("The bedrooms are too snug for an attached bathroom on this plot.");
      skipped.push("attached");
    }
  }

  // 2. Rooms the generator doesn't make: pooja, office, dining, utility, more bathrooms.
  const addedFor = new Map<string, PlannedRoom>();
  // The attached bathroom is extra to the planned ones.
  const bathroomsNow = allRooms(p).filter((r) => r.room.kind === "bathroom" && !r.room.attachedTo).length;
  let bathroomsWanted = plan.rooms.filter((r) => r.use === "bathroom").length - bathroomsNow;
  for (const planned of plan.rooms) {
    if (planned.use === "bathroom") {
      if (bathroomsWanted-- <= 0) continue;
    } else if (!ADDED[planned.use]) continue;
    const added = addRoom(p, planned.use, planned.use === "bathroom" || planned.use === "office");
    if (!added) {
      if (planned.use !== "bathroom") {
        notes.push(`There wasn’t space for the ${planned.name.toLowerCase()} on this plot.`);
        skipped.push(NOTE_WORDS[planned.use] ?? planned.name.toLowerCase());
      }
      continue;
    }
    p = added.project;
    addedFor.set(added.id, planned);
  }

  // 3. Name every room after its planned use.
  const named = new Map<string, PlannedRoom>([...assignBedrooms(p, plan.rooms, mainId), ...addedFor]);
  const taken = new Set([...named.values()]);
  for (const { room } of allRooms(p)) {
    if (named.has(room.id) || room.attachedTo) continue;
    const match = plan.rooms.find((r) => !taken.has(r) && KIND_OF[r.use] === room.kind && !ADDED[r.use]) ??
      plan.rooms.find((r) => !taken.has(r) && KIND_OF[r.use] === room.kind && r.use === "bathroom");
    if (match) {
      named.set(room.id, match);
      taken.add(match);
    }
  }
  for (const { floorId, room } of allRooms(p)) {
    const planned = named.get(room.id);
    if (planned && planned.name !== room.name) p = attempt(p, (q) => updateRoom(q, floorId, room.id, { name: planned.name })).project;
  }

  // 4. Vastu and other placement wishes: swap uses toward each room's zone.
  const wants = new Map(plan.rooms.filter((r) => r.zone !== "any").map((r) => [r.name, r.zone] as const));
  if (wants.size) p = arrangeZones(p, wants, mainId);
  if (options.arrange !== false) {
    // 4b. Then the layout a designer would draw: the kitchen by the dining room,
    // bedrooms away from the front door, the pooja room clear of bathrooms…
    const judge = designJudge(wants, brief.musts.includes("vastu"));
    p = arrangeLayout(p, judge, mainId);
    // 4c. …and no corridors: a 24 × 9 ft kitchen keeps 15 ft and gains a store.
    p = proportionRooms(p, judge);
  }

  // 5. Daylight again after the swaps, unless it would part the main bedroom from its bathroom.
  const polished = polishTemplate(p);
  const linked = (q: Project) => !mainId || q.floors.some((f) => f.rooms.some((r) => ensuiteHost(f.rooms, r)?.id === mainId));
  if (linked(polished)) p = polished;

  // 6. Outside: the vibe's look (an everyday vibe gets the Indian flat roof
  // with parapet, chhajjas, water tank and compound wall), then the designer's
  // own facade, trim and door colours. A regional look keeps its own outside.
  const ex = plan.exterior;
  p = attempt(p, (q) => applyStylePreset(q, VIBE_LOOK[brief.vibe])).project;
  if (!isRegionalVibe(brief.vibe)) {
    p = attempt(p, (q) => setExterior(q, ex.finish)).project;
    p = attempt(p, (q) => setStyle(q, { trim: ex.trim, frontDoor: ex.door })).project;
  }
  p = attempt(p, (q) => setParking(q, brief.musts.includes("parking"))).project;
  p = attempt(p, (q) => setGarden(q, true)).project;
  p = attempt(p, (q) => setSite(q, { ground: plan.ground })).project;
  for (const kind of plan.garden) p = attempt(p, (q) => addLandscape(q, kind)).project;
  if (brief.musts.includes("balcony")) {
    const upper = p.floors[1];
    // The balcony door takes the window on the wall it opens from, so try it
    // centred, then flush to either end, and keep the first that leaves every
    // essential (a bedroom's only window, above all) in place.
    let added = false;
    if (upper) {
      const span = upper.footprint.w;
      const width = Math.min(BALCONY_WIDTH, span);
      for (const offset of [undefined, 0, span - width]) {
        const r = addBalcony(p, upper.id, { edge: "south", depth: BALCONY_DEPTH, width, offset });
        if (!r.ok || failing(r.project) > failing(p)) continue;
        p = r.project;
        added = true;
        break;
      }
    }
    if (!added)
      notes.push(
        upper
          ? "There wasn’t room for a balcony on this plot."
          : "A balcony needs an upper floor; add one from Build any time.",
      );
  }

  // 7. Inside: every planned room gets its colours and pieces.
  for (const { floorId, room } of allRooms(p)) {
    const planned = [...named.entries()].find(([, r]) => r.name === room.name)?.[1];
    if (planned) p = styleRoom(p, floorId, room.id, planned, false);
  }

  if (validateProject(p).length) return { project: base, notes, skipped };
  return { project: p, notes, skipped };
}

/** "Make it nice" for one room: restyles it, starting fresh when the plan says so. */
export function applyRoomPlan(project: Project, floorId: string, roomId: string, plan: RoomPlan): Project {
  const p = styleRoom(project, floorId, roomId, plan, plan.layout === "fresh");
  return validateProject(p).length ? project : p;
}
