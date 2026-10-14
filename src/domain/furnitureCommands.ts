// Furniture commands. Rooms on floors use their floor id; rooms in the tray use
// `floorId: null`. Each command turns the room's automatic layout into explicit
// items first (accepting `auto:` item ids), then validates via finalizeEdit.
// Positions are room-local centimetres (item centre from the room's NW corner).
import "./features";
import { roomDoorApproaches } from "./details";
import { finalizeEdit } from "./edit";
import {
  FURNITURE_WALL_GAP,
  clampInside,
  findRoom,
  fitsRoom,
  furnitureCatalogItem,
  furnitureMisfit,
  furnitureCollisions,
  furnitureFootprint,
  furnitureIdSeed,
  furnitureLabel,
  hasFurnitureParts,
  itemSize,
  materializeFurniture,
  nudgeFurniture,
  replaceRoom,
  roomWalls,
  snap5,
} from "./furniture";
import { allocateId, componentIds, overlaps } from "./geometry";
import { LIMITS } from "./limits";
import type {
  EditResult,
  FurnitureItem,
  Project,
  QuarterTurn,
  Rect,
  Room,
  Wall,
} from "./types";

export type FurnitureAt = { x: number; z: number; rotation?: QuarterTurn };
export type FurniturePatch = {
  /** A finish id from the item's catalog finishes; null clears it. */
  finish?: string | null;
  /** Stretch sizes (cm) for stretchable items. */
  w?: number;
  d?: number;
};

const missingRoom: EditResult = { ok: false, error: "Room not found." };
const missingItem: EditResult = {
  ok: false,
  error: "That piece of furniture no longer exists.",
};
function prepare(project: Project, floorId: string | null, roomId: string) {
  if (!findRoom(project, floorId, roomId)) return undefined;
  const { project: p, idMap } = materializeFurniture(project, floorId, roomId);
  const room = findRoom(p, floorId, roomId)!;
  return { p, room, items: room.furniture ?? [], idMap };
}
const withItems = (
  p: Project,
  floorId: string | null,
  room: Room,
  furniture: FurnitureItem[],
) => replaceRoom(p, floorId, { ...room, furniture });
const totalFurniture = (p: Project) =>
  p.floors.reduce(
    (sum, f) => sum + f.rooms.reduce((n, r) => n + (r.furniture?.length ?? 0), 0),
    0,
  ) +
  (p.stagedRooms ?? []).reduce((n, s) => n + (s.room.furniture?.length ?? 0), 0);
function roomFull(p: Project, items: readonly FurnitureItem[]): EditResult | undefined {
  if (items.length >= LIMITS.furniturePerRoom)
    return { ok: false, error: "This room already holds 32 pieces of furniture." };
  if (totalFurniture(p) >= LIMITS.furnitureTotal)
    return { ok: false, error: "This home already holds 800 pieces of furniture." };
  return undefined;
}

/**
 * A free, valid spot for a catalog item in a room (room-local centre). Items
 * that stand against a wall try each wall first, back to the wall; others
 * search outward from `near` (default: the room centre). Spots that keep door
 * approaches clear win over spots that block them.
 */
