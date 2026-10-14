// Pure conversions between the 3D world (metres, plot centred at the origin)
// and the domain (integer centimetres from the plot's north-west corner).
import { Plane, Vector3, type Camera, type PerspectiveCamera, type Ray } from "three";
import type { Floor, Project } from "../domain/types";

export const FLOOR_BASE = 0.15;
export const FLOOR_SURFACE = 0.025;
export const GROUND_Y = 0.04;

export const plotOrigin = (plot: Project["plot"]) => ({
  x: -plot.width / 200,
  z: -plot.depth / 200,
});
export const floorBaseY = (floor: Pick<Floor, "elevation">) =>
  floor.elevation / 100 + FLOOR_BASE;
export const floorSurfaceY = (floor: Pick<Floor, "elevation">) =>
  floorBaseY(floor) + FLOOR_SURFACE;

export function plotToWorld(
  plot: Project["plot"],
  x: number,
  z: number,
  y = 0,
): Vector3 {
  const o = plotOrigin(plot);
  return new Vector3(o.x + x / 100, y, o.z + z / 100);
}
export function worldToPlot(
  plot: Project["plot"],
  v: { x: number; z: number },
): { x: number; z: number } {
  const o = plotOrigin(plot);
  return { x: (v.x - o.x) * 100, z: (v.z - o.z) * 100 };
}

const plane = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
/**
 * Intersects a ray with the horizontal plane at `planeY` (metres) and returns
 * plot centimetres, or null for grazing/backward rays or far-away hits.
 */
export function rayToPlot(
  ray: Ray,
  planeY: number,
  plot: Project["plot"],
  maxOutsideCm = 5000,
): { x: number; z: number } | null {
  if (Math.abs(ray.direction.y) < 0.02) return null;
  plane.constant = -planeY;
  if (!ray.intersectPlane(plane, hit)) return null;
  const p = worldToPlot(plot, hit);
  if (
    p.x < -maxOutsideCm ||
    p.z < -maxOutsideCm ||
    p.x > plot.width + maxOutsideCm ||
    p.z > plot.depth + maxOutsideCm
  )
    return null;
  return p;
}

/** Centimetres covered by one CSS pixel at a world point (perspective or ortho). */
export function cmPerPixel(
  camera: Camera,
  point: Vector3,
  viewportHeight: number,
): number {
  const perspective = camera as PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    const distance = camera.position.distanceTo(point);
    const visible = 2 * distance * Math.tan((perspective.fov * Math.PI) / 360);
    return (visible / Math.max(1, viewportHeight)) * 100;
  }
  const ortho = camera as unknown as { zoom: number };
  return 100 / Math.max(0.0001, ortho.zoom);
}
