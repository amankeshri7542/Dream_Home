// Room floor planes (merged per floor material, with an owners table for
// picking), structural slabs, the ground-floor foundation and void hit planes.
import { roomFloorMaterial, type FloorMaterialId } from "../../../domain/materials";
import { slabTiles } from "../../../domain/model";
import type { GeometryFloor } from "../../../domain/types";
import { FLOOR_SURFACE, SLAB_DEPTH, SLAB_TOP } from "../../coords";
import { rgb, type Buckets, type QuadBuilder, type V3 } from "./QuadBuilder";

export const ownerKey = (kind: "room" | "balcony" | "vertical" | "opening", id: string) =>
  `${kind}:${id}`;
export function parseOwner(key: string | null) {
  if (!key) return null;
  const i = key.indexOf(":");
  return { kind: key.slice(0, i) as "room" | "balcony" | "vertical" | "opening", id: key.slice(i + 1) };
}

/** Horizontal quad facing up. */
export function upQuad(b: QuadBuilder, x0: number, z0: number, x1: number, z1: number, y: number) {
  const a: V3 = [x0, y, z0],
    bb: V3 = [x1, y, z0],
    c: V3 = [x1, y, z1],
    d: V3 = [x0, y, z1];
  b.quadFacing(a, bb, c, d, [0, 1, 0]);
}

/** Circulation (hall) floor under everything that is not a room. */
export function emitHallFloor(floor: GeometryFloor, base: number, holes: boolean, buckets: Buckets<string>) {
  const b = buckets.get("floor:limestone");
  b.setOwner(null);
  for (const t of slabTiles(floor, holes))
    upQuad(b, t.x / 100, t.z / 100, (t.x + t.w) / 100, (t.z + t.d) / 100, base + FLOOR_SURFACE - 0.004);
}

/** One quad per room at the finish level, bucketed by floor material id. */
export function emitRoomFloors(floor: GeometryFloor, base: number, buckets: Buckets<string>) {
  const used = new Set<FloorMaterialId>();
  const y = base + FLOOR_SURFACE;
  for (const room of floor.rooms) {
    const id = roomFloorMaterial(room);
    used.add(id);
    const b = buckets.get(`floor:${id}`);
    b.setOwner(ownerKey("room", room.id));
    const r = room.bounds;
    upQuad(b, r.x / 100, r.z / 100, (r.x + r.w) / 100, (r.z + r.d) / 100, y);
  }
  return used;
}

/** Ground floor foundation (stage ≥ 1) or an upper slab (stage ≥ 4). */
export function emitSlab(floor: GeometryFloor, base: number, ground: boolean, buckets: Buckets<string>) {
  const tiles = slabTiles(floor, !ground);
  const b = buckets.get("slab");
  const color = rgb(ground ? "#d9d4c8" : "#e4dfd4");
  for (const t of tiles) {
    const bottom = ground ? -0.1 : base - SLAB_DEPTH;
    b.box([t.x / 100, bottom, t.z / 100], [(t.x + t.w) / 100, base + SLAB_TOP, (t.z + t.d) / 100], color);
  }
}

/** Invisible pick planes over stairs/courtyard voids. */
export function emitVoidHits(floor: GeometryFloor, base: number, buckets: Buckets<string>) {
  const b = buckets.get("hit");
  for (const v of floor.voids) {
    b.setOwner(ownerKey("vertical", v.id));
    const r = v.bounds;
    upQuad(b, r.x / 100, r.z / 100, (r.x + r.w) / 100, (r.z + r.d) / 100, base + FLOOR_SURFACE + 0.01);
  }
  b.setOwner(null);
}