export function findFurnitureSpot(
  room: Room,
  catalogId: string,
  rotation?: QuarterTurn,
  opts: {
    walls?: readonly Wall[];
    near?: { x: number; z: number };
    exclude?: string;
    w?: number;
    d?: number;
  } = {},
): { x: number; z: number; rotation: QuarterTurn } | null {
  const entry = furnitureCatalogItem(catalogId);
  if (!entry) return null;
  const others = (room.furniture ?? []).filter((i) => i.id !== opts.exclude);
  const doors = roomDoorApproaches(room, opts.walls ?? []).map(
    (d): Rect => ({ ...d, x: d.x - room.bounds.x, z: d.z - room.bounds.z }),
  );
  const { w: W, d: D } = room.bounds,
    gap = FURNITURE_WALL_GAP;
  const near = opts.near ?? { x: W / 2, z: D / 2 };
  const base = {
    id: opts.exclude ?? "__candidate",
    catalogId,
    ...(opts.w !== undefined ? { w: opts.w } : {}),
    ...(opts.d !== undefined ? { d: opts.d } : {}),
  };
  const { w, d } = itemSize(base);
  const turns: QuarterTurn[] =
    rotation !== undefined ? [rotation] : entry.wallSnap ? [0, 90, 180, 270] : [0, 90];
  const range = (size: number, span: number) => {
    const lo = Math.ceil((gap + size / 2) / 5) * 5,
      hi = Math.floor((span - gap - size / 2) / 5) * 5,
      out: number[] = [];
    for (let v = lo; v <= hi; v += 5) out.push(v);
    return out;
  };
  const candidates: Array<FurnitureItem & { cost: number }> = [];
  for (const r of turns) {
    const fw = r % 180 ? d : w,
      fd = r % 180 ? w : d;
    const xs = range(fw, W),
      zs = range(fd, D);
    if (!xs.length || !zs.length) continue;
    const push = (x: number, z: number) =>
      candidates.push({
        ...base,
        x,
        z,
        rotation: r,
        cost: Math.hypot(x - near.x, z - near.z),
      });
    if (entry.wallSnap) {
      if (r === 0) xs.forEach((x) => push(x, zs[0]));
      else if (r === 180) xs.forEach((x) => push(x, zs.at(-1)!));
      else if (r === 90) zs.forEach((z) => push(xs.at(-1)!, z));
      else zs.forEach((z) => push(xs[0], z));
    } else
      for (let i = 0; i < xs.length; i += 2)
        for (let j = 0; j < zs.length; j += 2) push(xs[i], zs[j]);
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const free = candidates.filter(
    (c) => fitsRoom(room, furnitureFootprint(c)) && !furnitureCollisions(c, others).length,
  );
  const clear = free.find(
    (c) =>
      !entry.blocksWalk ||
      !doors.some((door) => overlaps(furnitureFootprint(c), door)),
  );
  const best = clear ?? free[0];
  return best ? { x: best.x, z: best.z, rotation: best.rotation } : null;
}

/** Turns a room's automatic furniture into editable pieces. */
export function customizeFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  return finalizeEdit(project, prep.p);
}
/** Returns a room to its automatic furniture. */
export function resetFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
): EditResult {
  const room = findRoom(project, floorId, roomId);
  if (!room) return missingRoom;
  if (!room.furniture) return { ok: true, project };
  const { furniture: _furniture, ...rest } = room;
  void _furniture;
  return finalizeEdit(project, replaceRoom(project, floorId, rest));
}
/** Empties a room (an explicit, empty furniture list). */
export function clearFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
): EditResult {
  const room = findRoom(project, floorId, roomId);
  if (!room) return missingRoom;
  return finalizeEdit(project, replaceRoom(project, floorId, { ...room, furniture: [] }));
}

export function addFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  catalogId: string,
  at?: FurnitureAt,
): EditResult {
  const entry = furnitureCatalogItem(catalogId);
  if (!entry || !hasFurnitureParts(catalogId))
    return { ok: false, error: "Choose furniture from the catalog." };
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const misfit = furnitureMisfit(catalogId, prep.room.kind);
  if (misfit) return { ok: false, error: misfit };
  const full = roomFull(prep.p, prep.items);
  if (full) return full;
  const spot = at
    ? { x: snap5(at.x), z: snap5(at.z), rotation: at.rotation ?? (0 as QuarterTurn) }
    : findFurnitureSpot(prep.room, catalogId, undefined, {
        walls: roomWalls(prep.p, floorId),
      });
  if (!spot)
    return {
      ok: false,
      error: `There's no free space for a ${entry.label.toLowerCase()} in ${prep.room.name}. Move something or choose a bigger room.`,
    };
  const id = allocateId(furnitureIdSeed(roomId, catalogId), componentIds(prep.p));
  const item: FurnitureItem = { id, catalogId, ...spot };
  return finalizeEdit(
    project,
    withItems(prep.p, floorId, prep.room, [...prep.items, item]),
    { focusId: id, subject: id },
  );
}

/**
 * Moves (and optionally turns) an item; `to.roomId` re-parents it into another
 * room on the same floor (or tray), with `x`/`z` local to that room.
 */
