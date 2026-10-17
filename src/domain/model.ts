// Registers opening/furniture/landscape/material rules and reconcilers.
import "./features";
import {
  ROOM_META,
  type Balcony,
  type EdgeSide,
  type EditIssue,
  type EditResult,
  type Floor,
  type PresetId,
  type Project,
  type Rect,
  type Room,
  type RoomKind,
  type Unit,
  type VerticalSpace,
} from "./types";
import {
  allocateId,
  componentIds,
  contains,
  snugRect,
  inside,
  overlaps,
  snap,
  snappedRect,
} from "./geometry";
import { createLegacyPreset } from "./legacy-presets";
import { migrateV1 } from "./migration";
import { LIMITS } from "./limits";
import {
  balconyBounds,
  deriveFloorVoids,
  floorForGeometry,
  replaceFloor,
  slabTiles,
} from "./core";
import { finalizeEdit } from "./edit";
import { fitFurniture, furnitureLabel } from "./furniture";
import { makeIssue } from "./issues";
import { validateProject } from "./validate";
import {
  checkFloorExtras,
  checkProjectExtras,
  checkRoomExtras,
  copyOpening,
  copyProjectExtras,
  copyRoomExtras,
} from "./persist";
export { migrateV1 } from "./migration";
export { LIMITS, getLimits } from "./limits";
export {
  balconyBounds,
  deriveFloorVoids,
  floorForGeometry,
  slabTiles,
} from "./core";
export { validateProject, validateProjectIssues } from "./validate";
export { deriveWalls, wallPieces } from "./walls";
export { finalizeEdit } from "./edit";
function roomPresentation(
  room: Room,
): Pick<Room, "furnishingRotation" | "floorFinish" | "furnishing"> {
  return {
    ...(room.furnishingRotation !== undefined
      ? { furnishingRotation: room.furnishingRotation }
      : {}),
    ...(room.floorFinish !== undefined
      ? { floorFinish: room.floorFinish }
      : {}),
    ...(room.furnishing !== undefined ? { furnishing: room.furnishing } : {}),
  };
}
export function createPreset(id: PresetId): Project {
  return migrateV1(createLegacyPreset(id));
}
export function updateRoom(
  project: Project,
  floorId: string,
  roomId: string,
  patch: Partial<Room>,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { ok: false, error: "Room not found." };
  if (patch.id !== undefined && patch.id !== room.id)
    return { ok: false, error: "A room ID cannot change." };
  return finalizeEdit(
    project,
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              ...patch,
              id: r.id,
              unitId: patch.unitId === undefined ? r.unitId : patch.unitId,
              bounds: patch.bounds ? snappedRect(patch.bounds) : r.bounds,
            }
          : r,
      ),
    }),
    { subject: roomId },
  );
}
export function defaultRoomUnit(floor: Floor): string | null {
  return floor.unitAreas.length === 1 ? floor.unitAreas[0].unitId : null;
}
export function moveRoomToUnit(
  project: Project,
  floorId: string,
  roomId: string,
  unitId: string | null,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return { ok: false, error: "Room not found." };
  if (room.unitId === unitId) return { ok: true, project };
  const withoutRoom = replaceFloor(project, {
    ...floor,
    rooms: floor.rooms.filter((r) => r.id !== roomId),
  });
  const bounds = findRoomPosition(
    withoutRoom,
    floorId,
    room.bounds.w,
    room.bounds.d,
    unitId,
  );
  if (!bounds)
    return {
      ok: false,
      error: `No clear place for ${room.name} in ${project.units.find((u) => u.id === unitId)?.name ?? "shared space"}. Move other rooms aside or enlarge that group's area first.`,
    };
  return updateRoom(project, floorId, roomId, { unitId, bounds });
}
export function findRoomPosition(
  project: Project,
  floorId: string,
  w: number,
  d: number,
  unitId: string | null,
): Rect | undefined {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return;
  const area =
    unitId === null
      ? floor.footprint
      : floor.unitAreas.find((a) => a.unitId === unitId)?.bounds;
  if (!area) return;
  const blockers = [
    ...floor.rooms.map((r) => r.bounds),
    ...deriveFloorVoids(project, floorId).map((v) => v.bounds),
    ...(unitId === null ? floor.unitAreas.map((a) => a.bounds) : []),
  ];
  return snugRect(area, blockers, w, d);
}
export function addRoom(
  project: Project,
  floorId: string,
  kind: RoomKind,
  unitId?: string | null,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor || !Object.keys(ROOM_META).includes(kind))
    return { ok: false, error: "Choose a valid floor and room type." };
  const unit = unitId === undefined ? defaultRoomUnit(floor) : unitId;
  const bounds = findRoomPosition(
    project,
    floorId,
    kind === "bathroom" ? 180 : 300,
    kind === "bathroom" ? 240 : 300,
    unit,
  );
  if (!bounds)
    return {
      ok: false,
      error:
        "No free space for this room in the selected unit. Move a room or enlarge its area.",
    };
  const room: Room = {
    id: allocateId(`room-${kind}`, componentIds(project)),
    name: ROOM_META[kind].label,
    kind,
    bounds,
    unitId: unit,
  };
  return finalizeEdit(project,
    replaceFloor(project, { ...floor, rooms: [...floor.rooms, room] }),
  );
}
export function removeRoom(
  project: Project,
  floorId: string,
  roomId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.rooms.some((r) => r.id === roomId))
    return { ok: false, error: "Room not found." };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.filter((r) => r.id !== roomId),
    }),
  );
}
export function updatePlot(
  project: Project,
  patch: Partial<Project["plot"]>,
): EditResult {
  const plot = { ...project.plot, ...patch };
  plot.width = Math.round(plot.width);
  plot.depth = Math.round(plot.depth);
  plot.setback = snap(plot.setback);
  return finalizeEdit(project, { ...project, plot });
}
export function setFloorCount(project: Project, count: number): EditResult {
  if (!Number.isInteger(count) || count < 1 || count > LIMITS.floors)
    return { ok: false, error: "Choose one to eight floors." };
  if (
    count > project.floors.length &&
    !project.verticalSpaces.some(
      (v) =>
        v.kind === "stairs" && v.floorIds.includes(project.floors.at(-1)!.id),
    )
  )
    return {
      ok: false,
      error:
        "Add a staircase connected to the top floor before adding another floor.",
    };
  const ids = componentIds(project),
    floors = project.floors.slice(0, count),
    units = [...project.units];
  let verticalSpaces = project.verticalSpaces
    .map((v) => ({
      ...v,
      floorIds: v.floorIds.filter((id) => floors.some((f) => f.id === id)),
    }))
    .filter((v) => v.floorIds.length);
  while (floors.length < count) {
    const source = floors.at(-1)!,
      index = floors.length,
      id = allocateId(`floor-${index}`, ids),
      unitMap = new Map<string, string>();
    for (const area of source.unitAreas) {
      const sharedAcrossFloors =
        floors.filter((f) => f.unitAreas.some((a) => a.unitId === area.unitId))
          .length > 1;
      const privateCore = verticalSpaces.some(
        (v) => v.unitId === area.unitId && v.floorIds.includes(source.id),
      );
      if (sharedAcrossFloors || privateCore) {
        unitMap.set(area.unitId, area.unitId);
        continue;
      }
      const old = units.find((u) => u.id === area.unitId)!,
        newId = allocateId(`unit-${index}`, ids);
      units.push({
        ...old,
        id: newId,
        name: `${old.name.slice(0, 64)} · Floor ${index}`,
      });
      unitMap.set(old.id, newId);
    }
    const { openings: _sourceOpenings, ...sourceFloor } = source;
    void _sourceOpenings; // A new storey starts with automatic doors and windows.
    floors.push({
      ...sourceFloor,
      id,
      name: `Floor ${index}`,
      elevation: index * 300,
      footprint: { ...source.footprint },
      balconies: [],
      unitAreas: source.unitAreas.map((a) => ({
        unitId: unitMap.get(a.unitId)!,
        bounds: { ...a.bounds },
      })),
      rooms: source.rooms.map((r, i) => {
        const roomId = allocateId(`${id}-room-${i}`, ids);
        return {
          ...r,
          id: roomId,
          unitId: r.unitId === null ? null : unitMap.get(r.unitId)!,
          bounds: { ...r.bounds },
          ...(r.furniture
            ? {
                furniture: r.furniture.map((item) => ({
                  ...item,
                  id: allocateId(`${roomId}-${item.catalogId}`, ids),
                })),
              }
            : {}),
        };
      }),
    });
    verticalSpaces = verticalSpaces.map((v) =>
      v.floorIds.at(-1) === source.id
        ? { ...v, floorIds: [...v.floorIds, id] }
        : v,
    );
  }
  const usedUnits = new Set([
    ...floors.flatMap((f) => f.unitAreas.map((a) => a.unitId)),
    ...verticalSpaces.flatMap((v) => (v.unitId ? [v.unitId] : [])),
  ]);
  return finalizeEdit(project, {
    ...project,
    floors,
    verticalSpaces,
    units: units.filter((u) => usedUnits.has(u.id)),
  });
}
export function addBalcony(
  project: Project,
  floorId: string,
  config: Partial<Omit<Balcony, "id">> = {},
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  const edge = config.edge ?? "south",
    span =
      edge === "north" || edge === "south"
        ? floor.footprint.w
        : floor.footprint.d;
  const width = config.width ?? Math.min(360, span);
  const b: Balcony = {
    id: allocateId("balcony", componentIds(project)),
    edge,
    offset: config.offset ?? snap((span - width) / 2),
    width,
    depth: config.depth ?? 150,
  };
  return finalizeEdit(project,
    replaceFloor(project, { ...floor, balconies: [...floor.balconies, b] }),
  );
}
export function updateBalcony(
  project: Project,
  floorId: string,
  id: string,
  patch: Partial<Omit<Balcony, "id">>,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    balcony = floor?.balconies.find((b) => b.id === id);
  if (!floor || !balcony) return { ok: false, error: "Balcony not found." };
  const next = { ...balcony, ...patch, id };
  next.offset = snap(next.offset);
  next.width = snap(next.width);
  next.depth = snap(next.depth);
  if (patch.edge !== undefined && patch.edge !== balcony.edge) {
    const span =
      next.edge === "north" || next.edge === "south"
        ? floor.footprint.w
        : floor.footprint.d;
    next.offset = Math.max(0, Math.min(span - next.width, next.offset));
  }
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      balconies: floor.balconies.map((b) => (b.id === id ? next : b)),
    }),
  );
}
export function removeBalcony(
  project: Project,
  floorId: string,
  id: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.balconies.some((b) => b.id === id))
    return { ok: false, error: "Balcony not found." };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      balconies: floor.balconies.filter((b) => b.id !== id),
    }),
  );
}
function verticalBlocker(
  project: Project,
  space: VerticalSpace,
): string | undefined {
  for (const floor of project.floors.filter((f) =>
    space.floorIds.includes(f.id),
  )) {
    if (!contains(floor.footprint, space.bounds))
      return `${floor.name}: the ${space.kind === "stairs" ? "staircase" : "courtyard"} would leave the building boundary.`;
    const room = floor.rooms.find((r) => overlaps(r.bounds, space.bounds));
    if (room)
      return `${floor.name}: ${room.name} blocks this ${space.kind === "stairs" ? "staircase" : "courtyard"} position.`;
    const other = project.verticalSpaces.find(
      (v) =>
        v.id !== space.id &&
        v.floorIds.includes(floor.id) &&
        overlaps(v.bounds, space.bounds),
    );
    if (other)
      return `${floor.name}: another ${other.kind === "stairs" ? "staircase" : "courtyard"} blocks this position.`;
    const area =
      space.unitId === null
        ? floor.unitAreas.find((a) => overlaps(a.bounds, space.bounds))
        : undefined;
    if (area)
      return `${floor.name}: ${project.units.find((u) => u.id === area.unitId)?.name ?? "a private unit"} blocks this shared space.`;
  }
  return undefined;
}
export function addVerticalSpace(
  project: Project,
  config: Omit<VerticalSpace, "id">,
): EditResult {
  const space: VerticalSpace = {
    ...config,
    id: allocateId(config.kind, componentIds(project)),
    bounds: snappedRect(config.bounds),
    floorIds: [...config.floorIds],
  };
  const blocked = verticalBlocker(project, space);
  if (blocked) return { ok: false, error: blocked };
  return finalizeEdit(project, {
    ...project,
    verticalSpaces: [...project.verticalSpaces, space],
  });
}
export function updateVerticalSpace(
  project: Project,
  id: string,
  patch: Partial<Omit<VerticalSpace, "id">>,
): EditResult {
  const old = project.verticalSpaces.find((v) => v.id === id);
  if (!old) return { ok: false, error: "Vertical space not found." };
  const next = {
    ...old,
    ...patch,
    id,
    bounds: patch.bounds ? snappedRect(patch.bounds) : old.bounds,
    floorIds: patch.floorIds ? [...patch.floorIds] : old.floorIds,
  };
  const blocked = verticalBlocker(project, next);
  if (blocked) return { ok: false, error: blocked };
  return finalizeEdit(project, {
    ...project,
    verticalSpaces: project.verticalSpaces.map((v) => (v.id === id ? next : v)),
  });
}
export function removeVerticalSpace(project: Project, id: string): EditResult {
  if (!project.verticalSpaces.some((v) => v.id === id))
    return { ok: false, error: "Vertical space not found." };
  return finalizeEdit(project, {
    ...project,
    verticalSpaces: project.verticalSpaces.filter((v) => v.id !== id),
  });
}
export function addUnitArea(
  project: Project,
  floorId: string,
  unit: Omit<Unit, "id">,
  bounds: Rect,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  const id = allocateId("unit", componentIds(project));
  return finalizeEdit(project, {
    ...replaceFloor(project, {
      ...floor,
      unitAreas: [
        ...floor.unitAreas,
        { unitId: id, bounds: snappedRect(bounds) },
      ],
    }),
    units: [...project.units, { ...unit, id }],
  });
}
export function updateUnitArea(
  project: Project,
  floorId: string,
  unitId: string,
  bounds: Rect,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.unitAreas.some((a) => a.unitId === unitId))
    return { ok: false, error: "Unit area not found." };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      unitAreas: floor.unitAreas.map((a) =>
        a.unitId === unitId ? { ...a, bounds: snappedRect(bounds) } : a,
      ),
    }),
  );
}
export function removeUnitArea(
  project: Project,
  floorId: string,
  unitId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.unitAreas.some((a) => a.unitId === unitId))
    return { ok: false, error: "Unit area not found." };
  if (
    floor.rooms.some((r) => r.unitId === unitId) ||
    project.verticalSpaces.some(
      (v) => v.unitId === unitId && v.floorIds.includes(floorId),
    )
  )
    return {
      ok: false,
      error:
        "Move or reassign this unit’s rooms and vertical spaces before removing its area.",
    };
  const next = replaceFloor(project, {
    ...floor,
    unitAreas: floor.unitAreas.filter((a) => a.unitId !== unitId),
  });
  return finalizeEdit(project, {
    ...next,
    units: next.units.filter(
      (u) =>
        u.id !== unitId ||
        next.floors.some((f) => f.unitAreas.some((a) => a.unitId === u.id)),
    ),
  });
}
export function renameUnit(
  project: Project,
  unitId: string,
  name: string,
): EditResult {
  if (!project.units.some((u) => u.id === unitId))
    return { ok: false, error: "Unit not found." };
  return finalizeEdit(project, {
    ...project,
    units: project.units.map((u) => (u.id === unitId ? { ...u, name } : u)),
  });
}
export function assignRoomToUnit(
  project: Project,
  floorId: string,
  roomId: string,
  unitId: string | null,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.rooms.some((r) => r.id === roomId))
    return { ok: false, error: "Room not found." };
  return finalizeEdit(project,
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) => (r.id === roomId ? { ...r, unitId } : r)),
    }),
  );
}
export function componentBounds(
  project: Project,
  floorId: string,
  id: string,
): Rect | null {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return null;
  const room = floor.rooms.find((r) => r.id === id);
  if (room) return { ...room.bounds };
  const balcony = floor.balconies.find((b) => b.id === id);
  if (balcony) return balconyBounds(floor, balcony);
  const core = project.verticalSpaces.find(
    (v) => v.id === id && v.floorIds.includes(floorId),
  );
  return core ? { ...core.bounds } : null;
}
/**
 * Swaps what two rooms are used for: kind, name and furnishing (explicit
 * furniture, furnishing mode and rotation) follow the use, refitted to the
 * other room; geometry, ids, units and floor/wall finishes stay put.
 */
