import {
  defaultRoomUnit,
  findRoomPosition,
  getLimits,
} from "./model";
import { finalizeEdit } from "./edit";
import { snap } from "./geometry";
import { rotateLayout } from "./furniture";
import type { EditResult, Project, Rect, Room } from "./types";


export function setAsideRoom(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const room = project.floors
    .find((floor) => floor.id === floorId)
    ?.rooms.find((item) => item.id === roomId);
  if (!room) return { ok: false, error: "Room not found." };
  if ((project.stagedRooms?.length ?? 0) >= getLimits().stagedRooms)
    return {
      ok: false,
      error:
        "Your tray holds 48 rooms. Place a room back before setting another aside.",
    };
  return finalizeEdit(project, {
    ...project,
    floors: project.floors.map((floor) =>
      floor.id === floorId
        ? { ...floor, rooms: floor.rooms.filter((item) => item.id !== roomId) }
        : floor,
    ),
    stagedRooms: [
      ...(project.stagedRooms ?? []),
      { room: { ...room, bounds: { ...room.bounds } }, sourceFloorId: floorId },
    ],
  });
}

export type RestoreRoomOptions = {
  position?: { x: number; z: number };
  unitId?: string | null;
};

export function restoreStagedRoom(
  project: Project,
  roomId: string,
  floorId: string,
  options: RestoreRoomOptions = {},
): EditResult {
  const entry = project.stagedRooms?.find((item) => item.room.id === roomId);
  const floor = project.floors.find((item) => item.id === floorId);
  if (!entry || !floor)
    return { ok: false, error: "Choose a room from the tray and a floor." };
  const room = entry.room;
  // A removed floor may also remove its old unit. The room itself stays in the tray.
  const unitId =
    options.unitId !== undefined
      ? options.unitId
      : room.unitId !== null &&
          floor.unitAreas.some((area) => area.unitId === room.unitId)
        ? room.unitId
        : defaultRoomUnit(floor);
  const insert = (bounds: Rect): EditResult =>
    finalizeEdit(project, {
      ...project,
      stagedRooms: (project.stagedRooms ?? []).filter(
        (item) => item.room.id !== roomId,
      ),
      floors: project.floors.map((item) =>
        item.id === floorId
          ? { ...item, rooms: [...item.rooms, { ...room, unitId, bounds }] }
          : item,
      ),
    });
  if (options.position)
    return insert({
      ...room.bounds,
      x: snap(options.position.x),
      z: snap(options.position.z),
    });
  const original = insert({ ...room.bounds });
  if (original.ok) return original;
  const bounds = findRoomPosition(
    project,
    floorId,
    room.bounds.w,
    room.bounds.d,
    unitId,
  );
  if (!bounds)
    return {
      ok: false,
      error: `${room.name} stays safe in the tray. Make space, resize it, or choose another floor or group.`,
    };
  return insert(bounds);
}

export type StagedRoomPatch = Partial<
  Pick<
    Room,
    "name" | "kind" | "furnishingRotation" | "floorFinish" | "furnishing"
  >
> & { width?: number; depth?: number };

export function updateStagedRoom(
  project: Project,
  roomId: string,
  patch: StagedRoomPatch,
): EditResult {
  if (!project.stagedRooms?.some((item) => item.room.id === roomId))
    return { ok: false, error: "Room not found in the tray." };
  const { width, depth, ...presentation } = patch;
  return finalizeEdit(project, {
    ...project,
    stagedRooms: project.stagedRooms.map((item) =>
      item.room.id === roomId
        ? {
            ...item,
            room: {
              ...item.room,
              ...presentation,
              bounds: {
                ...item.room.bounds,
                w: width === undefined ? item.room.bounds.w : snap(width),
                d: depth === undefined ? item.room.bounds.d : snap(depth),
              },
            },
          }
        : item,
    ),
  });
}

export function rotateStagedRoom(project: Project, roomId: string): EditResult {
  const room = project.stagedRooms?.find(
    (item) => item.room.id === roomId,
  )?.room;
  if (!room) return { ok: false, error: "Room not found in the tray." };
  return finalizeEdit(project, {
    ...project,
    stagedRooms: project.stagedRooms!.map((item) =>
      item.room.id === roomId
        ? {
            ...item,
            room: {
              ...item.room,
              bounds: { ...room.bounds, w: room.bounds.d, d: room.bounds.w },
              // Explicit furniture turns with the room.
              ...(room.furniture
                ? { furniture: rotateLayout(room, room.furniture) }
                : {}),
            },
          }
        : item,
    ),
  });
}

export function removeStagedRoom(project: Project, roomId: string): EditResult {
  if (!project.stagedRooms?.some((item) => item.room.id === roomId))
    return { ok: false, error: "Room not found in the tray." };
  return finalizeEdit(project, {
    ...project,
    stagedRooms: project.stagedRooms.filter((item) => item.room.id !== roomId),
  });
}
