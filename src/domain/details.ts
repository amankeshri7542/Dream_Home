// Shared furnishing descriptors: the centimetre-scale parts both the plan and
// the 3D view draw, plus the illustrative door approaches furniture avoids.
import type { Rect, Room, Wall } from "./types";
import { isPassable } from "./walls";

export const DETAIL_MATERIALS = {
  timber: { color: "#967252", roughness: 0.72 },
  oak: { color: "#c1a47a", roughness: 0.7 },
  linen: { color: "#f3ede2", roughness: 0.96 },
  fabric: { color: "#819e9c", roughness: 0.98 },
  cushion: { color: "#c6d6cc", roughness: 0.98 },
  cabinet: { color: "#718778", roughness: 0.78 },
  stone: { color: "#ded8ca", roughness: 0.64 },
  ceramic: { color: "#f2f2e9", roughness: 0.34 },
  steel: { color: "#859697", roughness: 0.26 },
  dark: { color: "#374545", roughness: 0.45 },
  water: { color: "#aacfd2", roughness: 0.22 },
  clay: { color: "#c7855f", roughness: 0.8 },
  leaf: { color: "#6f8f57", roughness: 0.9 },
  glow: { color: "#ffe2b0", roughness: 0.6 },
} as const;
export type DetailMaterial = keyof typeof DETAIL_MATERIALS;
export type RoomDetail = {
  role: string;
  shape: "box" | "ellipse";
  /** Plot centimetres (room-local or item-local inside generators). */
  bounds: Rect;
  y: number;
  height: number;
  material: DetailMaterial;
  soft?: boolean;
  /** The furniture item that owns this part (`auto:` ids for automatic items). */
  ownerId?: string;
  /** A chosen finish colour that overrides the material's base colour. */
  color?: string;
};

export function overlapArea(a: Rect, b: Rect) {
  return (
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z))
  );
}

/** Rotates a rect inside a w×d frame by quarter turns (clockwise seen from above). */
export function turnRect(r: Rect, w: number, d: number, turns: number): Rect {
  if (turns === 1) return { x: d - r.z - r.d, z: r.x, w: r.d, d: r.w };
  if (turns === 2)
    return { x: w - r.x - r.w, z: d - r.z - r.d, w: r.w, d: r.d };
  if (turns === 3) return { x: r.z, z: w - r.x - r.w, w: r.d, d: r.w };
  return r;
}

/** Illustrative door approaches, not regulatory clearance measurements. */
export function roomDoorApproaches(room: Room, walls: readonly Wall[]): Rect[] {
  const r = room.bounds;
  return walls.flatMap((wall) =>
    wall.openings.flatMap((opening) => {
      if (!isPassable(opening.kind)) return [];
      const width = opening.width + 20;
      if (wall.axis === "x" && (wall.z === r.z || wall.z === r.z + r.d)) {
        const center = wall.x + opening.offset;
        if (center <= r.x || center >= r.x + r.w) return [];
        return [
          {
            x: center - width / 2,
            z: wall.z === r.z ? r.z : r.z + r.d - 85,
            w: width,
            d: 85,
          },
        ];
      }
      if (wall.axis === "z" && (wall.x === r.x || wall.x === r.x + r.w)) {
        const center = wall.z + opening.offset;
        if (center <= r.z || center >= r.z + r.d) return [];
        return [
          {
            x: wall.x === r.x ? r.x : r.x + r.w - 85,
            z: center - width / 2,
            w: 85,
            d: width,
          },
        ];
      }
      return [];
    }),
  );
}
