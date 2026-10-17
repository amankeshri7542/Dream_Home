// A reading of a builder's plan → a real home (pure). The building is sized
// from the drawing's own dimensions when it gives them (else from the photo's
// proportions, fitted to the plot) and sits inside the plot's setbacks, away
// from the road. Rooms snap to the 10 cm grid, overlaps shrink to the shared
// edge, slivers go, names are plain ("Bedroom 2", "Pooja room"), and the
// result goes through the same validation as any edit. If a room still won't
// fit it is left out and named, so the homeowner can add it back.
import { createBlueprint } from "../domain/blueprints";
import { finalizeEdit } from "../domain/edit";
import type { EdgeSide, Project, Rect, Room, RoomKind } from "../domain/types";
import { sanitizeReading, type PlanReading, type ReadingKind, type ReadingRoom } from "./reading";

export type PlotChoice = { widthCm: number; depthCm: number; road: EdgeSide };
export type PlanFromReading = {
  project: Project;
  /** Rooms the reading wasn't sure of: dashed on the plan, "Check this one". */
  unsure: string[];
  /** Where the photo lies on the plan (cm), so the drawing sits under its rooms. */
  photo: Rect;
  /** Plain sentences about anything changed or left out. */
  notes: string[];
};

const SETBACK = 60;
const MIN_SIDE = 120;
const MIN_HOUSE = 400;
const UNSURE = 0.6;
const CM: Record<"ft" | "m", number> = { ft: 30.48, m: 100 };
const snap = (v: number) => Math.round(v / 10) * 10;
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z));

/** The house's size in cm: from the drawing's dimensions, else its proportions fitted to the plot. */
function houseSize(reading: PlanReading, room: { w: number; d: number }, imageAspect: number): { w: number; d: number; scaled: boolean } {
  let w: number, d: number;
  if (reading.units !== "unknown" && reading.outline.w > 0 && reading.outline.h > 0) {
    w = reading.outline.w * CM[reading.units];
    d = reading.outline.h * CM[reading.units];
  } else {
    // Without dimensions, keep the drawing's shape and leave a little garden around it.
    const aspect = Math.max(0.2, Math.min(5, (imageAspect * reading.outlineBox.w) / reading.outlineBox.h));
    w = Math.min(room.w, room.d * aspect) * 0.92;
    d = w / aspect;
  }
  const fit = Math.min(1, room.w / w, room.d / d);
  return { w: Math.max(MIN_HOUSE, Math.floor((w * fit) / 10) * 10), d: Math.max(MIN_HOUSE, Math.floor((d * fit) / 10) * 10), scaled: fit < 0.98 };
}

/** The house's spot: centred across, at the back (away from the road). */
function place(size: { w: number; d: number }, plot: PlotChoice): Rect {
  const W = plot.widthCm,
    D = plot.depthCm;
  const across = (span: number, length: number) => snap(SETBACK + (span - 2 * SETBACK - length) / 2);
  const x = plot.road === "east" ? SETBACK : plot.road === "west" ? W - SETBACK - size.w : across(W, size.w);
  const z = plot.road === "south" ? SETBACK : plot.road === "north" ? D - SETBACK - size.d : across(D, size.d);
  return { x: snap(x), z: snap(z), w: size.w, d: size.d };
}

/** Cuts `room` back to the shared edge with `other`, from the side that loses least. */
function shrinkAway(room: Rect, other: Rect): Rect | null {
  if (!overlap(room, other)) return room;
  const options: Rect[] = [
    { ...room, w: other.x - room.x }, // keep the left part
    { ...room, x: other.x + other.w, w: room.x + room.w - (other.x + other.w) }, // keep the right part
    { ...room, d: other.z - room.z }, // keep the top part
    { ...room, z: other.z + other.d, d: room.z + room.d - (other.z + other.d) }, // keep the bottom part
  ].filter((r) => r.w >= MIN_SIDE && r.d >= MIN_SIDE);
  return options.sort((a, b) => b.w * b.d - a.w * a.d)[0] ?? null;
}

const KIND: Record<Exclude<ReadingKind, "open" | "stairs">, RoomKind> = {
  living: "living",
  kitchen: "kitchen",
  bedroom: "bedroom",
  bathroom: "bathroom",
  dining: "dining",
  pooja: "utility",
  utility: "utility",
};

/** Plain names, numbered when there's more than one ("Bedroom 2"). */
function namer() {
  const counts = new Map<string, number>();
  let beds = 0;
  const next = (base: string) => {
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  };
  return (r: ReadingRoom): string => {
    const label = r.label.toLowerCase();
    if (r.kind === "pooja") return next("Pooja room");
    if (r.kind === "bedroom") {
      if (/master|main|m\.? ?b/.test(label)) return next("Main bedroom");
      if (/kid|child/.test(label)) return next("Kids' room");
      if (/guest/.test(label)) return next("Guest room");
      return `Bedroom ${++beds}`;
    }
    if (r.kind === "utility") return next(/study|office/.test(label) ? "Study" : /wash|laundry|utility/.test(label) ? "Utility" : "Store");
    return next({ living: "Living room", kitchen: "Kitchen", bathroom: "Bathroom", dining: "Dining" }[r.kind as "living"] ?? "Room");
  };
}

/**
 * The home a reading describes on this plot, or null when even an empty
 * house doesn't fit (a plot too small for a 4 m house).
 */
