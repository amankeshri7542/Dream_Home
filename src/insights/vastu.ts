// Vastu, as friendly traditional guidance (pure): where the main door, the
// kitchen, the main bedroom, the pooja room and the rest sit on the compass.
// Each rule passes, half-passes or misses with a tip, and some offer a swap
// with the room that sits where tradition puts it (never applied for you).
// Opt-in, and only once the homeowner has said which way the home faces.
import {
  COMPASS_LABEL,
  homeFacing,
  nearestCompass,
  pointZone,
  roomZone,
  trueBearing,
  type Compass8,
  type Zone,
} from "../domain/compass";
import { resolveFurniture, roomWalls } from "../domain/furniture";
import { swapRoomUses } from "../domain/model";
import type { Floor, Project, Room } from "../domain/types";

export type VastuStatus = "pass" | "partial" | "fail" | "na";
export type VastuSwap = { floorId: string; sourceId: string; targetId: string; label: string };
export type VastuRule = {
  id: string;
  label: string;
  weight: number;
  status: VastuStatus;
  tip: string;
  /** A swap that puts this room where tradition suggests (checked to be a valid edit). */
  swap?: VastuSwap;
};
export type VastuReport = { score: number; rules: VastuRule[] };

const POOJA = /prayer|pooja|puja|mandir/i;
const zoneName = (z: Zone) => (z === "centre" ? "centre" : COMPASS_LABEL[z].toLowerCase());
const list = (zones: Compass8[]) => {
  const names = zones.map((z) => COMPASS_LABEL[z].toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
};
type Placed = { floor: Floor; room: Room };
const area = (r: Room) => r.bounds.w * r.bounds.d;

/** The biggest room matching `test` (a tie goes to the first id). */
function biggest(project: Project, test: (r: Room) => boolean): Placed | null {
  const all = project.floors.flatMap((floor) => floor.rooms.filter(test).map((room) => ({ floor, room })));
  return all.sort((a, b) => area(b.room) - area(a.room) || a.room.id.localeCompare(b.room.id))[0] ?? null;
}

/**
 * A rule for "this room belongs in these zones": pass in `best`, half in
 * `also`; otherwise a miss, with a swap toward the best zone when one works.
 */
function placement(
  project: Project,
  placed: Placed | null,
  rule: { id: string; label: string; weight: number; best: Compass8[]; also?: Compass8[]; good: string; missing?: string },
  withSwaps: boolean,
): VastuRule {
  const base = { id: rule.id, label: rule.label, weight: rule.weight };
  if (!placed) return { ...base, status: "na", tip: rule.missing ?? "" };
  const zone = roomZone(project, placed.floor.id, placed.room);
  const where = `${placed.room.name} is in the ${zoneName(zone)}.`;
  const wanted = `Vastu places it in the ${list([...rule.best, ...(rule.also ?? [])])}.`;
  if (zone !== "centre" && rule.best.includes(zone)) return { ...base, status: "pass", tip: `${placed.room.name} is in the ${zoneName(zone)}. ${rule.good}` };
  if (zone !== "centre" && rule.also?.includes(zone))
    return { ...base, status: "partial", tip: `${where} A good second choice; ${list(rule.best)} is traditional.` };
  return { ...base, status: "fail", tip: `${where} ${wanted}`, ...(withSwaps ? swapToward(project, placed, rule.best) : {}) };
}

/** A valid swap with a room sitting in one of `zones` on the same floor. */
function swapToward(project: Project, placed: Placed, zones: Compass8[]): { swap?: VastuSwap } {
  for (const zone of zones)
    for (const other of placed.floor.rooms) {
      if (other.id === placed.room.id || roomZone(project, placed.floor.id, other) !== zone) continue;
      if (other.kind === "bathroom" || placed.room.kind === "bathroom") continue;
      if (swapRoomUses(project, placed.floor.id, placed.room.id, other.id).ok)
        return { swap: { floorId: placed.floor.id, sourceId: placed.room.id, targetId: other.id, label: `Swap with ${other.name}` } };
    }
  return {};
}

/** Items of a kind in a room (its explicit or automatic furniture), with the way their backs face. */
function backs(project: Project, test: (catalogId: string) => boolean, rooms: Placed[]): Compass8[] {
  return rooms.flatMap(({ floor, room }) =>
    resolveFurniture(room, roomWalls(project, floor.id))
      .filter((i) => test(i.catalogId))
      .map((i) => nearestCompass(trueBearing(project.plot, i.rotation))),
  );
}

/**
 * The Vastu report: every rule and a score out of 100 (rules that don't apply
 * are left out). Null until the homeowner has said which way the home faces.
 * `withSwaps` also looks for swap fixes (slower; for the open card).
 */
export function vastuReport(project: Project, { withSwaps = false } = {}): VastuReport | null {
  const facing = homeFacing(project);
  if (!facing) return null;
  const rules: VastuRule[] = [];
  const entrance: VastuStatus = (["north", "east", "northeast"] as Compass8[]).includes(facing)
    ? "pass"
    : facing === "northwest" || facing === "southeast"
      ? "partial"
      : "fail";
  rules.push({
    id: "entrance",
    label: "Main door",
    weight: 3,
    status: entrance,
    tip:
      entrance === "pass"
        ? `The main door faces ${COMPASS_LABEL[facing].toLowerCase()}: a welcoming direction.`
        : `The main door faces ${COMPASS_LABEL[facing].toLowerCase()}. Vastu prefers north, east or north-east.`,
  });
  const kitchen = biggest(project, (r) => r.kind === "kitchen");
  rules.push(
    placement(project, kitchen, { id: "kitchen", label: "Kitchen", weight: 3, best: ["southeast"], also: ["northwest"], good: "The fire corner." }, withSwaps),
  );
  const named = biggest(project, (r) => r.kind === "bedroom" && /master|main/i.test(r.name));
  const mainBedroom = named ?? biggest(project, (r) => r.kind === "bedroom");
  rules.push(
    placement(
      project,
      mainBedroom,
      { id: "main-bedroom", label: "Main bedroom", weight: 3, best: ["southwest"], also: ["south", "west"], good: "Steady and restful." },
      withSwaps,
    ),
  );
  rules.push(
    placement(
      project,
      biggest(project, (r) => POOJA.test(r.name)),
      {
        id: "pooja",
        label: "Pooja room",
        weight: 2,
        best: ["northeast"],
        also: ["east", "north"],
        good: "The most sacred corner.",
        missing: "A small pooja room is traditionally in the north-east.",
      },
      withSwaps,
    ),
  );
  // Bathrooms: never in the north-east or the centre.
  const baths = project.floors.flatMap((floor) => floor.rooms.filter((r) => r.kind === "bathroom").map((room) => ({ floor, room })));
  const badBath = baths.find((b) => ["northeast", "centre"].includes(roomZone(project, b.floor.id, b.room)));
  rules.push({
    id: "bathrooms",
    label: "Bathrooms",
    weight: 2,
    status: !baths.length ? "na" : badBath ? "fail" : "pass",
    tip: badBath
      ? `${badBath.room.name} is in the ${zoneName(roomZone(project, badBath.floor.id, badBath.room))}. Vastu keeps the north-east and the centre free of bathrooms.`
      : "No bathroom in the north-east or the centre.",
  });
  rules.push(
    placement(
      project,
      biggest(project, (r) => r.kind === "living"),
      { id: "living", label: "Living room", weight: 1, best: ["north", "east", "northeast"], also: ["northwest", "southeast"], good: "Bright and welcoming." },
      withSwaps,
    ),
  );
  // Stairs: south, west or south-west of the ground floor.
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const stairs = project.verticalSpaces.find((v) => v.kind === "stairs" && ground && v.floorIds.includes(ground.id));
  if (stairs && ground) {
    const b = stairs.bounds;
    const zone = pointZone(project, ground.footprint, b.x + b.w / 2, b.z + b.d / 2);
    const good: Compass8[] = ["south", "west", "southwest"];
    const status: VastuStatus = zone !== "centre" && good.includes(zone) ? "pass" : zone === "centre" || zone === "northeast" ? "fail" : "partial";
    rules.push({
      id: "stairs",
      label: "Stairs",
      weight: 1,
      status,
      tip: status === "pass" ? `The stairs are in the ${zoneName(zone)}, as Vastu suggests.` : `The stairs are in the ${zoneName(zone)}. Vastu prefers the south, west or south-west.`,
    });
  } else rules.push({ id: "stairs", label: "Stairs", weight: 1, status: "na", tip: "" });
  // The centre (Brahmasthan) stays open: no kitchen, bathroom or stairs there.
  const heavy = project.floors
    .flatMap((floor) => floor.rooms.filter((r) => r.kind === "kitchen" || r.kind === "bathroom").map((room) => ({ floor, room })))
    .find((p) => roomZone(project, p.floor.id, p.room) === "centre");
  const stairsCentre = stairs && ground && pointZone(project, ground.footprint, stairs.bounds.x + stairs.bounds.w / 2, stairs.bounds.z + stairs.bounds.d / 2) === "centre";
  rules.push({
    id: "centre",
    label: "Centre of the home",
    weight: 2,
    status: heavy || stairsCentre ? "fail" : "pass",
    tip: heavy
      ? `${heavy.room.name} sits in the centre. Vastu keeps the centre (Brahmasthan) open.`
      : stairsCentre
        ? "The stairs sit in the centre. Vastu keeps the centre (Brahmasthan) open."
        : "The centre of the home (Brahmasthan) is open.",
  });
  rules.push(
    placement(
      project,
      biggest(project, (r) => r.kind === "bedroom" && /kid|child/i.test(r.name)),
      { id: "kids", label: "Children's room", weight: 1, best: ["west", "northwest"], good: "Lively and bright." },
      withSwaps,
    ),
  );
  rules.push(
    placement(
      project,
      biggest(project, (r) => r.kind === "bedroom" && /guest/i.test(r.name)),
      { id: "guest", label: "Guest room", weight: 1, best: ["northwest"], good: "Where guests feel at home." },
      withSwaps,
    ),
  );
  // Bed heads toward the south or east (the headboard is the bed's back).
  const bedrooms = project.floors.flatMap((floor) => floor.rooms.filter((r) => r.kind === "bedroom").map((room) => ({ floor, room })));
  const heads = backs(project, (id) => id.startsWith("bed-"), bedrooms);
  const restful = heads.filter((h) => h === "south" || h === "east" || h === "southeast").length;
  const north = heads.some((h) => h === "north");
  rules.push({
    id: "bed",
    label: "Bed heads",
    weight: 1,
    status: !heads.length ? "na" : restful === heads.length ? "pass" : north ? "fail" : "partial",
    tip:
      restful === heads.length
        ? "Beds have their heads to the south or east, for restful sleep."
        : north
          ? "A bed's head points north. Vastu suggests south or east."
          : "Some beds could turn their heads to the south or east.",
  });
  // Cooking facing east: the cook faces the stove's back wall.
  const kitchens = project.floors.flatMap((floor) => floor.rooms.filter((r) => r.kind === "kitchen").map((room) => ({ floor, room })));
  const stoves = backs(project, (id) => id === "kitchen-stove", kitchens);
  const cook = stoves[0];
  rules.push({
    id: "cooking",
    label: "Cooking direction",
    weight: 1,
    status: !cook ? "na" : cook === "east" ? "pass" : cook === "north" || cook === "northeast" || cook === "southeast" ? "partial" : "fail",
    tip: !cook ? "" : cook === "east" ? "The cook faces east." : `The cook faces ${COMPASS_LABEL[cook].toLowerCase()}. Vastu suggests facing east.`,
  });
  const counted = rules.filter((r) => r.status !== "na");
  const total = counted.reduce((s, r) => s + r.weight, 0);
  const got = counted.reduce((s, r) => s + r.weight * (r.status === "pass" ? 1 : r.status === "partial" ? 0.5 : 0), 0);
  return { score: total ? Math.round((100 * got) / total) : 0, rules };
}
