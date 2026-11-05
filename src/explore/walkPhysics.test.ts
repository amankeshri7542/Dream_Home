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
  furnitureBlockers,
  rectCapsule,
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

describe("furniture you can't walk through", () => {
  const pieces = furnitureBlockers(project, floor.id);

  it("blocks the big pieces only", () => {
    expect(pieces.length).toBeGreaterThan(2);
    // Each blocker is a solid capsule at least 46 cm across (the smallest piece that counts, inset).
    for (const p of pieces) expect(p.half * 2).toBeGreaterThanOrEqual(20);
  });

  it("pushes a visitor out of a piece, never holds them inside", () => {
    const sofa = rectCapsule({ x: 0, z: 0, w: 220, d: 90 });
    const inside = { x: 110, z: 45 };
    const free = unstick(inside, { segments: [sofa] });
    expect(Math.abs(free.z - 45)).toBeGreaterThan(sofa.half + VISITOR_RADIUS - 2);
  });

  it("stops a walk into a sofa and slides along it", () => {
    const sofa = rectCapsule({ x: 0, z: 0, w: 220, d: 90 });
    const at = moveVisitor({ x: 110, z: 200 }, { x: 0, z: -200 }, { segments: [sofa] });
    expect(at.z).toBeGreaterThan(90 - 4 + VISITOR_RADIUS - 1);
    const slid = moveVisitor({ x: 110, z: 200 }, { x: 60, z: -200 }, { segments: [sofa] });
    expect(slid.x).toBeGreaterThan(150);
  });

  it("leaves room to stand in every room of every starter home", () => {
    for (const preset of ["compact", "family", "courtyard"] as const) {
      const p = createPreset(preset);
      for (const f of p.floors) {
        const c = buildColliders(p, f.id, [], { furniture: true });
        for (const room of f.rooms) {
          const b = room.bounds;
          const spot = unstick({ x: b.x + b.w / 2, z: b.z + b.d / 2 }, c);
          const inRoom = spot.x > b.x && spot.x < b.x + b.w && spot.z > b.z && spot.z < b.z + b.d;
          expect(inRoom, `${preset} ${room.name}`).toBe(true);
        }
      }
    }
  });

  it("can still reach every room on foot, with the furniture in place", () => {
    for (const preset of ["compact", "family"] as const) {
      const p = createPreset(preset);
      for (const f of p.floors) {
        const c = buildColliders(p, f.id, [], { furniture: true });
        const fp = f.footprint;
        const step = 20;
        const key = (x: number, z: number) => `${x},${z}`;
        const biggest = [...f.rooms].sort((m, n) => n.bounds.w * n.bounds.d - m.bounds.w * m.bounds.d)[0];
        const start = unstick({ x: biggest.bounds.x + biggest.bounds.w / 2, z: biggest.bounds.z + biggest.bounds.d / 2 }, c);
        const snap = (v: number, o: number) => o + Math.round((v - o) / step) * step;
        const first = { x: snap(start.x, fp.x), z: snap(start.z, fp.z) };
        const seen = new Set([key(first.x, first.z)]);
        const queue = [first];
        const reached = new Set<string>();
        while (queue.length) {
          const q = queue.shift()!;
          const room = f.rooms.find((r) => q.x > r.bounds.x && q.x < r.bounds.x + r.bounds.w && q.z > r.bounds.z && q.z < r.bounds.z + r.bounds.d);
          if (room) reached.add(room.id);
          for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const n = { x: q.x + dx, z: q.z + dz };
            if (n.x < fp.x || n.x > fp.x + fp.w || n.z < fp.z || n.z > fp.z + fp.d || seen.has(key(n.x, n.z))) continue;
            const got = moveVisitor(q, { x: dx, z: dz }, c);
            if (Math.hypot(got.x - n.x, got.z - n.z) > 6) continue;
            seen.add(key(n.x, n.z));
            queue.push(n);
          }
        }
        // Rooms reached without furniture must still be reached with it.
        const bare = buildColliders(p, f.id);
        const open = f.rooms.filter((r) => {
          const mid = unstick({ x: r.bounds.x + r.bounds.w / 2, z: r.bounds.z + r.bounds.d / 2 }, bare);
          return mid.x > r.bounds.x && mid.x < r.bounds.x + r.bounds.w;
        });
        for (const room of open) expect(reached.has(room.id), `${preset} ${f.name}: ${room.name}`).toBe(true);
      }
    }
  });
});
