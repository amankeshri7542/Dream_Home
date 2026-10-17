// The entrance in plot metres (the main door comes from domain/entrance.ts;
// the porch, the garden path and the night light use it) and porch geometry:
// landing + step, cantilever canopy with brackets, two sconces and a doormat.
import { PORCH, mainDoor } from "../../../domain/entrance";
import type { Project } from "../../../domain/types";
import { SLAB_TOP, floorBase } from "../../coords";
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
  const door = mainDoor(project);
  if (!door) return null;
  const ground = project.floors.find((f) => f.id === door.floorId)!;
  return {
    floorId: door.floorId,
    openingId: door.openingId,
    axis: door.axis,
    along: door.along / 100,
    line: door.line / 100,
    out: door.out,
    width: door.width / 100,
    head: floorBase(ground) + SLAB_TOP + door.head / 100,
    roadSide: door.roadSide,
  };
}

const toV3 = (axis: "x" | "z", along: number, y: number, across: number): V3 =>
  axis === "x" ? [along, y, across] : [across, y, along];

/** Porch pieces go into the ground floor buckets; sconces into `lamp`. */
export function emitPorch(e: Entrance, trimHex: string, buckets: Buckets<string>) {
  const face = e.line + (e.out * PORCH.face) / 100;
  const half = e.width / 2;
  const { landing, step, mat } = PORCH;
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
  const out = (cm: number) => face + (e.out * cm) / 100;
  box(stone, e.along - half - landing.reach / 100, e.along + half + landing.reach / 100, 0, landing.top / 100, face, out(landing.depth), paving);
  box(stone, e.along - half - step.reach / 100, e.along + half + step.reach / 100, 0, step.top / 100, out(landing.depth), out(landing.depth + step.depth), rgb("#cdc2ae"));
  // Doormat.
  box(joinery, e.along - mat.half / 100, e.along + mat.half / 100, landing.top / 100, mat.top / 100, out(mat.from), out(mat.to), rgb("#6b5444"));
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
