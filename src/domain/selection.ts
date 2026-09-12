import { balconyBounds } from "./model";
import type { Floor, Project, Rect } from "./types";

export type PlanItem = {
  id: string;
  name: string;
  kind: "room" | "balcony" | "courtyard" | "stairs";
  bounds: Rect;
};

export function planItems(project: Project, floor: Floor): PlanItem[] {
  return [
    ...floor.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      kind: "room" as const,
      bounds: room.bounds,
    })),
    ...floor.balconies.map((balcony, index) => ({
      id: balcony.id,
      name:
        floor.elevation > 0 ? `Balcony ${index + 1}` : `Veranda ${index + 1}`,
      kind: "balcony" as const,
      bounds: balconyBounds(floor, balcony),
    })),
    ...project.verticalSpaces
      .filter((space) => space.floorIds.includes(floor.id))
      .map((space) => ({
        id: space.id,
        name: space.kind === "courtyard" ? "Courtyard" : "Stairs",
        kind: space.kind,
        bounds: space.bounds,
      })),
  ];
}

export function selectionFloor(
  project: Project,
  id: string | null,
  current: Floor,
): Floor | undefined {
  if (!id) return undefined;
  if (planItems(project, current).some((item) => item.id === id))
    return current;
  return project.floors.find((floor) =>
    planItems(project, floor).some((item) => item.id === id),
  );
}
