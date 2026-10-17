// Where the lamps are: one warm point per room (the brightest, most central
// lamp, pendant or sconce from the catalog `light` field), biggest rooms first.
import { floorForGeometry } from "../../domain/core";
import { furnitureBaseY, furnitureCatalogItem, resolveFurniture } from "../../domain/furniture";
import type { Project } from "../../domain/types";
import { deriveWalls } from "../../domain/walls";
import { FLOOR_SURFACE, floorBase } from "../coords";

export type Lamp = {
  roomId: string;
  /** Plot-local metres (the bulb). */
  position: [number, number, number];
  color: string;
  /** Catalog strength (1 = a floor lamp). */
  intensity: number;
};
/** Rooms on a floor get at most one lamp each, `max` in all. */
export function interiorLamps(project: Project, floorId: string, max = 8): Lamp[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const geo = floorForGeometry(project, floorId);
  const walls = deriveWalls(geo, project.plot.road);
  const y0 = floorBase(floor) + FLOOR_SURFACE;
  const rooms = [...geo.rooms].sort(
    (a, b) => b.bounds.w * b.bounds.d - a.bounds.w * a.bounds.d || a.id.localeCompare(b.id),
  );
  const out: Lamp[] = [];
  for (const room of rooms) {
    if (out.length >= max) break;
    const items = resolveFurniture(room, walls);
    const cx = room.bounds.w / 2,
      cz = room.bounds.d / 2;
    let best: { score: number; lamp: Lamp } | null = null;
    for (const item of items) {
      const light = furnitureCatalogItem(item.catalogId)?.light;
      if (!light) continue;
      const score = light.intensity * 10 - Math.hypot(item.x - cx, item.z - cz) / 100;
      if (best && best.score >= score) continue;
      const y = y0 + (furnitureBaseY(item, items) + light.y) / 100;
      best = {
        score,
        lamp: {
          roomId: room.id,
          position: [(room.bounds.x + item.x) / 100, y, (room.bounds.z + item.z) / 100],
          color: light.color,
          intensity: light.intensity,
        },
      };
    }
    if (best) out.push(best.lamp);
  }
  return out;
}
