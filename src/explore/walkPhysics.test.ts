import { describe, expect, it } from "vitest";
import { createPreset } from "../domain/model";
import { deriveWalls } from "../domain/walls";
import { floorForGeometry } from "../domain/core";
import { VISITOR_RADIUS, buildColliders, moveVisitor, unstick } from "./walkPhysics";

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
