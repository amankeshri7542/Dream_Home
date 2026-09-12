import { updateRoom, validateProject } from "./model";
import type { EditResult, Floor, Project, Rect, Room, RoomKind } from "./types";

export type RoomSize = "small" | "regular" | "large";
export type CatalogId =
  | "bedroom"
  | "living"
  | "kitchen"
  | "bathroom"
  | "dining"
  | "utility"
  | "study"
  | "prayer"
  | "guest";
export const ROOM_CATALOG: ReadonlyArray<{
  id: CatalogId;
  label: string;
  kind: RoomKind;
  description: string;
  width: number;
  depth: number;
}> = [
  {
    id: "bedroom",
    label: "Bedroom",
    kind: "bedroom",
    description: "A private space to rest.",
    width: 320,
    depth: 360,
  },
  {
    id: "living",
    label: "Living room",
    kind: "living",
    description: "An everyday gathering space.",
    width: 420,
    depth: 360,
  },
  {
    id: "kitchen",
    label: "Kitchen",
    kind: "kitchen",
    description: "Space for cooking and everyday meals.",
    width: 300,
    depth: 280,
  },
  {
    id: "bathroom",
    label: "Bathroom",
    kind: "bathroom",
    description: "A bathroom for this floor.",
    width: 180,
    depth: 240,
  },
  {
    id: "dining",
    label: "Dining room",
    kind: "dining",
    description: "A dedicated place to share meals.",
    width: 300,
    depth: 300,
  },
  {
    id: "utility",
    label: "Utility room",
    kind: "utility",
    description: "Space for household tasks and storage.",
    width: 240,
    depth: 240,
  },
  {
    id: "study",
    label: "Study / office",
    kind: "utility",
    description: "A quiet place to work or study.",
    width: 280,
    depth: 300,
  },
  {
    id: "prayer",
    label: "Prayer room",
    kind: "utility",
    description: "A peaceful space for prayer.",
    width: 180,
    depth: 180,
  },
  {
    id: "guest",
    label: "Guest room",
    kind: "bedroom",
    description: "A welcoming bedroom for visitors.",
    width: 300,
    depth: 340,
  },
];

const snap = (n: number) => Math.round(n / 10) * 10;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const contains = (a: Rect, b: Rect) =>
  b.x >= a.x && b.z >= a.z && b.x + b.w <= a.x + a.w && b.z + b.d <= a.z + a.d;
const checked = (project: Project): EditResult => {
  const errors = validateProject(project);
  return errors.length
    ? { ok: false, error: errors[0] }
    : { ok: true, project };
};
const replaceFloor = (project: Project, floor: Floor): Project => ({
  ...project,
  floors: project.floors.map((f) => (f.id === floor.id ? floor : f)),
});
function nextRoomId(project: Project, seed: string): string {
  const used = new Set(
    project.floors.flatMap((f) => [
      f.id,
      ...f.rooms.map((r) => r.id),
      ...f.voids.map((v) => v.id),
    ]),
  );
  let id = seed,
    suffix = 2;
  while (used.has(id)) id = `${seed}-${suffix++}`;
  return id;
}

/** At a first available grid position, each axis is against the plate or an
 * obstacle's far edge. Testing those edges is complete for axis-aligned rooms
 * and bounded by component count, independent of a plot's area. */
function freePosition(
  floor: Floor,
  w: number,
  d: number,
): { x: number; z: number } | undefined {
  const obstacles = [...floor.rooms, ...floor.voids].map((r) => r.bounds);
  const xs = [
    ...new Set([floor.footprint.x, ...obstacles.map((r) => r.x + r.w)]),
  ].sort((a, b) => a - b);
  const zs = [
    ...new Set([floor.footprint.z, ...obstacles.map((r) => r.z + r.d)]),
  ].sort((a, b) => a - b);
  for (const z of zs)
    for (const x of xs) {
      const candidate = { x, z, w, d };
      if (
        contains(floor.footprint, candidate) &&
        !obstacles.some((r) => overlaps(r, candidate))
      )
        return { x, z };
    }
  return undefined;
}