export function swapRoomUses(
  project: Project,
  floorId: string,
  sourceId: string,
  targetId: string,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    a = floor?.rooms.find((r) => r.id === sourceId),
    b = floor?.rooms.find((r) => r.id === targetId);
  if (!floor || !a || !b)
    return { ok: false, error: "Both rooms must exist on the selected floor." };
  const notices: EditIssue[] = [];
  const takeUse = (room: Room, from: Room): Room => {
    const {
      furniture: _furniture,
      furnishing: _furnishing,
      furnishingRotation: _rotation,
      ...rest
    } = room;
    void [_furniture, _furnishing, _rotation];
    const next: Room = {
      ...rest,
      kind: from.kind,
      name: from.name,
      ...(from.furnishingRotation !== undefined
        ? { furnishingRotation: from.furnishingRotation }
        : {}),
      ...(from.furnishing !== undefined ? { furnishing: from.furnishing } : {}),
    };
    if (!from.furniture) return next;
    const fitted = fitFurniture(next, from.furniture);
    for (const item of fitted.removed)
      notices.push(
        makeIssue(
          "furniture-removed",
          `${furnitureLabel(item)} didn't fit in its new room, so it was removed.`,
          {
            severity: "notice",
            source: { kind: "furniture", id: item.id, floorId, roomId: room.id },
            floorIds: [floorId],
          },
        ),
      );
    return { ...next, furniture: fitted.items };
  };
  return finalizeEdit(
    project,
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) =>
        r.id === a.id ? takeUse(r, b) : r.id === b.id ? takeUse(r, a) : r,
      ),
    }),
    { notices },
  );
}
export function moveRoomSmart(
  project: Project,
  floorId: string,
  roomId: string,
  bounds: Rect,
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId),
    source = floor?.rooms.find((r) => r.id === roomId),
    target = snappedRect(bounds);
  if (
    floor &&
    source &&
    target.w === source.bounds.w &&
    target.d === source.bounds.d
  ) {
    const x = target.x + target.w / 2,
      z = target.z + target.d / 2;
    const others = floor.rooms.filter(
      (r) => r.id !== roomId && inside(r.bounds, x, z),
    );
    if (others.length === 1)
      return swapRoomUses(project, floorId, roomId, others[0].id);
  }
  return updateRoom(project, floorId, roomId, { bounds: target });
}
/** A physical move that never swaps uses; a drop onto one room offers a swap. */
export function moveRoomStrict(
  project: Project,
  floorId: string,
  roomId: string,
  bounds: Rect,
): EditResult {
  const result = updateRoom(project, floorId, roomId, { bounds });
  if (result.ok || !result.issues) return result;
  const floor = project.floors.find((f) => f.id === floorId)!,
    target = snappedRect(bounds),
    x = target.x + target.w / 2,
    z = target.z + target.d / 2;
  const under = floor.rooms.filter(
    (r) => r.id !== roomId && inside(r.bounds, x, z),
  );
  if (under.length !== 1) return result;
  return {
    ...result,
    issues: result.issues.map((issue) =>
      issue.code === "room-overlap" &&
      issue.source?.id === roomId &&
      issue.blockers.some((b) => b.id === under[0].id)
        ? {
            ...issue,
            fixes: [
              {
                kind: "swap-uses",
                floorId,
                sourceId: roomId,
                targetId: under[0].id,
              },
              ...issue.fixes,
            ],
          }
        : issue,
    ),
  };
}
export type TransformIntent = "swap" | "strict";
export function transformComponent(
  project: Project,
  floorId: string,
  id: string,
  bounds: Rect,
  mode: "move" | "resize",
  opts: { intent?: TransformIntent } = {},
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  if (floor.rooms.some((r) => r.id === id))
    return mode === "move"
      ? opts.intent === "strict"
        ? moveRoomStrict(project, floorId, id, bounds)
        : moveRoomSmart(project, floorId, id, bounds)
      : updateRoom(project, floorId, id, { bounds });
  const balcony = floor.balconies.find((b) => b.id === id);
  if (balcony) {
    const p = floor.footprint,
      b = snappedRect(bounds);
    let edge = balcony.edge;
    if (mode === "move") {
      const x = b.x + b.w / 2,
        z = b.z + b.d / 2;
      const distances: { edge: EdgeSide; distance: number }[] = [
        { edge: "north", distance: Math.abs(z - p.z) },
        { edge: "south", distance: Math.abs(z - p.z - p.d) },
        { edge: "west", distance: Math.abs(x - p.x) },
        { edge: "east", distance: Math.abs(x - p.x - p.w) },
      ];
      distances.sort(
        (a, c) => a.distance - c.distance || (a.edge === balcony.edge ? -1 : 1),
      );
      edge = distances[0].edge;
    }
    const horizontal = edge === "north" || edge === "south",
      oldHorizontal = balcony.edge === "north" || balcony.edge === "south";
    const width = mode === "move" ? balcony.width : oldHorizontal ? b.w : b.d,
      depth = mode === "move" ? balcony.depth : oldHorizontal ? b.d : b.w;
    const span = horizontal ? p.w : p.d;
    const offset =
      mode === "resize"
        ? horizontal
          ? b.x - p.x
          : b.z - p.z
        : snap(
            (horizontal ? b.x + b.w / 2 - p.x : b.z + b.d / 2 - p.z) -
              width / 2,
          );
    if (width > span)
      return {
        ok: false,
        error: "This balcony is wider than the selected building edge.",
      };
    return updateBalcony(project, floorId, id, {
      edge,
      width,
      depth,
      offset:
        mode === "resize"
          ? offset
          : Math.max(0, Math.min(span - width, offset)),
    });
  }
  if (
    project.verticalSpaces.some(
      (v) => v.id === id && v.floorIds.includes(floorId),
    )
  )
    return updateVerticalSpace(project, id, { bounds });
  return { ok: false, error: "Component not found." };
}

