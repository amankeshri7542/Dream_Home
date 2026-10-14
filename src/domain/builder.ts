import {
  defaultRoomUnit,
  findRoomPosition,
  getLimits,
  updateRoom,
} from "./model";
import { finalizeEdit } from "./edit";
import { allocateId, componentIds, sameRect, snap } from "./geometry";
import { furnitureIdSeed, rotateLayout } from "./furniture";
import type { EditResult, Floor, Project, Room, RoomKind } from "./types";
export { moveRoomSmart, swapRoomUses } from "./model";
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
  | "guest"
  | "shop";
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
  {
    id: "shop",
    label: "Shop",
    kind: "shop",
    description: "An open commercial space.",
    width: 400,
    depth: 400,
  },
];

const replaceFloor = (project: Project, floor: Floor): Project => ({
  ...project,
  floors: project.floors.map((f) => (f.id === floor.id ? floor : f)),
});
function insertRoom(
  project: Project,
  floorId: string,
  room: Omit<Room, "bounds">,
  dimensions: { w: number; d: number },
  position?: { x: number; z: number },
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  if (floor.rooms.length >= getLimits().roomsPerFloor)
    return { ok: false, error: "This floor already has the maximum 48 rooms." };
  const bounds = position
    ? { x: snap(position.x), z: snap(position.z), ...dimensions }
    : findRoomPosition(
        project,
        floorId,
        dimensions.w,
        dimensions.d,
        room.unitId,
      );
  if (!bounds)
    return {
      ok: false,
      error:
        "There is no free space for this room in the selected unit. Try a smaller size or enlarge its area.",
    };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      rooms: [...floor.rooms, { ...room, bounds }],
    }),
  );
}
export function addCatalogRoom(
  project: Project,
  floorId: string,
  catalogId: string,
  size: RoomSize,
  positionOrUnit?: { x: number; z: number } | string | null,
  unitId?: string | null,
): EditResult {
  const item = ROOM_CATALOG.find((r) => r.id === catalogId),
    scale =
      size === "small"
        ? 0.8
        : size === "regular"
          ? 1
          : size === "large"
            ? 1.2
            : undefined;
  if (!item || scale === undefined)
    return { ok: false, error: "Choose a valid room and size." };
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  const position =
    typeof positionOrUnit === "object" && positionOrUnit !== null
      ? positionOrUnit
      : undefined;
  const requestedUnit =
    typeof positionOrUnit === "string" || positionOrUnit === null
      ? positionOrUnit
      : unitId;
  const owner =
    requestedUnit === undefined ? defaultRoomUnit(floor) : requestedUnit;
  return insertRoom(
    project,
    floorId,
    {
      id: allocateId(`room-${item.id}`, componentIds(project)),
      name: item.label,
      kind: item.kind,
      unitId: owner,
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
  const ids = componentIds(project),
    id = allocateId(`room-${source.kind}`, ids);
  return insertRoom(
    project,
    floorId,
    {
      ...source,
      id,
      name: `${source.name.slice(0, 75)} copy`,
      kind: source.kind,
      unitId: source.unitId,
      // A copied room keeps its furniture and finishes, with fresh item ids.
      ...(source.furniture
        ? {
            furniture: source.furniture.map((item) => ({
              ...item,
              id: allocateId(furnitureIdSeed(id, item.catalogId), ids),
            })),
          }
        : {}),
    },
    { w: source.bounds.w, d: source.bounds.d },
  );
}
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
    // Explicit furniture turns with the room.
    ...(room.furniture ? { furniture: rotateLayout(room, room.furniture) } : {}),
  });
}
export function swapRoomPositions(
  project: Project,
  floorId: string,
  sourceId: string,
  targetId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    a = floor?.rooms.find((r) => r.id === sourceId),
    b = floor?.rooms.find((r) => r.id === targetId);
  if (!floor || !a || !b) return { ok: false, error: "Room not found." };
  if (a.unitId !== b.unitId)
    return {
      ok: false,
      error: "Physical position swaps must stay within the same unit.",
    };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) =>
        r.id === a.id
          ? { ...r, bounds: { ...r.bounds, x: b.bounds.x, z: b.bounds.z } }
          : r.id === b.id
            ? { ...r, bounds: { ...r.bounds, x: a.bounds.x, z: a.bounds.z } }
            : r,
      ),
    }),
  );
}
export function resizeBuilding(
  project: Project,
  floorId: string,
  size: { w: number; d: number },
): EditResult {
  if (!project.floors.some((f) => f.id === floorId))
    return { ok: false, error: "Floor not found." };
  return finalizeEdit(project, {
    ...project,
    floors: project.floors.map((f) => {
      const footprint = { ...f.footprint, w: snap(size.w), d: snap(size.d) };
      return {
        ...f,
        footprint,
        unitAreas: f.unitAreas.map((a) =>
          sameRect(a.bounds, f.footprint)
            ? { ...a, bounds: { ...footprint } }
            : a,
        ),
      };
    }),
  });
}

/**
 * Grows the building outline into the plot's free space (inside the sketch
 * margin), keeping every room in place. Used by "Grow house" one-tap fixes.
 */
export function growHouse(project: Project, floorId: string): EditResult {
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const { plot } = project;
  const { x, z, w, d } = floor.footprint;
  const southBalcony = Math.max(
    0,
    ...project.floors.map((f) =>
      Math.max(0, ...f.balconies.filter((b) => b.edge === "south").map((b) => b.depth)),
    ),
  );
  const eastBalcony = Math.max(
    0,
    ...project.floors.map((f) =>
      Math.max(0, ...f.balconies.filter((b) => b.edge === "east").map((b) => b.depth)),
    ),
  );
  const maxW = Math.floor((plot.width - plot.setback - x - eastBalcony) / 10) * 10;
  const maxD = Math.floor((plot.depth - plot.setback - z - southBalcony) / 10) * 10;
  if (maxW <= w && maxD <= d)
    return {
      ok: false,
      error: "The house already fills the plot. Set a room aside or try a smaller size.",
    };
  return resizeBuilding(project, floor.id, { w: Math.max(w, maxW), d: Math.max(d, maxD) });
}
