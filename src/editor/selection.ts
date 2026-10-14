// Resolves editor selection targets against the current document.
import { planItems, type PlanItem } from "../domain/selection";
import { floorForGeometry } from "../domain/core";
import { deriveWalls } from "../domain/walls";
import { furnitureLabel, resolveFurniture } from "../domain/furniture";
import { landscapeLabel, resolveLandscape } from "../domain/landscape";
import { openingAt } from "../domain/openings";
import { openingLabel } from "../domain/openings";
import type {
  FurnitureItem,
  Floor,
  LandscapeItem,
  PlacedOpening,
  Project,
  Rect,
  Room,
  Wall,
} from "../domain/types";
import type { SelectionTarget } from "./types";

export type ResolvedSelection = {
  target: SelectionTarget;
  floor: Floor | null;
  room?: Room;
  item?: PlanItem;
  name: string;
  bounds?: Rect;
  opening?: PlacedOpening & { auto: boolean };
  wall?: Wall;
  furniture?: FurnitureItem;
  landscape?: LandscapeItem;
};

export function targetFromPlanItem(
  floorId: string,
  item: Pick<PlanItem, "id" | "kind">,
): SelectionTarget {
  if (item.kind === "room") return { kind: "room", floorId, id: item.id };
  if (item.kind === "balcony") return { kind: "balcony", floorId, id: item.id };
  return { kind: "vertical", floorId, id: item.id };
}

/** Finds the selectable item with this id, preferring `preferredFloorId`. */
export function targetForId(
  project: Project,
  id: string,
  preferredFloorId?: string | null,
): SelectionTarget | null {
  const floors = [
    ...project.floors.filter((f) => f.id === preferredFloorId),
    ...project.floors.filter((f) => f.id !== preferredFloorId),
  ];
  for (const floor of floors) {
    const item = planItems(project, floor).find((i) => i.id === id);
    if (item) return targetFromPlanItem(floor.id, item);
  }
  if (project.stagedRooms?.some((s) => s.room.id === id))
    return { kind: "staged", id };
  return null;
}

export function resolveSelection(
  project: Project,
  target: SelectionTarget | null,
): ResolvedSelection | null {
  if (!target) return null;
  if (target.kind === "staged") {
    const staged = project.stagedRooms?.find((s) => s.room.id === target.id);
    return staged
      ? { target, floor: null, room: staged.room, name: staged.room.name }
      : null;
  }
  if (target.kind === "landscape") {
    const item = resolveLandscape(project).find((l) => l.id === target.id);
    return item
      ? { target, floor: null, name: landscapeLabel(item.kind), landscape: item }
      : null;
  }
  const floor = project.floors.find((f) => f.id === target.floorId);
  if (!floor) return null;
  if (target.kind === "opening") {
    const found = openingAt(project, floor.id, target.id);
    return found
      ? {
          target,
          floor,
          name: openingLabel(found.opening.kind),
          opening: found.opening,
          wall: found.wall,
        }
      : null;
  }
  if (target.kind === "furniture") {
    const room = floor.rooms.find((r) => r.id === target.roomId);
    if (!room) return null;
    const walls = deriveWalls(floorForGeometry(project, floor.id), project.plot.road);
    const item = resolveFurniture(room, walls).find((i) => i.id === target.id);
    return item
      ? { target, floor, room, name: furnitureLabel(item), furniture: item }
      : null;
  }
  const item = planItems(project, floor).find((i) => i.id === target.id);
  if (!item) return null;
  const room =
    target.kind === "room"
      ? floor.rooms.find((r) => r.id === target.id)
      : undefined;
  return { target, floor, room, item, name: item.name, bounds: item.bounds };
}