export function projectStats(project: Project): {
  plotArea: number;
  builtArea: number;
  bedrooms: number;
  coverage: number;
} {
  const plotArea = (project.plot.width * project.plot.depth) / 10000;
  const area = (id: string) =>
    slabTiles(floorForGeometry(project, id), false).reduce(
      (sum, r) => sum + (r.w * r.d) / 10000,
      0,
    );
  return {
    plotArea,
    builtArea: project.floors.reduce((sum, f) => sum + area(f.id), 0),
    bedrooms: project.floors.reduce(
      (sum, f) => sum + f.rooms.filter((r) => r.kind === "bedroom").length,
      0,
    ),
    coverage: plotArea ? (area(project.floors[0].id) / plotArea) * 100 : 0,
  };
}
export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).byteLength > LIMITS.importBytes)
    throw new Error("Project file is too large (maximum 1 MB).");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0 && v.length <= 80;
  const num = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const nullableId = (v: unknown) => v === null || str(v);
  const rectangle = (v: unknown) =>
    obj(v) && ["x", "z", "w", "d"].every((k) => num(v[k]));
  const copyRect = (v: unknown): Rect => {
    const r = v as Rect;
    return { x: r.x, z: r.z, w: r.w, d: r.d };
  };
  if (obj(value) && value.schemaVersion === 1) return migrateV1(value);
  if (
    !obj(value) ||
    value.schemaVersion !== 2 ||
    !str(value.name) ||
    !obj(value.plot) ||
    !["width", "depth", "north", "setback"].every((k) =>
      num((value.plot as Record<string, unknown>)[k]),
    ) ||
    !str(value.plot.road) ||
    typeof value.garden !== "boolean" ||
    typeof value.parking !== "boolean" ||
    !Array.isArray(value.floors) ||
    value.floors.length < 1 ||
    value.floors.length > LIMITS.floors ||
    !Array.isArray(value.units) ||
    value.units.length > LIMITS.units ||
    !Array.isArray(value.verticalSpaces) ||
    value.verticalSpaces.length > LIMITS.verticalSpaces
  )
    throw new Error("This is not a supported Dream-Home project.");
  checkProjectExtras(value);
  for (const unit of value.units)
    if (!obj(unit) || !str(unit.id) || !str(unit.name) || !str(unit.use))
      throw new Error("Project contains an invalid unit.");
  for (const v of value.verticalSpaces)
    if (
      !obj(v) ||
      !str(v.id) ||
      !str(v.kind) ||
      !rectangle(v.bounds) ||
      !nullableId(v.unitId) ||
      !Array.isArray(v.floorIds) ||
      v.floorIds.length > LIMITS.floors ||
      !v.floorIds.every(str)
    )
      throw new Error("Project contains an invalid vertical space.");
  for (const f of value.floors) {
    if (
      !obj(f) ||
      !str(f.id) ||
      !str(f.name) ||
      !num(f.height) ||
      !num(f.elevation) ||
      !rectangle(f.footprint) ||
      !Array.isArray(f.rooms) ||
      f.rooms.length > LIMITS.roomsPerFloor ||
      !Array.isArray(f.balconies) ||
      f.balconies.length > LIMITS.balconiesPerFloor ||
      !Array.isArray(f.unitAreas) ||
      f.unitAreas.length > LIMITS.units
    )
      throw new Error("Project contains an invalid floor.");
    if ("voids" in f || "balcony" in f)
      throw new Error(
        "Version 2 floors must use canonical balconies and project-level vertical spaces.",
      );
    for (const r of f.rooms)
      if (
        !obj(r) ||
        !str(r.id) ||
        !str(r.name) ||
        !str(r.kind) ||
        !rectangle(r.bounds) ||
        !nullableId(r.unitId)
      )
        throw new Error("Project contains an invalid room.");
    for (const r of f.rooms) checkRoomExtras(r);
    checkFloorExtras(f);
    for (const b of f.balconies)
      if (
        !obj(b) ||
        !str(b.id) ||
        !str(b.edge) ||
        !["offset", "width", "depth"].every((k) => num(b[k]))
      )
        throw new Error("Project contains an invalid balcony.");
    for (const a of f.unitAreas)
      if (!obj(a) || !str(a.unitId) || !rectangle(a.bounds))
        throw new Error("Project contains an invalid unit area.");
  }
  if (value.stagedRooms !== undefined) {
    if (
      !Array.isArray(value.stagedRooms) ||
      value.stagedRooms.length > LIMITS.stagedRooms
    )
      throw new Error("A home can keep at most 48 rooms for later.");
    for (const entry of value.stagedRooms) {
      if (!obj(entry) || !str(entry.sourceFloorId) || !obj(entry.room))
        throw new Error("Project contains an invalid room kept for later.");
      const r = entry.room;
      if (
        !str(r.id) ||
        !str(r.name) ||
        !str(r.kind) ||
        !rectangle(r.bounds) ||
        !nullableId(r.unitId)
      )
        throw new Error("Project contains an invalid room kept for later.");
      checkRoomExtras(r);
    }
  }
  const raw = value as Project;
  const copyRoom = (room: Room): Room => ({
    id: room.id,
    name: room.name,
    kind: room.kind,
    bounds: copyRect(room.bounds),
    unitId: room.unitId,
    ...roomPresentation(room),
    ...copyRoomExtras(room),
  });
  const project: Project = {
    schemaVersion: 2,
    name: raw.name,
    plot: {
      width: raw.plot.width,
      depth: raw.plot.depth,
      north: raw.plot.north,
      road: raw.plot.road,
      setback: raw.plot.setback,
    },
    garden: raw.garden,
    parking: raw.parking,
    ...(raw.finish !== undefined ? { finish: raw.finish } : {}),
    ...copyProjectExtras(raw),
    ...(raw.stagedRooms !== undefined
      ? {
          stagedRooms: raw.stagedRooms.map((entry) => ({
            room: copyRoom(entry.room),
            sourceFloorId: entry.sourceFloorId,
          })),
        }
      : {}),
    units: raw.units.map((u) => ({ id: u.id, name: u.name, use: u.use })),
    verticalSpaces: raw.verticalSpaces.map((v) => ({
      id: v.id,
      kind: v.kind,
      bounds: copyRect(v.bounds),
      floorIds: [...v.floorIds],
      unitId: v.unitId,
    })),
    floors: raw.floors.map((f) => ({
      id: f.id,
      name: f.name,
      height: f.height,
      elevation: f.elevation,
      footprint: copyRect(f.footprint),
      rooms: f.rooms.map(copyRoom),
      balconies: f.balconies.map((b) => ({
        id: b.id,
        edge: b.edge,
        offset: b.offset,
        width: b.width,
        depth: b.depth,
      })),
      unitAreas: f.unitAreas.map((a) => ({
        unitId: a.unitId,
        bounds: copyRect(a.bounds),
      })),
      ...(f.openings !== undefined
        ? { openings: f.openings.map(copyOpening) }
        : {}),
    })),
  };
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  return project;
}
