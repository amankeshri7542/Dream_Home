// The check screen's state, kept out of the lazy panel so the app shell can
// hold it and draw the photo under the plan without loading the panel.
import type { Rect } from "../domain/types";

export type PlanCheckState = {
  homeId: string;
  /** The photo (an object URL) and where it lies on the plan before nudging (cm). */
  url: string;
  rect: Rect;
  offset: { x: number; z: number };
  scale: number;
  show: boolean;
  unsure: string[];
  notes: string[];
};

/** Where the photo lies now: nudged, and scaled about its middle. */
export function photoRect(check: PlanCheckState): Rect {
  const { rect, offset, scale } = check;
  const cx = rect.x + rect.w / 2,
    cz = rect.z + rect.d / 2;
  return { x: cx - (rect.w * scale) / 2 + offset.x, z: cz - (rect.d * scale) / 2 + offset.z, w: rect.w * scale, d: rect.d * scale };
}
