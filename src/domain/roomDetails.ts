// Room furnishing façade shared by the plan and 3D views: a room's explicit
// furniture when it has a `furniture` list, nothing when furnishing is "none",
// otherwise the automatic layout (byte-identical to the original recipes).
import { autoFurnishing, furnitureParts } from "./furniture";
import type { Room, Wall } from "./types";
import type { RoomDetail } from "./details";
export { DETAIL_MATERIALS, roomDoorApproaches } from "./details";
export type { DetailMaterial, RoomDetail } from "./details";
export type RoomFloorFinish = "wood" | "tile" | "stone";

export function roomFloorFinish(room: Room): RoomFloorFinish {
  if (room.floorFinish && room.floorFinish !== "auto") return room.floorFinish;
  return room.kind === "bedroom" || room.kind === "living"
    ? "wood"
    : room.kind === "bathroom" ||
        room.kind === "kitchen" ||
        room.kind === "utility"
      ? "tile"
      : "stone";
}

/** Shared, deterministic, centimetre-scale furniture for the plan and 3D views. */
export function roomDetails(
  room: Room,
  walls: readonly Wall[] = [],
): RoomDetail[] {
  if (room.furniture)
    return room.furniture.flatMap((item) => furnitureParts(room, item));
  if (room.furnishing === "none") return [];
  return autoFurnishing(room, walls).parts;
}
