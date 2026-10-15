// Attached (en-suite) bathrooms: a bathroom whose only door opens into its
// bedroom. The link is `Room.attachedTo`; doors follow it (walls.ts), and this
// module adds one and keeps links honest as the home changes.
import { growHouse } from "./builder";
import { deriveFloorVoids } from "./core";
import { finalizeEdit } from "./edit";
import { allocateId, componentIds, contains, overlaps } from "./geometry";
import "./ensuiteRules";
import type { EditResult, Project, Rect, Room } from "./types";
import { ENSUITE_MIN_EDGE, ensuiteHost, sharedEdge } from "./walls";

/** Comfortable en-suite sizes, roomiest first (cm). */
const SIZES: { w: number; d: number }[] = [
  { w: 180, d: 240 },
  { w: 240, d: 180 },
  { w: 160, d: 210 },
  { w: 210, d: 160 },
  { w: 150, d: 180 },
  { w: 180, d: 150 },
];
const STEP = 10;

/** Free rectangles that touch the bedroom along at least a door's width. */
function besideSpots(bedroom: Rect, size: { w: number; d: number }): Rect[] {
  const out: Rect[] = [];
  const { x, z, w, d } = bedroom;
  // East and west: slide along the bedroom's depth.
  for (let zz = z - size.d + ENSUITE_MIN_EDGE; zz <= z + d - ENSUITE_MIN_EDGE; zz += STEP) {
    out.push({ x: x + w, z: zz, w: size.w, d: size.d });
    out.push({ x: x - size.w, z: zz, w: size.w, d: size.d });
  }
  // North and south: slide along the bedroom's width.
  for (let xx = x - size.w + ENSUITE_MIN_EDGE; xx <= x + w - ENSUITE_MIN_EDGE; xx += STEP) {
    out.push({ x: xx, z: z + d, w: size.w, d: size.d });
    out.push({ x: xx, z: z - size.d, w: size.w, d: size.d });
  }
  // Prefer spots that share the longest wall, then those nearest a corner.
  return out
    .filter((r) => sharedEdge(r, bedroom) >= ENSUITE_MIN_EDGE)
    .sort((a, b) => sharedEdge(b, bedroom) - sharedEdge(a, bedroom));
}

/** A strip carved from the end of a roomy bedroom: [shrunk bedroom, bathroom]. */
function carveSpots(bedroom: Rect): [Rect, Rect][] {
  const { x, z, w, d } = bedroom;
  const out: [Rect, Rect][] = [];
  const bathD = Math.min(240, d),
    bathW = Math.min(240, w);
  if (w - 180 >= 270) {
    // Take 180 cm off the east or west end; the bath sits at its north end.
    out.push([{ x, z, w: w - 180, d }, { x: x + w - 180, z, w: 180, d: bathD }]);
    out.push([{ x: x + 180, z, w: w - 180, d }, { x, z, w: 180, d: bathD }]);
  }
  if (d - 180 >= 270) {
    out.push([{ x, z, w, d: d - 180 }, { x, z: z + d - 180, w: bathW, d: 180 }]);
    out.push([{ x, z: z + 180, w, d: d - 180 }, { x, z, w: bathW, d: 180 }]);
  }
  // A compact 1.5 m bath (a common Indian 5 × 8 ft toilet) when the bedroom is snugger.
  for (const strip of [150]) {
    if (d - strip >= 250 && w >= 240) {
      out.push([{ x, z, w, d: d - strip }, { x, z: z + d - strip, w: bathW, d: strip }]);
      out.push([{ x, z: z + strip, w, d: d - strip }, { x, z, w: bathW, d: strip }]);
    }
    if (w - strip >= 250 && d >= 240) {
      out.push([{ x, z, w: w - strip, d }, { x: x + w - strip, z, w: strip, d: bathD }]);
      out.push([{ x: x + strip, z, w: w - strip, d }, { x, z, w: strip, d: bathD }]);
    }
  }
  return out;
}

/** Short enough to read on a small plan; "attached bath" is the everyday term. */
const BATH_NAME = "Attached bath";

/**
 * Adds a bathroom attached to a bedroom: beside it where there's free floor,
 * else carved from the end of a roomy bedroom, else after growing the house.
 */
export function addAttachedBathroom(
  project: Project,
  floorId: string,
  bedroomId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  const bedroom = floor?.rooms.find((r) => r.id === bedroomId);
  if (!floor || !bedroom || bedroom.kind !== "bedroom")
    return { ok: false, error: "Choose a bedroom to give its own bathroom." };
  if (floor.rooms.some((r) => ensuiteHost(floor.rooms, r)?.id === bedroom.id))
    return { ok: false, error: `${bedroom.name} already has its own bathroom.` };
  const bath = (bounds: Rect): Room => ({
    id: allocateId("room-ensuite", componentIds(project)),
    name: BATH_NAME,
    kind: "bathroom",
    bounds,
    unitId: bedroom.unitId,
    attachedTo: bedroom.id,
  });
  const tryOn = (p: Project): EditResult | null => {
    const f = p.floors.find((x) => x.id === floorId)!;
    const host = f.rooms.find((r) => r.id === bedroomId)!;
    const blockers = [...f.rooms.map((r) => r.bounds), ...deriveFloorVoids(p, floorId).map((v) => v.bounds)];
    for (const size of SIZES)
      for (const spot of besideSpots(host.bounds, size)) {
        if (!contains(f.footprint, spot) || blockers.some((b) => overlaps(b, spot))) continue;
        const result = finalizeEdit(p, {
          ...p,
          floors: p.floors.map((x) => (x.id === floorId ? { ...x, rooms: [...x.rooms, bath(spot)] } : x)),
        });
        if (result.ok) return result;
      }
    return null;
  };
  const beside = tryOn(project);
  if (beside) return { ...beside, ...(beside.ok ? { focusId: bedroomId } : {}) };
  // Carve from a roomy bedroom (at least ~11 m²).
  if (bedroom.bounds.w * bedroom.bounds.d >= 110000)
    for (const [shrunk, spot] of carveSpots(bedroom.bounds)) {
      const result = finalizeEdit(project, {
        ...project,
        floors: project.floors.map((x) =>
          x.id === floorId
            ? {
                ...x,
                rooms: [
                  ...x.rooms.map((r) => (r.id === bedroomId ? { ...r, bounds: shrunk } : r)),
                  bath(spot),
                ],
              }
            : x,
        ),
      });
      if (result.ok) return { ...result, focusId: bedroomId };
    }
  // Last resort: grow the house into the garden, then try beside again.
  const grown = growHouse(project, floorId);
  if (grown.ok) {
    const after = tryOn(grown.project);
    if (after?.ok) return { ...after, project: after.project, focusId: bedroomId };
  }
  return {
    ok: false,
    error: `There's no room beside ${bedroom.name} for a bathroom. Make the bedroom bigger, or move a neighbouring room.`,
  };
}

/** The attached bathroom of a bedroom, if it has one. */
export function ensuiteOf(rooms: readonly Room[], bedroomId: string): Room | null {
  return rooms.find((r) => ensuiteHost(rooms, r)?.id === bedroomId) ?? null;
}
