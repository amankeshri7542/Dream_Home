import type { Project, Rect } from "./types";
export const snap = (n: number) => Math.round(n / 10) * 10;
export const rect = (x: number, z: number, w: number, d: number): Rect => ({
  x,
  z,
  w,
  d,
});
export const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d;
export const contains = (a: Rect, b: Rect) =>
  b.x >= a.x && b.z >= a.z && b.x + b.w <= a.x + a.w && b.z + b.d <= a.z + a.d;
export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
export const inside = (r: Rect, x: number, z: number) =>
  x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d;
export const snappedRect = (r: Rect): Rect => ({
  x: snap(r.x),
  z: snap(r.z),
  w: snap(r.w),
  d: snap(r.d),
});
export const validRect = (r: Rect, min = 10) =>
  [r.x, r.z, r.w, r.d].every(
    (n) =>
      Number.isInteger(n) &&
      Number.isFinite(n) &&
      n % 10 === 0 &&
      Math.abs(n) <= 10000,
  ) &&
  r.w >= min &&
  r.d >= min;
export const componentIds = (p: Project) =>
  new Set([
    ...p.units.map((u) => u.id),
    ...p.verticalSpaces.map((v) => v.id),
    ...p.floors.flatMap((f) => [
      f.id,
      ...f.rooms.map((r) => r.id),
      ...f.balconies.map((b) => b.id),
    ]),
  ]);
export function allocateId(seed: string, used: Set<string>): string {
  let id = seed,
    suffix = 2;
  while (used.has(id)) id = `${seed}-${suffix++}`;
  used.add(id);
  return id;
}
export function freeRect(
  envelope: Rect,
  obstacles: Rect[],
  w: number,
  d: number,
): Rect | undefined {
  const xs = [
    ...new Set([envelope.x, ...obstacles.map((r) => r.x + r.w)]),
  ].sort((a, b) => a - b);
  const zs = [
    ...new Set([envelope.z, ...obstacles.map((r) => r.z + r.d)]),
  ].sort((a, b) => a - b);
  for (const z of zs)
    for (const x of xs) {
      const r = { x, z, w, d };
      if (contains(envelope, r) && !obstacles.some((o) => overlaps(o, r)))
        return r;
    }
  return undefined;
}
