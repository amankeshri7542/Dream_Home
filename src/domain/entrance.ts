// The main entrance: the exterior door on the ground floor that faces the
// road (else any outside door, footprint doors before courtyard ones). The
// porch, the garden path and the lived-in details all start from it.
import { floorForGeometry } from "./core";
import { inside } from "./geometry";
import type { GeometryFloor, Project } from "./types";
import { WALL_THICKNESS, deriveWalls, isWindow } from "./walls";

export type MainDoor = {
  floorId: string;
  openingId: string;
  /** The wall runs along x (at z = line) or along z (at x = line). */
  axis: "x" | "z";
  /** Door centre along the wall and the wall line, plot centimetres. */
  along: number;
  line: number;
  /** +1/−1: which side of the line is outside. */
  out: 1 | -1;
  width: number;
  /** Top of the door opening above the floor, cm. */
  head: number;
  /** True when the door faces the road. */
  roadSide: boolean;
};

/**
 * The porch in front of the main door, in cm: measured out from the wall's
 * outside face (half an exterior wall beyond its line), heights above the plot
 * ground (0). The 3D porch draws these; lived-in details stand on them.
 */
export const PORCH = {
  face: WALL_THICKNESS.exterior / 2,
  landing: { depth: 105, reach: 40, top: 16 },
  step: { depth: 35, reach: 25, top: 8 },
  mat: { half: 42, from: 12, to: 62, top: 17.2 },
} as const;

/** Is a plan point outside the building on this floor (beyond the footprint or in a courtyard)? */
export function outsideBuilding(floor: GeometryFloor, x: number, z: number): boolean {
  const f = floor.footprint;
  if (!(x > f.x && x < f.x + f.w && z > f.z && z < f.z + f.d)) return true;
  return floor.voids.some((v) => v.kind === "courtyard" && inside(v.bounds, x, z));
}

// Projects are immutable, so each one's main door is worked out once (the
// porch, the garden and every floor's lived-in details all ask for it).
const doors = new WeakMap<Project, MainDoor | null>();
export function mainDoor(project: Project): MainDoor | null {
  let door = doors.get(project);
  if (door === undefined) {
    door = findMainDoor(project);
    doors.set(project, door);
  }
  return door;
}

function findMainDoor(project: Project): MainDoor | null {
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  if (!ground) return null;
  const floor = floorForGeometry(project, ground.id);
  const walls = deriveWalls(floor, project.plot.road);
  const fp = floor.footprint;
  const road = project.plot.road;
  const onRoadSide = (w: (typeof walls)[number]) =>
    road === "south"
      ? w.axis === "x" && w.z === fp.z + fp.d
      : road === "north"
        ? w.axis === "x" && w.z === fp.z
        : road === "east"
          ? w.axis === "z" && w.x === fp.x + fp.w
          : w.axis === "z" && w.x === fp.x;
  const candidates = walls.filter((w) => w.exterior && w.openings.some((o) => !isWindow(o.kind)));
  // Courtyard doors are exterior too; prefer footprint-perimeter doors.
  const perimeter = (w: (typeof walls)[number]) =>
    w.axis === "x" ? w.z === fp.z || w.z === fp.z + fp.d : w.x === fp.x || w.x === fp.x + fp.w;
  candidates.sort((a, b) => Number(onRoadSide(b)) - Number(onRoadSide(a)) || Number(perimeter(b)) - Number(perimeter(a)));
  const wall = candidates[0];
  if (!wall) return null;
  const o = wall.openings.find((op) => !isWindow(op.kind))!;
  const line = wall.axis === "x" ? wall.z : wall.x;
  const along = (wall.axis === "x" ? wall.x : wall.z) + o.offset;
  const probe = (side: 1 | -1) => {
    const across = line + side * 20;
    const [x, z] = wall.axis === "x" ? [along, across] : [across, along];
    return outsideBuilding(floor, x, z);
  };
  return {
    floorId: ground.id,
    openingId: o.id,
    axis: wall.axis,
    along,
    line,
    out: probe(1) ? 1 : -1,
    width: o.width,
    head: Math.min(o.sill + o.height, ground.height - 1),
    roadSide: onRoadSide(wall),
  };
}