export function planFromReading(raw: PlanReading, plot: PlotChoice, imageAspect = 1): PlanFromReading | null {
  // Cleaned again here (labels decide types, numbers in range), whoever made it.
  const reading = sanitizeReading(raw);
  const base = createBlueprint({
    widthCm: plot.widthCm,
    depthCm: plot.depthCm,
    marginCm: SETBACK,
    road: plot.road,
    kind: "home",
    flavor: "bungalow",
    floors: 1,
    bedrooms: 1,
    unitsPerFloor: 1,
    bedroomsPerUnit: 1,
    shopsPerFloor: 1,
  });
  if (!base.ok) return null;
  const notes: string[] = [];
  const room = { w: plot.widthCm - 2 * SETBACK, d: plot.depthCm - 2 * SETBACK };
  const size = houseSize(reading, room, imageAspect);
  if (size.w > room.w || size.d > room.d) return null;
  if (size.scaled) notes.push("The drawing is bigger than this plot, so it was scaled to fit. Check the plot size.");
  const fp = place(size, plot);

  // Rooms in cm on the footprint, the surest and biggest first.
  const name = namer();
  const wanted = reading.rooms
    .filter((r) => r.kind !== "open" && r.kind !== "stairs")
    .map((r) => {
      const x0 = snap(fp.x + r.x * fp.w),
        x1 = snap(fp.x + (r.x + r.w) * fp.w),
        z0 = snap(fp.z + r.y * fp.d),
        z1 = snap(fp.z + (r.y + r.h) * fp.d);
      const clampX = (v: number) => Math.min(fp.x + fp.w, Math.max(fp.x, v)),
        clampZ = (v: number) => Math.min(fp.z + fp.d, Math.max(fp.z, v));
      const bounds = { x: clampX(x0), z: clampZ(z0), w: clampX(x1) - clampX(x0), d: clampZ(z1) - clampZ(z0) };
      return { r, bounds };
    })
    .sort((a, b) => b.r.confidence * b.bounds.w * b.bounds.d - a.r.confidence * a.bounds.w * a.bounds.d);
  const placed: { r: ReadingRoom; bounds: Rect }[] = [];
  const dropped: string[] = [];
  for (const item of wanted) {
    let bounds: Rect | null = item.bounds.w >= MIN_SIDE && item.bounds.d >= MIN_SIDE ? item.bounds : null;
    for (const other of placed) if (bounds) bounds = shrinkAway(bounds, other.bounds);
    if (bounds) placed.push({ r: item.r, bounds });
    else if (item.r.label) dropped.push(item.r.label);
  }
  // Names in reading order (top-left first), so Bedroom 1 comes before Bedroom 2.
  placed.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const rooms: Room[] = placed.map((p, i) => ({
    id: `plan-room-${i + 1}`,
    name: name(p.r),
    kind: KIND[p.r.kind as keyof typeof KIND],
    bounds: p.bounds,
    unitId: base.project.units[0]?.id ?? null,
  }));
  const confidence = new Map(placed.map((p, i) => [`plan-room-${i + 1}`, p.r.confidence]));
  if (dropped.length) notes.push(`${dropped.slice(0, 3).join(", ")} ${dropped.length === 1 ? "was" : "were"} too small or overlapped, so left out. Add ${dropped.length === 1 ? "it" : "them"} back if you like.`);
  if (reading.stairs.length || reading.rooms.some((r) => r.kind === "stairs"))
    notes.push("Stairs come with a second floor: add one when you're ready.");

  const floor = base.project.floors[0];
  const build = (list: Room[]): Project => ({
    ...base.project,
    name: "Home from my plan",
    floors: [
      {
        ...floor,
        footprint: fp,
        rooms: list,
        balconies: [],
        unitAreas: floor.unitAreas.map((a) => ({ ...a, bounds: fp })),
        openings: undefined,
      },
    ],
    verticalSpaces: [],
  });
  // Validate like any edit; a room that still breaks a rule is left out and named.
  let list = rooms;
  for (let tries = 0; tries <= rooms.length; tries++) {
    const result = finalizeEdit(base.project, build(list));
    if (result.ok) {
      const kept = new Set(list.map((r) => r.id));
      const outside = rooms.filter((r) => !kept.has(r.id)).map((r) => r.name);
      if (outside.length) notes.push(`${outside.join(", ")} didn't fit the rules, so ${outside.length === 1 ? "it was" : "they were"} left out.`);
      const imgW = fp.w / reading.outlineBox.w,
        imgH = fp.d / reading.outlineBox.h;
      return {
        project: result.project,
        unsure: list.filter((r) => (confidence.get(r.id) ?? 1) < UNSURE).map((r) => r.id),
        photo: { x: fp.x - reading.outlineBox.x * imgW, z: fp.z - reading.outlineBox.y * imgH, w: imgW, d: imgH },
        notes,
      };
    }
    const blamed = new Set(
      (result.issues ?? []).flatMap((i) => [i.source, ...i.blockers]).filter((c) => c?.kind === "room").map((c) => c!.id),
    );
    const next = list.filter((r) => !blamed.has(r.id));
    // Nothing to blame: drop the least sure room and try again.
    list = next.length < list.length ? next : list.slice(0, -1);
    if (!list.length && !rooms.length) break;
  }
  return null;
}
