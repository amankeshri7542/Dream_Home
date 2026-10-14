// Pure transform previews for direct manipulation. Previews call the same
// domain command used to commit, so a preview and its release always agree.
import { balconyBounds, deriveFloorVoids } from "../domain/core";
import { transformComponent } from "../domain/model";
import { resizeBounds, type ResizeHandle } from "../domain/resize";
import type { EditIssue, EditResult, Project, Rect } from "../domain/types";

export type SnapCandidate = {
  axis: "x" | "z";
  value: number;
  kind: "edge" | "centre";
  sourceId: string;
  span: [number, number];
};
export type SnapLock = { x?: number; z?: number };
export type SnapGuide = {
  axis: "x" | "z";
  value: number;
  from: number;
  to: number;
};
export type PreviewStatus = "valid" | "snap" | "blocked";
export type TransformPreview = {
  bounds: Rect;
  guides: SnapGuide[];
  lock: SnapLock;
  result: EditResult;
  status: PreviewStatus;
  issue?: EditIssue;
};
export const GRID = 10;
const grid = (n: number) => Math.round(n / GRID) * GRID;

/** Edges and centres of everything on the floor except the moving item. */
export function snapCandidates(
  project: Project,
  floorId: string,
  excludeId: string,
): SnapCandidate[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const rects: { id: string; r: Rect; centre: boolean }[] = [
    { id: "footprint", r: floor.footprint, centre: true },
    ...floor.rooms.map((room) => ({ id: room.id, r: room.bounds, centre: true })),
    ...floor.unitAreas.map((a) => ({ id: a.unitId, r: a.bounds, centre: false })),
    ...deriveFloorVoids(project, floorId).map((v) => ({
      id: v.id,
      r: v.bounds,
      centre: true,
    })),
    ...floor.balconies.map((b) => ({
      id: b.id,
      r: balconyBounds(floor, b),
      centre: false,
    })),
  ].filter((item) => item.id !== excludeId);
  const out: SnapCandidate[] = [];
  for (const { id, r, centre } of rects) {
    const xs: [number, "edge" | "centre"][] = [
      [r.x, "edge"],
      [r.x + r.w, "edge"],
      ...(centre ? ([[r.x + r.w / 2, "centre"]] as [number, "centre"][]) : []),
    ];
    const zs: [number, "edge" | "centre"][] = [
      [r.z, "edge"],
      [r.z + r.d, "edge"],
      ...(centre ? ([[r.z + r.d / 2, "centre"]] as [number, "centre"][]) : []),
    ];
    for (const [value, kind] of xs)
      out.push({ axis: "x", value, kind, sourceId: id, span: [r.z, r.z + r.d] });
    for (const [value, kind] of zs)
      out.push({ axis: "z", value, kind, sourceId: id, span: [r.x, r.x + r.w] });
  }
  return out;
}

type Moving = { left: boolean; right: boolean; top: boolean; bottom: boolean };
type SnapOptions = { attract: number; release: number; lock?: SnapLock };

function snapAxis(
  r: Rect,
  axis: "x" | "z",
  moving: Moving,
  candidates: SnapCandidate[],
  opts: SnapOptions,
): { delta: number; locked?: number; guide?: SnapCandidate } {
  const start = axis === "x" ? r.x : r.z,
    size = axis === "x" ? r.w : r.d;
  const lowMoves = axis === "x" ? moving.left : moving.top,
    highMoves = axis === "x" ? moving.right : moving.bottom;
  const anchors: { offset: number; kind: "edge" | "centre" }[] = [];
  if (lowMoves) anchors.push({ offset: 0, kind: "edge" });
  if (highMoves) anchors.push({ offset: size, kind: "edge" });
  if (lowMoves && highMoves) anchors.push({ offset: size / 2, kind: "centre" });
  let best: { delta: number; value: number; c: SnapCandidate } | undefined;
  for (const c of candidates) {
    if (c.axis !== axis) continue;
    for (const a of anchors) {
      if ((a.kind === "centre") !== (c.kind === "centre")) continue;
      const delta = c.value - (start + a.offset);
      const locked = opts.lock?.[axis] === c.value;
      const limit = locked ? opts.release : opts.attract;
      if (Math.abs(delta) > limit) continue;
      if (
        !best ||
        Math.abs(delta) < Math.abs(best.delta) - 0.001 ||
        (Math.abs(Math.abs(delta) - Math.abs(best.delta)) < 0.001 &&
          (c.kind === "edge" && best.c.kind === "centre" ? true : c.value < best.c.value))
      )
        best = { delta, value: c.value, c };
    }
  }
  return best
    ? { delta: best.delta, locked: best.value, guide: best.c }
    : { delta: 0 };
}

