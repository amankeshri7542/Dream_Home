import { snap } from "./geometry";
import type { EdgeSide, Rect } from "./types";

export const RESIZE_HANDLES = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/** Moving edges snap to the grid; their opposite edges remain exact anchors. */
export function resizeBounds(
  bounds: Rect,
  handle: ResizeHandle,
  dx: number,
  dz: number,
  minW = 120,
  minD = 120,
): Rect {
  let { x, z, w, d } = bounds;
  if (handle.includes("w")) {
    x = Math.min(bounds.x + bounds.w - minW, bounds.x + snap(dx));
    w = bounds.x + bounds.w - x;
  } else if (handle.includes("e")) w = Math.max(minW, bounds.w + snap(dx));
  if (handle.includes("n")) {
    z = Math.min(bounds.z + bounds.d - minD, bounds.z + snap(dz));
    d = bounds.z + bounds.d - z;
  } else if (handle.includes("s")) d = Math.max(minD, bounds.d + snap(dz));
  return { x, z, w, d };
}

/** Balcony attachment is fixed; only its three free sides may be resized. */
export function resizeHandlesForBalcony(edge: EdgeSide): ResizeHandle[] {
  return {
    north: ["nw", "n", "ne", "e", "w"],
    south: ["sw", "s", "se", "e", "w"],
    east: ["ne", "e", "se", "n", "s"],
    west: ["nw", "w", "sw", "n", "s"],
  }[edge] as ResizeHandle[];
}

export function resizeHandlePosition(
  bounds: Rect,
  handle: ResizeHandle,
): { x: number; z: number } {
  return {
    x:
      bounds.x +
      (handle.includes("w")
        ? 0
        : handle.includes("e")
          ? bounds.w
          : bounds.w / 2),
    z:
      bounds.z +
      (handle.includes("n")
        ? 0
        : handle.includes("s")
          ? bounds.d
          : bounds.d / 2),
  };
}