function insertRoom(
  project: Project,
  floorId: string,
  room: Omit<Room, "bounds">,
  dimensions: { w: number; d: number },
  position?: { x: number; z: number },
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  if (floor.rooms.length >= 24)
    return { ok: false, error: "This floor already has the maximum 24 rooms." };
  const target = position
    ? { x: snap(position.x), z: snap(position.z) }
    : freePosition(floor, dimensions.w, dimensions.d);
  if (!target)
    return {
      ok: false,
      error:
        "There is no free space for this room. Try a smaller size, move a room or enlarge the building.",
    };
  return checked(
    replaceFloor(project, {
      ...floor,
      rooms: [
        ...floor.rooms,
        { ...room, bounds: { ...target, ...dimensions } },
      ],
    }),
  );
}

export function addCatalogRoom(
  project: Project,
  floorId: string,
  catalogId: string,
  size: RoomSize,
  position?: { x: number; z: number },
): EditResult {
  const item = ROOM_CATALOG.find((r) => r.id === catalogId);
  const scale =
    size === "small"
      ? 0.8
      : size === "regular"
        ? 1
        : size === "large"
          ? 1.2
          : undefined;
  if (!item || scale === undefined)
    return { ok: false, error: "Choose a valid room and size." };
  return insertRoom(
    project,
    floorId,
    {
      id: nextRoomId(project, `room-${item.id}`),
      name: item.label,
      kind: item.kind,
    },
    { w: snap(item.width * scale), d: snap(item.depth * scale) },
    position,
  );
}

export function duplicateRoom(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const source = project.floors
    .find((f) => f.id === floorId)
    ?.rooms.find((r) => r.id === roomId);
  if (!source) return { ok: false, error: "Room not found." };
  return insertRoom(
    project,
    floorId,
    {
      id: nextRoomId(project, `room-${source.kind}`),
      name: `${source.name.slice(0, 75)} copy`,
      kind: source.kind,
    },
    { w: source.bounds.w, d: source.bounds.d },
  );
}

/** Rotate in place around the existing top-left origin, preserving its grid. */
export function rotateRoom(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const room = project.floors
    .find((f) => f.id === floorId)
    ?.rooms.find((r) => r.id === roomId);
  if (!room) return { ok: false, error: "Room not found." };
  return updateRoom(project, floorId, roomId, {
    bounds: { ...room.bounds, w: room.bounds.d, d: room.bounds.w },
  });
}

export function moveRoomSmart(
  project: Project,
  floorId: string,
  roomId: string,
  bounds: Rect,
): EditResult {
  const regular = updateRoom(project, floorId, roomId, { bounds });
  if (regular.ok) return regular;
  const floor = project.floors.find((f) => f.id === floorId);
  const source = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !source) return regular;
  const target = {
    x: snap(bounds.x),
    z: snap(bounds.z),
    w: snap(bounds.w),
    d: snap(bounds.d),
  };
  // A resize never turns into a swap; only position changes are eligible.
  if (
    target.w !== source.bounds.w ||
    target.d !== source.bounds.d ||
    !Object.values(target).every(Number.isFinite)
  )
    return regular;
  const center = { x: target.x + target.w / 2, z: target.z + target.d / 2 };
  const receivers = floor.rooms.filter(
    (r) =>
      r.id !== roomId &&
      center.x > r.bounds.x &&
      center.x < r.bounds.x + r.bounds.w &&
      center.z > r.bounds.z &&
      center.z < r.bounds.z + r.bounds.d,
  );
  if (receivers.length !== 1) return regular;
  const other = receivers[0];
  const swap = checked(
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) =>
        r.id === source.id
          ? {
              ...r,
              bounds: { ...r.bounds, x: other.bounds.x, z: other.bounds.z },
            }
          : r.id === other.id
            ? {
                ...r,
                bounds: { ...r.bounds, x: source.bounds.x, z: source.bounds.z },
              }
            : r,
      ),
    }),
  );
  return swap.ok ? swap : regular;
}

/** The schema keeps floorplates aligned, so building dimensions change together. */
export function resizeBuilding(
  project: Project,
  floorId: string,
  size: { w: number; d: number },
): EditResult {
  if (!project.floors.some((f) => f.id === floorId))
    return { ok: false, error: "Floor not found." };
  return checked({
    ...project,
    floors: project.floors.map((f) => ({
      ...f,
      footprint: { ...f.footprint, w: snap(size.w), d: snap(size.d) },
    })),
  });
}
