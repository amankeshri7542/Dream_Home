// Shared registry between the DOM overlay (labels, ghost badge — siblings of
// the Canvas) and the in-Canvas projector that positions them imperatively.
import type { Mesh } from "three";

export type OverlayAnchor = {
  el: HTMLElement | null;
  /** World-space position (metres). */
  pos: [number, number, number];
  /** Floor whose wall meshes may occlude this anchor. */
  floorId: string | null;
  /** Labels only: when two collide, the higher priority keeps its place. */
  priority?: number;
};

export type OverlayRegistry = {
  anchors: Map<string, OverlayAnchor>;
  /** Wall meshes per floor (for label occlusion). */
  occluders: Map<string, Mesh[]>;
  /** Bumped when anchors change, so the projector refreshes. */
  version: number;
  /** Chrome covering the canvas edges; the ghost badge stays clear of it. */
  insets: { top: number; right: number; bottom: number; left: number };
};

export function createOverlayRegistry(): OverlayRegistry {
  return { anchors: new Map(), occluders: new Map(), version: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
}
