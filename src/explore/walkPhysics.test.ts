import { describe, expect, it } from "vitest";
import { createPreset } from "../domain/model";
import { deriveWalls } from "../domain/walls";
import { floorForGeometry } from "../domain/core";
import {
  BOB_AMPLITUDE,
  BOB_PERIOD,
  RUN_FOV,
  VISITOR_RADIUS,
  WALK_FOV,
  buildColliders,
  headBob,
  moveVisitor,
  nextFov,
  rampThrottle,
  throttleSpeed,
  unstick,
} from "./walkPhysics";

const project = createPreset("compact");
const floor = project.floors[0];
const colliders = buildColliders(project, floor.id);

describe("walk physics", () => {
  it("stops at a solid wall and slides along it", () => {
    const f = floor.footprint;
    const start = { x: f.x + 120, z: f.z + 60 };
    // Walk straight north into the exterior wall.
    const blocked = moveVisitor(start, { x: 0, z: -200 }, colliders);
    expect(blocked.z).toBeGreaterThan(f.z + VISITOR_RADIUS - 1);
    // Walking diagonally into it keeps the sideways motion.
    const slid = moveVisitor(start, { x: 80, z: -200 }, colliders);
    expect(slid.x).toBeGreaterThan(start.x + 60);
    expect(slid.z).toBeGreaterThan(f.z + VISITOR_RADIUS - 1);
  });

  it("passes through a doorway but not through the wall beside it", () => {
    const walls = deriveWalls(floorForGeometry(project, floor.id), project.plot.road);
    const doorWall = walls.find(
      (w) => !w.exterior && w.openings.some((o) => o.kind === "door"),
    )!;
    const door = doorWall.openings.find((o) => o.kind === "door")!;
    const along = (doorWall.axis === "x" ? doorWall.x : doorWall.z) + door.offset;
    const line = doorWall.axis === "x" ? doorWall.z : doorWall.x;
    const at = (a: number, l: number) =>
      doorWall.axis === "x" ? { x: a, z: l } : { x: l, z: a };
    const step = (d: number) => (doorWall.axis === "x" ? { x: 0, z: d } : { x: d, z: 0 });
    const through = moveVisitor(at(along, line - 60), step(120), colliders);
    expect((doorWall.axis === "x" ? through.z : through.x) - line).toBeGreaterThan(40);
    const wallPoint = along + door.width / 2 + 40;
    if (wallPoint < (doorWall.axis === "x" ? doorWall.x : doorWall.z) + doorWall.length - 30) {
      const stopped = moveVisitor(at(wallPoint, line - 60), step(120), colliders);
      expect((doorWall.axis === "x" ? stopped.z : stopped.x)).toBeLessThan(line);
    }
  });

  it("unsticks a visitor spawned inside a wall", () => {
    const f = floor.footprint;
    const p = unstick({ x: f.x + 150, z: f.z }, colliders);
    expect(Math.abs(p.z - f.z)).toBeGreaterThan(VISITOR_RADIUS);
  });
});

describe("how walking feels", () => {
  const run = (start: number, held: boolean, seconds: number, step = 1 / 60) => {
    let t = start;
    for (let i = 0; i < Math.round(seconds / step); i++) t = rampThrottle(t, held, step);
    return t;
  };
  it("ramps up to full speed in about a quarter second, and back down after letting go", () => {
    expect(run(0, true, 0.1)).toBeGreaterThan(0.3);
    expect(run(0, true, 0.1)).toBeLessThan(0.5);
    expect(run(0, true, 0.26)).toBe(1);
    expect(run(1, false, 0.26)).toBe(0);
    // Smooth at both ends: barely moving at first, nearly full speed near the top.
    expect(throttleSpeed(0.1)).toBeLessThan(0.05);
    expect(throttleSpeed(0.9)).toBeGreaterThan(0.95);
  });

  it("bobs a couple of centimetres per stride, and not at all when standing", () => {
    let top = 0;
    for (let d = 0; d <= BOB_PERIOD; d += 1) top = Math.max(top, Math.abs(headBob(d, 1)));
    expect(top).toBeCloseTo(BOB_AMPLITUDE, 1);
    expect(top).toBeLessThanOrEqual(3);
    expect(headBob(BOB_PERIOD / 4, 0)).toBe(0);
    expect(headBob(BOB_PERIOD, 1)).toBeCloseTo(0, 6);
  });

  it("widens the view when running, then settles back to exactly the walking FOV", () => {
    let fov = WALK_FOV;
    for (let i = 0; i < 18; i++) fov = nextFov(fov, true, 1 / 60);
    expect(fov).toBeGreaterThan(RUN_FOV - 1);
    for (let i = 0; i < 60; i++) fov = nextFov(fov, false, 1 / 60);
    expect(fov).toBe(WALK_FOV);
  });
});
