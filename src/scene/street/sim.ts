// Pure street-life choreography: where each toy actor is at time t (seconds)
// along the road band, and how its parts swing. No three.js objects here, so
// it is cheap to test. Plot-local metres; actors face +Z in model space.
import type { Project } from "../../domain/types";
import { hash2 } from "../materials/noise";
import { roadFrame } from "../props/site";

export type ActorKind = "walker" | "dog" | "cow" | "vehicle" | "bird";
export type StreetActor = {
  model: string;
  kind: ActorKind;
  /** Metres beyond the plot edge (road-band coordinate). */
  out: number;
  /** Ground height of the lane. */
  y: number;
  /** m/s along the road (sign = direction). */
  speed: number;
  /** Starting position as a fraction of the band. */
  start: number;
  /** Blob shadow size [across, along] in metres. */
  shadow: [number, number];
  /** Wheel radius (vehicles). */
  wheel?: number;
};

/** Lane heights match Ground.tsx: pavement 0.05, asphalt 0.012, verge lawn. */
const PAVEMENT = 0.05,
  ROAD = 0.012,
  VERGE = 0.038;

export const STREET_CAST: StreetActor[] = [
  { model: "person-kurta", kind: "walker", out: 0.3, y: PAVEMENT, speed: 1.05, start: 0.15, shadow: [0.45, 0.45] },
  { model: "person-saree", kind: "walker", out: 4.22, y: VERGE, speed: -0.85, start: 0.55, shadow: [0.5, 0.5] },
  { model: "person-kid", kind: "walker", out: 0.3, y: PAVEMENT, speed: 1.25, start: 0.62, shadow: [0.36, 0.36] },
  { model: "dog", kind: "dog", out: 4.2, y: VERGE, speed: 1.5, start: 0.3, shadow: [0.32, 0.75] },
  { model: "cow", kind: "cow", out: 2.6, y: ROAD, speed: -0.2, start: 0.42, shadow: [0.7, 1.7] },
  { model: "auto", kind: "vehicle", out: 1.35, y: ROAD, speed: 2.6, start: 0.05, shadow: [1.4, 2.7], wheel: 0.2 },
  { model: "scooter", kind: "vehicle", out: 3.45, y: ROAD, speed: -3.2, start: 0.7, shadow: [0.55, 1.6], wheel: 0.22 },
];
export const BIRDS = 3;

export type Pose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0..1 shrink at the band ends (the diorama edge). */
  scale: number;
  /** Part name suffix → [rx, ry, rz] local rotation (radians). */
  parts: Record<string, [number, number, number]>;
  /** Extra vertical bob of the whole actor. */
  bob: number;
};

const wrap = (v: number, lo: number, hi: number) => lo + ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance a cow has ambled by time t: rests 9 s, ambles 5 s, repeat. */
export function cowTravel(t: number, offset = 0) {
  const period = 14,
    rest = 9;
  const tt = t + offset;
  const cycles = Math.floor(tt / period);
  return cycles * (period - rest) + Math.min(period - rest, Math.max(0, (tt % period) - rest));
}
export const cowAmbling = (t: number, offset = 0) => (t + offset) % 14 > 9;

export function streetFrame(project: Project) {
  const frame = roadFrame(project);
  const lo = frame.alongMin + 0.25,
    hi = frame.alongMax - 0.25;
  return { ...frame, lo, hi };
}

export function actorPose(project: Project, a: StreetActor, t: number, frame = streetFrame(project)): Pose {
  const { lo, hi } = frame;
  const span = hi - lo;
  const travelled = a.kind === "cow" ? Math.sign(a.speed) * cowTravel(t, a.start * 14) * Math.abs(a.speed) : a.speed * t;
  const s = wrap(lo + a.start * span + travelled, lo, hi);
  const [x, z] = frame.toPlot(s, a.out);
  const [x2, z2] = frame.toPlot(s + Math.sign(a.speed || 1), a.out);
  const yaw = Math.atan2(x2 - x, z2 - z);
  const scale = Math.min(smooth(lo, lo + 0.7, s), 1 - smooth(hi - 0.7, hi, s));
  const parts: Pose["parts"] = {};
  let bob = 0;
  const v = Math.abs(a.speed);
  if (a.kind === "walker") {
    const w = (v / 0.9) * Math.PI * 2;
    const p = Math.sin(t * w + a.start * 20);
    parts["leg-l"] = [p * 0.45, 0, 0];
    parts["leg-r"] = [-p * 0.45, 0, 0];
    parts["arm-l"] = [-p * 0.38, 0, 0];
    parts["arm-r"] = [p * 0.38, 0, 0];
    parts.head = [Math.sin(t * w * 0.5) * 0.04, Math.sin(t * 0.6 + a.start * 9) * 0.25, 0];
    bob = Math.abs(Math.cos(t * w + a.start * 20)) * 0.035;
  } else if (a.kind === "dog") {
    const w = (v / 0.55) * Math.PI * 2;
    const p = Math.sin(t * w);
    parts["leg-fl"] = [p * 0.6, 0, 0];
    parts["leg-br"] = [p * 0.6, 0, 0];
    parts["leg-fr"] = [-p * 0.6, 0, 0];
    parts["leg-bl"] = [-p * 0.6, 0, 0];
    parts.tail = [0.2, Math.sin(t * 11) * 0.6, 0];
    parts.head = [Math.sin(t * w) * 0.06, Math.sin(t * 0.9) * 0.3, 0];
    bob = Math.abs(Math.cos(t * w)) * 0.025;
  } else if (a.kind === "cow") {
    const moving = cowAmbling(t, a.start * 14);
    const w = 1.6 * Math.PI;
    const p = moving ? Math.sin(t * w) : 0;
    parts["leg-fl"] = [p * 0.22, 0, 0];
    parts["leg-br"] = [p * 0.22, 0, 0];
    parts["leg-fr"] = [-p * 0.22, 0, 0];
    parts["leg-bl"] = [-p * 0.22, 0, 0];
    // Lazily lowering the head and turning it now and then.
    parts.head = [moving ? 0.05 : 0.25 + Math.sin(t * 0.5) * 0.15, Math.sin(t * 0.23) * 0.35, 0];
    bob = moving ? Math.abs(Math.cos(t * w)) * 0.012 : 0;
  } else if (a.kind === "vehicle") {
    const spin = -(v * t) / (a.wheel ?? 0.2);
    for (const n of ["wheel-f", "wheel-r", "wheel-l"]) parts[n] = [spin, 0, 0];
    bob = Math.abs(Math.sin(t * 9 + a.start * 5)) * 0.012;
  }
  return { x, y: a.y, z, yaw, scale, parts, bob };
}

