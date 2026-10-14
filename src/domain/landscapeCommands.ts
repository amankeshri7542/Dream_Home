// Garden commands. Each command turns the automatic garden into an explicit
// list first (accepting `auto:` ids), then validates via finalizeEdit.
// Positions are plot centimetres (item centre).
import "./features";
import { finalizeEdit } from "./edit";
import { allocateId, componentIds } from "./geometry";
import {
  findLandscapeSpot,
  landscapeCatalogItem,
  landscapeFootprint,
  landscapeLabel,
  materializeLandscape,
  nudgeLandscape,
  snap10,
} from "./landscape";
import { LIMITS } from "./limits";
import type { EditResult, LandscapeItem, Project, QuarterTurn } from "./types";

export type LandscapeAt = {
  x: number;
  z: number;
  rotation?: QuarterTurn;
  variant?: string;
};
const missingItem: EditResult = {
  ok: false,
  error: "That garden item no longer exists.",
};
function prepare(p: Project) {
  const { project, idMap } = materializeLandscape(p);
  return { p: project, items: project.landscape ?? [], idMap };
}
const withItems = (p: Project, landscape: LandscapeItem[]): Project => ({
  ...p,
  landscape,
});
function edit(
  p: Project,
  id: string,
  change: (item: LandscapeItem, items: LandscapeItem[]) => LandscapeItem | EditResult,
): EditResult {
  const prep = prepare(p);
  const real = prep.idMap.get(id) ?? id;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  const next = change(item, prep.items);
  if ("ok" in next) return next;
  return finalizeEdit(
    p,
    withItems(prep.p, prep.items.map((i) => (i.id === real ? next : i))),
    { focusId: real, subject: real },
  );
}

/** Turns the automatic garden into editable items. */
export function customizeLandscape(p: Project): EditResult {
  return finalizeEdit(p, prepare(p).p);
}
/** Returns the plot to the automatic garden. */
export function resetLandscape(p: Project): EditResult {
  if (!p.landscape) return { ok: true, project: p };
  const { landscape: _landscape, ...rest } = p;
  void _landscape;
  return finalizeEdit(p, rest);
}

export function addLandscape(
  p: Project,
  kind: string,
  at?: LandscapeAt,
): EditResult {
  const entry = landscapeCatalogItem(kind);
  if (!entry) return { ok: false, error: "Choose a garden item from the catalog." };
  const prep = prepare(p);
  if (prep.items.length >= LIMITS.landscapeItems)
    return { ok: false, error: "The garden already holds 120 items." };
  let size: { w: number; d: number } | null = null;
  let spot = at
    ? { x: snap10(at.x), z: snap10(at.z), rotation: at.rotation ?? (0 as QuarterTurn) }
    : findLandscapeSpot(prep.p, kind);
  // A pool, patio, path or bed that doesn't fit at its usual size tries
  // smaller sizes before giving up, so small gardens still get one.
  if (!spot && !at && entry.resizable) {
    const [wMin] = entry.resizable.w,
      [dMin] = entry.resizable.d;
    for (const scale of [0.8, 0.65, 0.5, 0]) {
      const w = Math.max(wMin, snap10(entry.size.w * scale)),
        d = Math.max(dMin, snap10(entry.size.d * scale));
      spot = findLandscapeSpot(prep.p, kind, { w, d });
      if (spot) {
        size = { w, d };
        break;
      }
    }
  }
  if (!spot)
    return {
      ok: false,
      error: `There's no free space on the plot for a ${entry.label.toLowerCase()}. Try My plot to make the garden bigger, or move something out of the way.`,
    };
  const id = allocateId(kind, componentIds(prep.p));
  // Trees start medium-sized; other styled items take their first style.
  const variant =
    at?.variant ??
    (entry.variants?.includes("m") ? "m" : entry.variants?.[0]);
  const item: LandscapeItem = {
    id,
    kind,
    ...spot,
    ...(size ?? {}),
    ...(variant !== undefined ? { variant } : {}),
  };
  return finalizeEdit(p, withItems(prep.p, [...prep.items, item]), {
    focusId: id,
    subject: id,
  });
}
export function moveLandscape(
  p: Project,
  id: string,
  to: { x: number; z: number },
): EditResult {
  return edit(p, id, (item) => ({ ...item, x: snap10(to.x), z: snap10(to.z) }));
}
/** Resizes a resizable item (paths, beds, hedges, pools, patios), centred. */
export function resizeLandscape(
  p: Project,
  id: string,
  size: { w?: number; d?: number },
): EditResult {
  return edit(p, id, (item) => {
    const entry = landscapeCatalogItem(item.kind);
    if (!entry?.resizable)
      return { ok: false, error: `${landscapeLabel(item.kind)} has a fixed size.` };
    const next = { ...item };
    for (const key of ["w", "d"] as const) {
      const value = size[key];
      if (value === undefined) continue;
      const v = snap10(value);
      if (v === entry.footprint[key]) delete next[key];
      else next[key] = v;
    }
    return next;
  });
}
/** Turns a rotatable item a quarter turn (dir 1 clockwise). */
export function rotateLandscape(p: Project, id: string, dir: 1 | -1 = 1): EditResult {
  return edit(p, id, (item) => {
    if (!landscapeCatalogItem(item.kind)?.rotatable)
      return { ok: false, error: `${landscapeLabel(item.kind)} can't be turned.` };
    return {
      ...item,
      rotation: ((item.rotation + (dir === 1 ? 90 : 270)) % 360) as QuarterTurn,
    };
  });
}
/** Changes an item's style variant (tree size, flower colour); null clears it. */
export function updateLandscape(
  p: Project,
  id: string,
  patch: { variant?: string | null },
): EditResult {
  return edit(p, id, (item) => {
    const next = { ...item };
    if (patch.variant === null) delete next.variant;
    else if (patch.variant !== undefined) next.variant = patch.variant;
    return next;
  });
}
/** Copies an item to the nearest free spot beside it. */
export function duplicateLandscape(p: Project, id: string): EditResult {
  const prep = prepare(p);
  const real = prep.idMap.get(id) ?? id;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  if (prep.items.length >= LIMITS.landscapeItems)
    return { ok: false, error: "The garden already holds 120 items." };
  const newId = allocateId(item.kind, componentIds(prep.p));
  const fp = landscapeFootprint(item);
  const copy = { ...item, id: newId };
  const spot =
    nudgeLandscape(prep.p, { ...copy, x: snap10(item.x + fp.w + 20) }, prep.items) ??
    nudgeLandscape(prep.p, { ...copy, z: snap10(item.z + fp.d + 20) }, prep.items) ??
    (() => {
      const found = findLandscapeSpot(prep.p, item.kind, {
        near: item,
        rotation: item.rotation,
        w: item.w,
        d: item.d,
      });
      return found ? { ...copy, ...found } : undefined;
    })();
  if (!spot)
    return {
      ok: false,
      error: `There's no free space for another ${landscapeLabel(item.kind).toLowerCase()}.`,
    };
  return finalizeEdit(p, withItems(prep.p, [...prep.items, spot]), {
    focusId: newId,
    subject: newId,
  });
}
export function removeLandscape(p: Project, id: string): EditResult {
  const prep = prepare(p);
  const real = prep.idMap.get(id) ?? id;
  if (!prep.items.some((i) => i.id === real)) return missingItem;
  return finalizeEdit(
    p,
    withItems(prep.p, prep.items.filter((i) => i.id !== real)),
  );
}
