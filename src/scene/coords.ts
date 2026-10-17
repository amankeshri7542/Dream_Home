// Domain ⇄ world conventions for renderer v2.
// Domain: integer centimetres, plot-local, origin = plot NW corner, x east, z south.
// World: metres. The plot is centred by a group offset of [-w/200, 0, -d/200];
// everything inside the building/plot group is in plot-local metres.
import type { Floor, Project, Rect } from "../domain/types";
import { WALL_THICKNESS } from "../domain/walls";

export const cm = (v: number) => v / 100;

/** Height of a floor's structural base (top of the slab zone) in metres. */
export const floorBase = (floor: Pick<Floor, "elevation">) =>
  floor.elevation / 100 + 0.15;
/** Room floor finishes sit this far above the floor base. */
export const FLOOR_SURFACE = 0.025;
/** Lawn / ground top surface on the plinth. */
export const GROUND_TOP = 0.038;
/** Slab top relative to the floor base (walls start here). */
export const SLAB_TOP = 0.01;
/** Slab thickness under each floor base. */
export const SLAB_DEPTH = 0.17;
/** Storey height in metres (domain floors are 300 cm). */
export const STOREY = 3;
/** Wall thicknesses, metres. */
export const EXTERIOR_WALL = WALL_THICKNESS.exterior / 100;
export const INTERIOR_WALL = WALL_THICKNESS.interior / 100;
/** Depth of the diorama plinth below the ground. */
export const PLINTH_BOTTOM = -0.75;

export function plotOffset(project: Pick<Project, "plot">): [number, number, number] {
  return [-project.plot.width / 200, 0, -project.plot.depth / 200];
}

/** Plot-local cm → world metres (with the plot centring offset applied). */
export function plotToWorld(
  project: Pick<Project, "plot">,
  x: number,
  z: number,
  y = 0,
): [number, number, number] {
  return [x / 100 - project.plot.width / 200, y, z / 100 - project.plot.depth / 200];
}

export const rectCenter = (r: Rect): [number, number] => [
  (r.x + r.w / 2) / 100,
  (r.z + r.d / 2) / 100,
];

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

export function easeOutBack(t: number, s = 1.70158) {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
export function easeOutCubic(t: number) {
  const u = 1 - t;
  return 1 - u * u * u;
}
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