export function moveFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  itemId: string,
  to: { roomId?: string; x: number; z: number; rotation?: QuarterTurn },
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const real = prep.idMap.get(itemId) ?? itemId;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  const moved: FurnitureItem = {
    ...item,
    x: snap5(to.x),
    z: snap5(to.z),
    rotation: to.rotation ?? item.rotation,
  };
  if (!to.roomId || to.roomId === roomId)
    return finalizeEdit(
      project,
      withItems(
        prep.p,
        floorId,
        prep.room,
        prep.items.map((i) => (i.id === real ? moved : i)),
      ),
      { focusId: real, subject: real },
    );
  const without = withItems(
    prep.p,
    floorId,
    prep.room,
    prep.items.filter((i) => i.id !== real),
  );
  const target = prepare(without, floorId, to.roomId);
  if (!target) return missingRoom;
  const misfit = furnitureMisfit(item.catalogId, target.room.kind);
  if (misfit) return { ok: false, error: misfit };
  if (target.items.length >= LIMITS.furniturePerRoom)
    return { ok: false, error: `${target.room.name} already holds 32 pieces of furniture.` };
  return finalizeEdit(
    project,
    withItems(target.p, floorId, target.room, [...target.items, moved]),
    { focusId: real, subject: real },
  );
}

/** Turns an item a quarter turn about its centre (dir 1 clockwise). */
export function rotateFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  itemId: string,
  dir: 1 | -1 = 1,
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const real = prep.idMap.get(itemId) ?? itemId;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  const turned = clampInside(prep.room, {
    ...item,
    rotation: ((item.rotation + (dir === 1 ? 90 : 270)) % 360) as QuarterTurn,
  });
  const others = prep.items.filter((i) => i.id !== real);
  const next = nudgeFurniture(prep.room, turned, others) ?? turned;
  return finalizeEdit(
    project,
    withItems(prep.p, floorId, prep.room, prep.items.map((i) => (i.id === real ? next : i))),
    { focusId: real, subject: real },
  );
}

/** Changes an item's finish or stretch size (kept centred, inside the room). */
export function updateFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  itemId: string,
  patch: FurniturePatch,
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const real = prep.idMap.get(itemId) ?? itemId;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  const entry = furnitureCatalogItem(item.catalogId);
  let next: FurnitureItem = { ...item };
  if (patch.finish === null) delete next.finish;
  else if (patch.finish !== undefined) next.finish = patch.finish;
  for (const key of ["w", "d"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    const rounded = Math.round(value);
    if (entry && rounded === entry.size[key]) delete next[key];
    else next[key] = rounded;
  }
  if ((patch.w !== undefined || patch.d !== undefined) && !fitsRoom(prep.room, furnitureFootprint(next)))
    next = clampInside(prep.room, next);
  return finalizeEdit(
    project,
    withItems(prep.p, floorId, prep.room, prep.items.map((i) => (i.id === real ? next : i))),
    { focusId: real, subject: real },
  );
}

/** Copies an item to the nearest free spot beside it. */
export function duplicateFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  itemId: string,
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const real = prep.idMap.get(itemId) ?? itemId;
  const item = prep.items.find((i) => i.id === real);
  if (!item) return missingItem;
  const full = roomFull(prep.p, prep.items);
  if (full) return full;
  const id = allocateId(furnitureIdSeed(roomId, item.catalogId), componentIds(prep.p));
  const fp = furnitureFootprint(item);
  const copy = { ...item, id };
  const beside =
    nudgeFurniture(prep.room, clampInside(prep.room, { ...copy, x: item.x + fp.w + 10 }), prep.items) ??
    nudgeFurniture(prep.room, clampInside(prep.room, { ...copy, z: item.z + fp.d + 10 }), prep.items);
  const spot =
    beside ??
    (() => {
      const found = findFurnitureSpot(prep.room, item.catalogId, item.rotation, {
        near: { x: item.x, z: item.z },
        w: item.w,
        d: item.d,
      });
      return found ? { ...copy, ...found } : undefined;
    })();
  if (!spot)
    return {
      ok: false,
      error: `There's no free space for another ${furnitureLabel(item).toLowerCase()} in ${prep.room.name}.`,
    };
  return finalizeEdit(
    project,
    withItems(prep.p, floorId, prep.room, [...prep.items, spot]),
    { focusId: id, subject: id },
  );
}

export function removeFurniture(
  project: Project,
  floorId: string | null,
  roomId: string,
  itemId: string,
): EditResult {
  const prep = prepare(project, floorId, roomId);
  if (!prep) return missingRoom;
  const real = prep.idMap.get(itemId) ?? itemId;
  if (!prep.items.some((i) => i.id === real)) return missingItem;
  return finalizeEdit(
    project,
    withItems(prep.p, floorId, prep.room, prep.items.filter((i) => i.id !== real)),
  );
}
