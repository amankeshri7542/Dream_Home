// Pure first-person walking physics in plot centimetres: a circle that slides
// along walls, passes through doorways and archways, and bumps into furniture.
import { deriveWalls, isPassable, wallStart } from "../domain/walls";
import { floorForGeometry } from "../domain/core";
import type { Project, Wall } from "../domain/types";

export type Segment = { ax: number; az: number; bx: number; bz: number; half: number };
export const VISITOR_RADIUS = 22;
export const EYE_HEIGHT = 160;

function wallSegments(wall: Wall): Segment[] {
  const half = wall.exterior ? 10 : 6;
  const start = wallStart(wall);
  const gaps = wall.openings
    .filter((o) => isPassable(o.kind))
    .map((o) => [o.offset - o.width / 2 + 4, o.offset + o.width / 2 - 4] as const)
    .sort((a, b) => a[0] - b[0]);
  const pieces: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of gaps) {
    if (a > cursor) pieces.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < wall.length) pieces.push([cursor, wall.length]);
  return pieces.map(([a, b]) =>
    wall.axis === "x"
      ? { ax: start + a, az: wall.z, bx: start + b, bz: wall.z, half }
      : { ax: wall.x, az: start + a, bx: wall.x, bz: start + b, half },
  );
}

/** Rectangle outline as four zero-thickness segments (furniture, voids). */
export function rectSegments(r: { x: number; z: number; w: number; d: number }, half = 2): Segment[] {
  return [
    { ax: r.x, az: r.z, bx: r.x + r.w, bz: r.z, half },
    { ax: r.x + r.w, az: r.z, bx: r.x + r.w, bz: r.z + r.d, half },
    { ax: r.x, az: r.z + r.d, bx: r.x + r.w, bz: r.z + r.d, half },
    { ax: r.x, az: r.z, bx: r.x, bz: r.z + r.d, half },
  ];
}

export type Colliders = { segments: Segment[] };
/**
 * Colliders for one floor: walls minus doorways, plus blocking furniture and
 * any extra rectangles (e.g. stair holes on upper floors).
 */
export function buildColliders(
  project: Project,
  floorId: string,
  blockers: { x: number; z: number; w: number; d: number }[] = [],
): Colliders {
  const floor = floorForGeometry(project, floorId);
  return {
    segments: [
      ...deriveWalls(floor, project.plot.road).flatMap(wallSegments),
      ...blockers.flatMap((b) => rectSegments(b)),
    ],
  };
}

function closest(s: Segment, x: number, z: number) {
  const dx = s.bx - s.ax,
    dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
  return { x: s.ax + dx * t, z: s.az + dz * t };
}

function resolve(p: { x: number; z: number }, radius: number, c: Colliders) {
  for (let iteration = 0; iteration < 3; iteration++) {
    let moved = false;
    for (const s of c.segments) {
      const q = closest(s, p.x, p.z);
      const dx = p.x - q.x,
        dz = p.z - q.z;
      const dist = Math.hypot(dx, dz);
      const min = radius + s.half;
      if (dist < min) {
        const nx = dist > 0.0001 ? dx / dist : 1,
          nz = dist > 0.0001 ? dz / dist : 0;
        p.x = q.x + nx * min;
        p.z = q.z + nz * min;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return p;
}

/** Moves the visitor by `delta`, sliding along anything in the way. */
export function moveVisitor(
  from: { x: number; z: number },
  delta: { x: number; z: number },
  colliders: Colliders,
  radius = VISITOR_RADIUS,
): { x: number; z: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (radius / 2)));
  const p = { ...from };
  for (let i = 0; i < steps; i++) {
    p.x += delta.x / steps;
    p.z += delta.z / steps;
    resolve(p, radius, colliders);
  }
  return p;
}

/** Nudges a spawn point out of any collider it overlaps. */
export function unstick(
  p: { x: number; z: number },
  colliders: Colliders,
  radius = VISITOR_RADIUS,
): { x: number; z: number } {
  const blocked = (q: { x: number; z: number }) =>
    colliders.segments.some((s) => {
      const c = closest(s, q.x, q.z);
      return Math.hypot(q.x - c.x, q.z - c.z) < radius + s.half - 0.5;
    });
  if (!blocked(p)) return p;
  for (let ring = 10; ring <= 200; ring += 10)
    for (let a = 0; a < 16; a++) {
      const q = {
        x: p.x + Math.cos((a / 16) * Math.PI * 2) * ring,
        z: p.z + Math.sin((a / 16) * Math.PI * 2) * ring,
      };
      if (!blocked(q)) return q;
    }
  return p;
}

// ---------------------------------------------------------------------------
// How walking feels (pure, so it can be tested): a speed that eases in and out,
// a gentle head bob tied to distance walked, and a small FOV punch when running.
// ---------------------------------------------------------------------------

/** Seconds from standing to full speed, and back. */
export const RAMP_SECONDS = 0.25;
/** Head bob: one cycle every this many cm walked, this many cm up and down. */
export const BOB_PERIOD = 75;
export const BOB_AMPLITUDE = 2.5;
export const WALK_FOV = 68;
export const RUN_FOV = 78;

/** A 0–1 throttle: towards 1 while moving is wanted, back to 0 after, linearly over RAMP_SECONDS. */
export function rampThrottle(current: number, held: boolean, dt: number, seconds = RAMP_SECONDS): number {
  const step = dt / seconds;
  return held ? Math.min(1, current + step) : Math.max(0, current - step);
}
/** The throttle as a speed factor: smooth at both ends, so starts and stops ease. */
export const throttleSpeed = (t: number) => t * t * (3 - 2 * t);

/** The head bob's height (cm) after walking `distance` cm, scaled by `weight` (0 standing … 1 walking). */
export function headBob(distance: number, weight: number, period = BOB_PERIOD, amplitude = BOB_AMPLITUDE): number {
  return Math.sin((distance / period) * Math.PI * 2) * amplitude * weight;
}

/**
 * The FOV a frame later: up to RUN_FOV in about 0.3 s when running, back down in
 * about 0.5 s, easing out; it settles exactly on the target, so it never creeps.
 */
export function nextFov(current: number, running: boolean, dt: number): number {
  const target = running ? RUN_FOV : WALK_FOV;
  const seconds = running ? 0.3 : 0.5;
  // Exponential approach: covers ~95% of the way in `seconds`.
  const k = 1 - Math.exp((-3 * dt) / seconds);
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 0.05 ? target : next;
}
