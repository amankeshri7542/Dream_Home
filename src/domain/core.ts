// Small structural helpers shared by validation, walls and edit commands.
import { overlaps, rect } from "./geometry";
import type { Balcony, Floor, GeometryFloor, Project, Rect, Void } from "./types";

export const replaceFloor = (project: Project, floor: Floor): Project => ({
  ...project,
  floors: project.floors.map((f) => (f.id === floor.id ? floor : f)),
});
export function deriveFloorVoids(project: Project, floorId: string): Void[] {
  return project.verticalSpaces
    .filter((v) => v.floorIds.includes(floorId))
    .map((v) => ({ id: v.id, kind: v.kind, bounds: { ...v.bounds } }));
}
export function floorForGeometry(
  project: Project,
  floorId: string,
): GeometryFloor {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) throw new Error("Floor not found.");
  return { ...floor, voids: deriveFloorVoids(project, floorId) };
}
export function balconyBounds(
  floor: Pick<Floor, "footprint">,
  balcony: Balcony,
): Rect {
  const p = floor.footprint,
    b = balcony;
  if (b.edge === "north")
    return rect(p.x + b.offset, p.z - b.depth, b.width, b.depth);
  if (b.edge === "south")
    return rect(p.x + b.offset, p.z + p.d, b.width, b.depth);
  if (b.edge === "west")
    return rect(p.x - b.depth, p.z + b.offset, b.depth, b.width);
  return rect(p.x + p.w, p.z + b.offset, b.depth, b.width);
}
export const isAutoId = (id: string) => id.startsWith("auto:");
/** Slab pieces of a floor: its footprint minus courtyards (and stair holes). */
export function slabTiles(
  floor: GeometryFloor,
  includeStairHole: boolean,
): Rect[] {
  let tiles = [{ ...floor.footprint }];
  for (const hole of floor.voids.filter(
    (v) => v.kind === "courtyard" || includeStairHole,
  )) {
    tiles = tiles.flatMap((tile) => {
      if (!overlaps(tile, hole.bounds)) return [tile];
      const x1 = Math.max(tile.x, hole.bounds.x),
        x2 = Math.min(tile.x + tile.w, hole.bounds.x + hole.bounds.w),
        z1 = Math.max(tile.z, hole.bounds.z),
        z2 = Math.min(tile.z + tile.d, hole.bounds.z + hole.bounds.d);
      return [
        rect(tile.x, tile.z, tile.w, z1 - tile.z),
        rect(tile.x, z2, tile.w, tile.z + tile.d - z2),
        rect(tile.x, z1, x1 - tile.x, z2 - z1),
        rect(x2, z1, tile.x + tile.w - x2, z2 - z1),
      ].filter((r) => r.w > 0 && r.d > 0);
    });
  }
  return tiles;
}