/** Grid-snaps a rectangle, then attracts its moving edges/centre to candidates. */
export function snapRect(
  r: Rect,
  moving: Moving,
  candidates: SnapCandidate[],
  opts: SnapOptions,
): { bounds: Rect; guides: SnapGuide[]; lock: SnapLock } {
  let bounds = { x: grid(r.x), z: grid(r.z), w: grid(r.w), d: grid(r.d) };
  const all = moving.left && moving.right && moving.top && moving.bottom;
  if (all) bounds = { ...bounds, w: r.w, d: r.d };
  const guides: SnapGuide[] = [];
  const lock: SnapLock = {};
  for (const axis of ["x", "z"] as const) {
    const s = snapAxis(bounds, axis, moving, candidates, opts);
    if (!s.guide) continue;
    const delta = s.delta;
    lock[axis] = s.locked;
    const low = axis === "x" ? moving.left : moving.top,
      high = axis === "x" ? moving.right : moving.bottom;
    if (axis === "x") {
      if (low && high) bounds.x += delta;
      else if (low) {
        bounds.x += delta;
        bounds.w -= delta;
      } else bounds.w += delta;
    } else {
      if (low && high) bounds.z += delta;
      else if (low) {
        bounds.z += delta;
        bounds.d -= delta;
      } else bounds.d += delta;
    }
    const along = axis === "x" ? [bounds.z, bounds.z + bounds.d] : [bounds.x, bounds.x + bounds.w];
    guides.push({
      axis,
      value: s.guide.value,
      from: Math.min(along[0], s.guide.span[0]) - 40,
      to: Math.max(along[1], s.guide.span[1]) + 40,
    });
  }
  // Domain rectangles live on the 10 cm grid; snaps that land off-grid round.
  bounds = { x: grid(bounds.x), z: grid(bounds.z), w: grid(bounds.w), d: grid(bounds.d) };
  return { bounds, guides, lock };
}

const MOVE_ALL: Moving = { left: true, right: true, top: true, bottom: true };
function status(result: EditResult, snapped: boolean): PreviewStatus {
  if (!result.ok) return "blocked";
  return snapped ? "snap" : "valid";
}

export function previewMove(
  project: Project,
  floorId: string,
  id: string,
  original: Rect,
  delta: { dx: number; dz: number },
  opts: SnapOptions & { intent?: "strict" | "swap" },
): TransformPreview {
  const raw = {
    ...original,
    x: original.x + delta.dx,
    z: original.z + delta.dz,
  };
  const snapped = snapRect(raw, MOVE_ALL, snapCandidates(project, floorId, id), opts);
  const result = transformComponent(project, floorId, id, snapped.bounds, "move", {
    intent: opts.intent ?? "strict",
  });
  return {
    ...snapped,
    result,
    status: status(result, snapped.guides.length > 0),
    ...(!result.ok && result.issues?.[0] ? { issue: result.issues[0] } : {}),
  };
}

export function previewResize(
  project: Project,
  floorId: string,
  id: string,
  original: Rect,
  handle: ResizeHandle,
  delta: { dx: number; dz: number },
  opts: SnapOptions,
): TransformPreview {
  const raw = resizeBounds(original, handle, delta.dx, delta.dz);
  const moving: Moving = {
    left: handle.includes("w"),
    right: handle.includes("e"),
    top: handle.includes("n"),
    bottom: handle.includes("s"),
  };
  const snapped = snapRect(raw, moving, snapCandidates(project, floorId, id), opts);
  if (snapped.bounds.w < 120 || snapped.bounds.d < 120) snapped.bounds = raw;
  const result = transformComponent(project, floorId, id, snapped.bounds, "resize");
  return {
    ...snapped,
    result,
    status: status(result, snapped.guides.length > 0),
    ...(!result.ok && result.issues?.[0] ? { issue: result.issues[0] } : {}),
  };
}