/** Birds circling high over the plot. */
export function birdPose(project: Project, i: number, t: number): Pose {
  const cx = project.plot.width / 200,
    cz = project.plot.depth / 200;
  const r = 5 + i * 1.6 + hash2(i, 1, 4) * 2;
  const w = (0.28 + i * 0.05) * (i % 2 ? -1 : 1);
  const a = t * w + i * 2.1;
  const x = cx + Math.cos(a) * r,
    z = cz + Math.sin(a) * r;
  // Tangent of the circle in the travel direction.
  const yaw = Math.atan2(-Math.sin(a) * Math.sign(w), Math.cos(a) * Math.sign(w));
  const flap = Math.sin(t * (9 + i)) * 0.55;
  const glide = Math.sin(t * 0.7 + i) > 0.3 ? 0.15 : 1;
  return {
    x,
    y: 8 + i * 0.9 + Math.sin(t * 0.8 + i) * 0.4,
    z,
    yaw,
    scale: 1,
    bob: 0,
    parts: { "wing-l": [0, 0, -flap * glide], "wing-r": [0, 0, flap * glide], body: [0, 0, -Math.sign(w) * 0.25] },
  };
}

/** Deterministic grass tufts / roadside plants along the verges and lawn edges. */
export function greenery(project: Project, obstacles: { x0: number; x1: number; z0: number; z1: number }[]) {
  const frame = roadFrame(project);
  const tufts: { x: number; y: number; z: number; s: number; yaw: number; shade: number }[] = [];
  const plants: { x: number; y: number; z: number; s: number; flower: number }[] = [];
  const len = frame.alongMax - frame.alongMin;
  const n = Math.round(len / 0.45);
  for (let i = 0; i < n; i++) {
    const along = frame.alongMin + 0.2 + (i + hash2(i, 2, 31)) * (len - 0.4) / n;
    const out = 4.08 + hash2(i, 3, 31) * 0.28;
    const [x, z] = frame.toPlot(along, out);
    tufts.push({ x, y: 0.038, z, s: 0.7 + hash2(i, 4, 31) * 0.7, yaw: hash2(i, 5, 31) * 6.28, shade: hash2(i, 6, 31) });
    if (hash2(i, 7, 31) > 0.78) {
      const [px, pz] = frame.toPlot(along + 0.15, 4.25);
      plants.push({ x: px, y: 0.038, z: pz, s: 0.8 + hash2(i, 8, 31) * 0.5, flower: hash2(i, 9, 31) });
    }
    // Weeds where the pavement meets the plot.
    if (hash2(i, 10, 31) > 0.55) {
      const [qx, qz] = frame.toPlot(along, -0.05 - hash2(i, 11, 31) * 0.2);
      if (!obstacles.some((o) => qx > o.x0 && qx < o.x1 && qz > o.z0 && qz < o.z1))
        tufts.push({ x: qx, y: 0.038, z: qz, s: 0.6 + hash2(i, 12, 31) * 0.5, yaw: hash2(i, 13, 31) * 6.28, shade: hash2(i, 14, 31) });
    }
  }
  // Lawn edges along the side boundaries.
  const w = project.plot.width / 100,
    d = project.plot.depth / 100;
  const sides: [number, number, number, number][] = [
    [0.32, 0.4, 0.32, d - 0.4],
    [w - 0.32, 0.4, w - 0.32, d - 0.4],
    [0.4, 0.32, w - 0.4, 0.32],
    [0.4, d - 0.32, w - 0.4, d - 0.32],
  ];
  sides.forEach(([x0, z0, x1, z1], k) => {
    const l = Math.hypot(x1 - x0, z1 - z0);
    const m = Math.round(l / 0.6);
    for (let i = 0; i < m; i++) {
      const t = (i + hash2(i, k, 37)) / m;
      const x = x0 + (x1 - x0) * t + (hash2(i, k + 9, 37) - 0.5) * 0.2,
        z = z0 + (z1 - z0) * t + (hash2(i, k + 19, 37) - 0.5) * 0.2;
      if (obstacles.some((o) => x > o.x0 - 0.1 && x < o.x1 + 0.1 && z > o.z0 - 0.1 && z < o.z1 + 0.1)) continue;
      tufts.push({ x, y: 0.038, z, s: 0.6 + hash2(i, k + 29, 37) * 0.6, yaw: hash2(i, k + 39, 37) * 6.28, shade: hash2(i, k + 49, 37) });
    }
  });
  return { tufts, plants };
}
