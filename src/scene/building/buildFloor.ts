// Assemble all static geometry for one floor into material buckets
// (≈10 draw calls per floor) plus door-leaf instances.
import { slabTiles } from "../../domain/model";
import { deriveWallSegments } from "../../domain/walls";
import type { Wall } from "../../domain/types";
import { FLOOR_SURFACE } from "../coords";
import { emitBalcony } from "./geometry/balcony";
import { emitHallFloor, emitRoomFloors, emitSlab, emitVoidHits } from "./geometry/floors";
import { emitPorch } from "./geometry/porch";
import { Buckets, rgb } from "./geometry/QuadBuilder";
import { emitStairGuards, emitStairs, stairLayout } from "./geometry/stairs";
import { emitOpenings, emitShell, wallShell, type LeafInstance, type WallContext } from "./geometry/walls";
import type { FloorModel } from "./useStableFloors";

export type FloorBuild = { buckets: Buckets<string>; leaves: LeafInstance[] };

export function buildFloor(model: FloorModel): FloorBuild {
  const buckets = new Buckets<string>();
  const { floor, base, ground, stage } = model;
  let leaves: LeafInstance[] = [];
  if (ground && stage >= 1) emitSlab(floor, base, true, buckets);
  if (!ground && stage >= 4) emitSlab(floor, base, false, buckets);
  if (stage === 2) emitFrame(model, buckets);
  if (stage >= 3) {
    const ctx: WallContext = {
      floor,
      base,
      height: model.height,
      ground,
      openings: model.openings,
      trim: model.style.trim,
      frontDoor: model.style.frontDoor,
      stone: model.style.stone,
      aoStrips: model.aoStrips,
      doorsClosed: !model.interior,
      chhajja: model.style.chhajja,
      band: model.style.band,
      entranceId: model.entrance?.openingId ?? null,
    };
    const shell = wallShell(ctx, model.walls);
    emitShell(ctx, shell, buckets);
    leaves = emitOpenings(ctx, model.walls, shell, buckets);
    if (model.interior) {
      const y0 = base + FLOOR_SURFACE;
      for (const v of model.stairsUp) emitStairs(stairLayout(v.bounds, model.height, model.road), y0, buckets.get("joinery"));
      emitVoidHits(floor, base, buckets);
    }
  }
  if (stage >= 4) {
    if (model.interior) {
      emitHallFloor(floor, base, model.stairsArrive.length > 0, buckets);
      emitRoomFloors(floor, base, buckets);
      if (model.stairsArrive.length) {
        const segments = deriveWallSegments(floor);
        const hasWall = (edge: [number, number, number, number]) => wallAlong(segments, edge);
        for (const a of model.stairsArrive)
          emitStairGuards(stairLayout(a.void.bounds, a.height, model.road), base + FLOOR_SURFACE, buckets.get("joinery"), hasWall);
      }
    }
    for (const b of floor.balconies) emitBalcony(floor, b, base, model.style.trim, buckets, model.style.railing);
    if (model.entrance) emitPorch(model.entrance, model.style.trim, buckets);
  }
  return { buckets, leaves };
}

/** Does a wall segment run along this plan edge (metres)? */
function wallAlong(segments: Wall[], [x0, z0, x1, z1]: [number, number, number, number]) {
  const horizontal = Math.abs(z1 - z0) < 1e-6;
  const mid = horizontal ? ((x0 + x1) / 2) * 100 : ((z0 + z1) / 2) * 100;
  const line = Math.round((horizontal ? z0 : x0) * 100);
  return segments.some(
    (w) =>
      w.axis === (horizontal ? "x" : "z") &&
      Math.abs((w.axis === "x" ? w.z : w.x) - line) < 1 &&
      (w.axis === "x" ? w.x : w.z) < mid &&
      (w.axis === "x" ? w.x : w.z) + w.length > mid,
  );
}

/** Stage 2: perimeter columns and ring beams (keeps voids clear). */
function emitFrame(model: FloorModel, buckets: Buckets<string>) {
  const { floor, base } = model;
  const b = buckets.get("slab");
  const col = rgb("#c9c6bb"),
    beam = rgb("#bdbdb3");
  const top = base + model.height;
  for (const t of slabTiles(floor, false)) {
    const x0 = t.x / 100,
      x1 = (t.x + t.w) / 100,
      z0 = t.z / 100,
      z1 = (t.z + t.d) / 100;
    const xs = spaced(x0, x1),
      zs = spaced(z0, z1);
    for (const x of xs)
      for (const z of [z0, z1]) b.box([x - 0.11, base, z - 0.11], [x + 0.11, top - 0.26, z + 0.11], col);
    for (const z of zs.slice(1, -1))
      for (const x of [x0, x1]) b.box([x - 0.11, base, z - 0.11], [x + 0.11, top - 0.26, z + 0.11], col);
    for (const z of [z0, z1]) b.box([x0 - 0.1, top - 0.26, z - 0.1], [x1 + 0.1, top, z + 0.1], beam);
    for (const x of [x0, x1]) b.box([x - 0.1, top - 0.26, z0 + 0.1], [x + 0.1, top, z1 - 0.1], beam);
  }
}
const spaced = (a: number, b: number) => {
  const n = Math.max(1, Math.round((b - a) / 4));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
};
