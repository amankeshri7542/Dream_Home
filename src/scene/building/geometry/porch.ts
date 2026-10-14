// Entrance detection (shared by the porch, the garden path and the night
// light) and porch geometry: landing + step, cantilever canopy with brackets,
// two sconces and a doormat.
import { floorForGeometry } from "../../../domain/core";
import { deriveWalls, isWindow } from "../../../domain/walls";
import type { Project } from "../../../domain/types";
import { SLAB_TOP, floorBase } from "../../coords";
import { classifyPoint } from "./walls";
import { rgb, type Buckets, type QuadBuilder, type V3 } from "./QuadBuilder";

export type Entrance = {
  floorId: string;
  openingId: string;
  axis: "x" | "z";
  /** Door centre on the wall line, plot metres. */
  along: number;
  line: number;
  /** +1/−1: which side of the line is outside. */
  out: 1 | -1;
  width: number;
  head: number;
  /** True when the door faces the road. */
  roadSide: boolean;
};

export function findEntrance(project: Project): Entrance | null {
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
  const line = (wall.axis === "x" ? wall.z : wall.x) / 100;
  const along = ((wall.axis === "x" ? wall.x : wall.z) + o.offset) / 100;
  const probe = (side: 1 | -1) => {
    const across = line + side * 0.2;
    const [x, z] = wall.axis === "x" ? [along, across] : [across, along];
    return classifyPoint(floor, x * 100, z * 100).outside;
  };
  const out: 1 | -1 = probe(1) ? 1 : -1;
  const y0 = floorBase(ground) + SLAB_TOP;
  return {
    floorId: ground.id,
    openingId: o.id,
    axis: wall.axis,
    along,
    line,
    out,
    width: o.width / 100,
    head: y0 + Math.min(o.sill + o.height, ground.height - 1) / 100,
    roadSide: onRoadSide(wall),
  };
}

const toV3 = (axis: "x" | "z", along: number, y: number, across: number): V3 =>
  axis === "x" ? [along, y, across] : [across, y, along];

/** Porch pieces go into the ground floor buckets; sconces into `lamp`. */
export function emitPorch(e: Entrance, trimHex: string, buckets: Buckets<string>) {
  const face = e.line + e.out * 0.1;
  const half = e.width / 2;
  const box = (b: QuadBuilder, a0: number, a1: number, y0: number, y1: number, n0: number, n1: number, color: [number, number, number]) => {
    const p = toV3(e.axis, a0, y0, n0),
      q = toV3(e.axis, a1, y1, n1);
    b.box(
      [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])],
      [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])],
      color,
    );
  };
  const stone = buckets.get("stone"),
    joinery = buckets.get("joinery");
  const paving = rgb("#d6ccba"),
    trim = rgb(trimHex);
  // Landing flush with the floor, plus one generous step.
  box(stone, e.along - half - 0.4, e.along + half + 0.4, 0, 0.16, face, face + e.out * 1.05, paving);
  box(stone, e.along - half - 0.25, e.along + half + 0.25, 0, 0.08, face + e.out * 1.05, face + e.out * 1.4, rgb("#cdc2ae"));
  // Doormat.
  box(joinery, e.along - 0.42, e.along + 0.42, 0.16, 0.172, face + e.out * 0.12, face + e.out * 0.62, rgb("#6b5444"));
  // Canopy with a slim fascia.
  const cy = e.head + 0.24;
  box(joinery, e.along - half - 0.5, e.along + half + 0.5, cy, cy + 0.07, face, face + e.out * 1.1, trim);
  box(joinery, e.along - half - 0.5, e.along + half + 0.5, cy - 0.03, cy + 0.1, face + e.out * 1.08, face + e.out * 1.12, trim);
  // Triangular brackets.
  const N: V3 = e.axis === "x" ? [1, 0, 0] : [0, 0, 1];
  const S: V3 = e.axis === "x" ? [0, 0, 1] : [1, 0, 0];
  for (const side of [-1, 1]) {
    const a = e.along + side * (half + 0.38);
    joinery.extrude([0, 0, 0], S, N, [
      [face, cy],
      [face + e.out * 0.75, cy],
      [face, cy - 0.5],
    ], a - 0.03, a + 0.03, trim);
  }
  // Sconces either side of the door.
  const lamp = buckets.get("lamp");
  for (const side of [-1, 1]) {
    const a = e.along + side * (half + 0.24);
    box(joinery, a - 0.05, a + 0.05, e.head - 0.55, e.head - 0.3, face, face + e.out * 0.03, rgb("#3a3733"));
    box(lamp, a - 0.04, a + 0.04, e.head - 0.52, e.head - 0.33, face + e.out * 0.03, face + e.out * 0.1, [1, 1, 1]);
  }
}

/** World position (plot metres) for the entrance light. */
export function entranceLightPosition(e: Entrance): V3 {
  return toV3(e.axis, e.along, e.head - 0.15, e.line + e.out * 0.9);
}
