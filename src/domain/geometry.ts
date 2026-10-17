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
    ...(p.stagedRooms ?? []).flatMap((item) => [
      item.room.id,
      ...(item.room.furniture ?? []).map((f) => f.id),
    ]),
    ...(p.landscape ?? []).map((l) => l.id),
    ...p.floors.flatMap((f) => [
      f.id,
      ...f.rooms.flatMap((r) => [r.id, ...(r.furniture ?? []).map((i) => i.id)]),
      ...f.balconies.map((b) => b.id),
      ...(f.openings ?? []).map((o) => o.id),
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
/** Gaps narrower than this between a room and a wall can't be walked through. */
export const SLIVER = 80;
/**
 * The best free spot for a w×d rectangle: snug against walls and rooms, never
 * leaving a strip too narrow to walk (a sliver) beside it; top-left on ties.
 */
export function snugRect(
  envelope: Rect,
  obstacles: Rect[],
  w: number,
  d: number,
): Rect | undefined {
  const xs = [
    ...new Set([
      envelope.x,
      envelope.x + envelope.w - w,
      ...obstacles.flatMap((r) => [r.x + r.w, r.x - w]),
    ]),
  ];
  const zs = [
    ...new Set([
      envelope.z,
      envelope.z + envelope.d - d,
      ...obstacles.flatMap((r) => [r.z + r.d, r.z - d]),
    ]),
  ];
  const sideGap = (r: Rect, side: "w" | "e" | "n" | "s") => {
    const horizontal = side === "w" || side === "e";
    const limits = obstacles
      .filter((o) =>
        horizontal
          ? o.z < r.z + r.d && o.z + o.d > r.z && (side === "w" ? o.x + o.w <= r.x : o.x >= r.x + r.w)
          : o.x < r.x + r.w && o.x + o.w > r.x && (side === "n" ? o.z + o.d <= r.z : o.z >= r.z + r.d),
      )
      .map((o) => (side === "w" ? r.x - (o.x + o.w) : side === "e" ? o.x - (r.x + r.w) : side === "n" ? r.z - (o.z + o.d) : o.z - (r.z + r.d)));
    const wall =
      side === "w" ? r.x - envelope.x : side === "e" ? envelope.x + envelope.w - (r.x + r.w) : side === "n" ? r.z - envelope.z : envelope.z + envelope.d - (r.z + r.d);
    return Math.min(wall, ...limits);
  };
  let best: { r: Rect; score: number } | undefined;
  for (const z of zs)
    for (const x of xs) {
      const r = { x, z, w, d };
      if (!contains(envelope, r) || obstacles.some((o) => overlaps(o, r))) continue;
      let score = 0;
      for (const side of ["w", "e", "n", "s"] as const) {
        const gap = sideGap(r, side);
        score += gap === 0 ? -2 : gap < SLIVER ? 5 : 0;
      }
      if (!best || score < best.score || (score === best.score && (z < best.r.z || (z === best.r.z && x < best.r.x))))
        best = { r, score };
    }
  return best?.r;
}
/** Counts every component id in the project (for uniqueness checks). */
export function idCounts(project: Project): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  project.units.forEach((u) => add(u.id));
  project.verticalSpaces.forEach((v) => add(v.id));
  (project.landscape ?? []).forEach((l) => add(l.id));
  for (const s of project.stagedRooms ?? []) {
    add(s.room.id);
    (s.room.furniture ?? []).forEach((f) => add(f.id));
  }
  for (const f of project.floors) {
    add(f.id);
    for (const r of f.rooms) {
      add(r.id);
      (r.furniture ?? []).forEach((i) => add(i.id));
    }
    f.balconies.forEach((b) => add(b.id));
    (f.openings ?? []).forEach((o) => add(o.id));
  }
  return counts;
}
