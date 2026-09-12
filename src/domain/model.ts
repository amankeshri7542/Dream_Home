import {
  ROOM_META,
  type Balcony,
  type EdgeSide,
  type EditResult,
  type Floor,
  type GeometryFloor,
  type PresetId,
  type Project,
  type Rect,
  type Room,
  type RoomKind,
  type Unit,
  type VerticalSpace,
  type Void,
  type Wall,
} from "./types";
import {
  allocateId,
  componentIds,
  contains,
  freeRect,
  inside,
  overlaps,
  rect,
  sameRect,
  snap,
  snappedRect,
  validRect,
} from "./geometry";
import { createLegacyPreset } from "./legacy-presets";
import { migrateV1 } from "./migration";
export { migrateV1 } from "./migration";
export const LIMITS = Object.freeze({
  floors: 8,
  roomsPerFloor: 48,
  units: 64,
  verticalSpaces: 8,
  balconiesPerFloor: 4,
  stagedRooms: 48,
  importBytes: 1_000_000,
});
export const getLimits = () => LIMITS;
const sides: EdgeSide[] = ["north", "south", "east", "west"];
const validName = (name: string) =>
  typeof name === "string" && !!name.trim() && name.length <= 80;
function validRoomPresentation(room: Room): boolean {
  return (
    (room.furnishingRotation === undefined ||
      [0, 90, 180, 270].includes(room.furnishingRotation)) &&
    (room.floorFinish === undefined ||
      ["auto", "wood", "tile", "stone"].includes(room.floorFinish)) &&
    (room.furnishing === undefined ||
      ["auto", "none"].includes(room.furnishing))
  );
}
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
const errorsResult = (project: Project): EditResult => {
  const errors = validateProject(project);
  return errors.length
    ? { ok: false, error: errors[0] }
    : { ok: true, project };
};
const replaceFloor = (project: Project, floor: Floor): Project => ({
  ...project,
  floors: project.floors.map((f) => (f.id === floor.id ? floor : f)),
});
export function createPreset(id: PresetId): Project {
  return migrateV1(createLegacyPreset(id));
}
export function deriveFloorVoids(project: Project, floorId: string): Void[] {
  return project.verticalSpaces
    .filter((v) => v.floorIds.includes(floorId))
    .map((v) => ({ id: v.id, kind: v.kind, bounds: { ...v.bounds } }));
}
export function floorForGeometry(
  project: Project,
  floorId: string,
): GeometryFloor {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) throw new Error("Floor not found.");
  return { ...floor, voids: deriveFloorVoids(project, floorId) };
}
export function balconyBounds(
  floor: Pick<Floor, "footprint">,
  balcony: Balcony,
): Rect {
  const p = floor.footprint,
    b = balcony;
  if (b.edge === "north")
    return rect(p.x + b.offset, p.z - b.depth, b.width, b.depth);
  if (b.edge === "south")
    return rect(p.x + b.offset, p.z + p.d, b.width, b.depth);
  if (b.edge === "west")
    return rect(p.x - b.depth, p.z + b.offset, b.depth, b.width);
  return rect(p.x + p.w, p.z + b.offset, b.depth, b.width);
}
export function validateProject(project: Project): string[] {
  const errors: string[] = [],
    { plot } = project;
  if (project.schemaVersion !== 2)
    errors.push("This project must use schema version 2.");
  if (!validName(project.name))
    errors.push("Project names must contain 1–80 characters.");
  if (
    project.finish !== undefined &&
    !["ivory", "brick", "sand"].includes(project.finish)
  )
    errors.push("Choose an ivory, brick or sand exterior finish.");
  if (
    ![plot.width, plot.depth].every(
      (n) => Number.isInteger(n) && n >= 400 && n <= 10000,
    )
  )
    errors.push("Plot dimensions must be 4–100 m, in whole centimetres.");
  if (
    !Number.isInteger(plot.setback) ||
    plot.setback < 0 ||
    plot.setback > 2000 ||
    plot.setback % 10 !== 0
  )
    errors.push("Setback must be 0–20 m, in 0.1 m steps.");
  if (!Number.isFinite(plot.north) || plot.north < 0 || plot.north >= 360)
    errors.push("Orientation must be between 0 and 359 degrees.");
  if (!sides.includes(plot.road))
    errors.push("Choose a valid road-facing side.");
  if (project.floors.length < 1 || project.floors.length > LIMITS.floors)
    errors.push("Choose one to eight floors.");
  if (project.units.length > LIMITS.units)
    errors.push("This building supports up to 64 units.");
  if (project.verticalSpaces.length > LIMITS.verticalSpaces)
    errors.push("This building supports up to 8 vertical spaces.");
  if ((project.stagedRooms?.length ?? 0) > LIMITS.stagedRooms)
    errors.push("The room tray holds up to 48 rooms.");
  const envelope = rect(
    plot.setback,
    plot.setback,
    plot.width - 2 * plot.setback,
    plot.depth - 2 * plot.setback,
  );
  const ids = new Set<string>(),
    unitIds = new Set(project.units.map((u) => u.id));
  const checkId = (id: string) => {
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      ids.has(id)
    )
      errors.push("Every component must have a unique, valid ID.");
    ids.add(id);
  };
  for (const { room, sourceFloorId } of project.stagedRooms ?? []) {
    checkId(room.id);
    if (
      !Object.keys(ROOM_META).includes(room.kind) ||
      !validName(room.name) ||
      !validRect(room.bounds, 120)
    )
      errors.push(
        "A room in the tray needs a valid name, type and dimensions.",
      );
    if (
      typeof sourceFloorId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(sourceFloorId)
    )
      errors.push("A room in the tray needs a valid original floor ID.");
    if (
      room.unitId !== null &&
      (typeof room.unitId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(room.unitId))
    )
      errors.push("A room in the tray needs a valid original unit ID.");
    if (!validRoomPresentation(room))
      errors.push("Choose a valid room finish and furnishing setting.");
  }
  for (const unit of project.units) {
    checkId(unit.id);
    if (
      !validName(unit.name) ||
      !["residential", "commercial"].includes(unit.use)
    )
      errors.push(
        "Every unit needs a name and a residential or commercial use.",
      );
  }
  for (const [index, floor] of project.floors.entries()) {
    checkId(floor.id);
    if (!validName(floor.name)) errors.push("Every floor needs a valid name.");
    if (floor.height !== 300 || floor.elevation !== index * 300)
      errors.push(
        "Floors must use aligned 3 m storeys, starting at ground level.",
      );
    if (
      !validRect(floor.footprint, 400) ||
      !contains(envelope, floor.footprint)
    )
      errors.push(
        "The home must fit inside the plot setbacks. Increase the plot or reduce the setback.",
      );
    if (index && !sameRect(floor.footprint, project.floors[0].footprint))
      errors.push("Floor footprints must stay aligned in this version.");
    if (floor.rooms.length > LIMITS.roomsPerFloor)
      errors.push("Each floor supports up to 48 rooms.");
    if (floor.balconies.length > LIMITS.balconiesPerFloor)
      errors.push("Each floor supports up to 4 balconies.");
    if (floor.unitAreas.length > LIMITS.units)
      errors.push("A floor has too many unit areas.");
    const localUnits = new Set<string>();
    for (const [i, area] of floor.unitAreas.entries()) {
      if (!unitIds.has(area.unitId) || localUnits.has(area.unitId))
        errors.push("Each unit can have one valid area on each floor.");
      localUnits.add(area.unitId);
      if (
        !validRect(area.bounds, 120) ||
        !contains(floor.footprint, area.bounds)
      )
        errors.push("Unit areas must fit inside their floor boundary.");
      if (
        floor.unitAreas
          .slice(i + 1)
          .some((a) => overlaps(area.bounds, a.bounds))
      )
        errors.push("Unit areas cannot overlap.");
    }
    const voids = deriveFloorVoids(project, floor.id);
    for (const [i, room] of floor.rooms.entries()) {
      checkId(room.id);
      if (!Object.keys(ROOM_META).includes(room.kind))
        errors.push("Unknown room type.");
      if (!validName(room.name))
        errors.push("Room names must contain 1–80 characters.");
      if (!validRoomPresentation(room))
        errors.push("Choose a valid room finish and furnishing setting.");
      if (!validRect(room.bounds, 120))
        errors.push("Rooms need dimensions of at least 1.2 m, in 0.1 m steps.");
      if (!contains(floor.footprint, room.bounds))
        errors.push(`${room.name} must stay inside the floor boundary.`);
      if (floor.rooms.slice(i + 1).some((r) => overlaps(room.bounds, r.bounds)))
        errors.push(
          `${room.name} overlaps another room. Leave space before moving or resizing.`,
        );
      if (voids.some((v) => overlaps(room.bounds, v.bounds)))
        errors.push(`${room.name} overlaps the courtyard or stair opening.`);
      if (room.unitId === null) {
        if (floor.unitAreas.some((a) => overlaps(a.bounds, room.bounds)))
          errors.push(
            `${room.name} is shared space and cannot overlap a private unit.`,
          );
      } else {
        const area = floor.unitAreas.find((a) => a.unitId === room.unitId);
        if (
          !unitIds.has(room.unitId) ||
          !area ||
          !contains(area.bounds, room.bounds)
        )
          errors.push(`${room.name} must stay inside its assigned unit.`);
      }
    }
    for (const [i, b] of floor.balconies.entries()) {
      checkId(b.id);
      const span =
        b.edge === "north" || b.edge === "south"
          ? floor.footprint.w
          : floor.footprint.d;
      if (
        !sides.includes(b.edge) ||
        ![b.offset, b.width, b.depth].every(
          (n) => Number.isFinite(n) && Number.isInteger(n) && n % 10 === 0,
        ) ||
        b.offset < 0 ||
        b.width < 150 ||
        b.depth < 90 ||
        b.offset + b.width > span
      )
        errors.push(
          "A balcony must fit its edge, with at least 1.5 m width and 0.9 m depth.",
        );
      const bounds = balconyBounds(floor, b);
      if (!contains(envelope, bounds))
        errors.push(
          "The balcony must fit inside the plot setbacks. Increase the plot or reduce its depth.",
        );
      if (
        floor.balconies
          .slice(i + 1)
          .some((other) => overlaps(bounds, balconyBounds(floor, other)))
      )
        errors.push("Balconies on the same floor cannot overlap.");
    }
  }
  const floorIds = project.floors.map((f) => f.id);
  for (const [i, space] of project.verticalSpaces.entries()) {
    checkId(space.id);
    if (
      !["courtyard", "stairs"].includes(space.kind) ||
      !validRect(space.bounds, 120)
    )
      errors.push(
        "Vertical spaces need valid dimensions on the planning grid.",
      );
    const indices = space.floorIds.map((id) => floorIds.indexOf(id));
    if (
      !indices.length ||
      indices.some((n) => n < 0) ||
      new Set(indices).size !== indices.length ||
      indices.some((n, j) => j > 0 && n !== indices[j - 1] + 1)
    )
      errors.push(
        "Vertical spaces must serve an ordered, contiguous set of floors.",
      );
    if (space.kind === "courtyard" && indices.at(-1) !== floorIds.length - 1)
      errors.push("An open-to-sky courtyard must reach the top floor.");
    if (space.unitId !== null && !unitIds.has(space.unitId))
      errors.push("A vertical space refers to an unknown unit.");
    for (const floor of project.floors.filter((f) =>
      space.floorIds.includes(f.id),
    )) {
      if (!contains(floor.footprint, space.bounds))
        errors.push(
          "The courtyard or staircase must fit inside every connected floor.",
        );
      if (space.unitId === null) {
        if (floor.unitAreas.some((a) => overlaps(a.bounds, space.bounds)))
          errors.push(
            "Shared stairs and courtyards cannot overlap private unit areas.",
          );
      } else {
        const area = floor.unitAreas.find((a) => a.unitId === space.unitId);
        if (!area || !contains(area.bounds, space.bounds))
          errors.push(
            "A private vertical space must stay inside its unit on every connected floor.",
          );
      }
    }
    if (
      project.verticalSpaces
        .slice(i + 1)
        .some(
          (v) =>
            v.floorIds.some((id) => space.floorIds.includes(id)) &&
            overlaps(v.bounds, space.bounds),
        )
    )
      errors.push("Vertical spaces on the same floor cannot overlap.");
  }
  for (let i = 1; i < floorIds.length; i++)
    if (
      !project.verticalSpaces.some(
        (v) =>
          v.kind === "stairs" &&
          v.floorIds.includes(floorIds[i - 1]) &&
          v.floorIds.includes(floorIds[i]),
      )
    )
      errors.push(
        "Every pair of adjacent floors needs an aligned stair connection.",
      );
  return [...new Set(errors)];
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
  return errorsResult(
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
  return freeRect(area, blockers, w, d);
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
  return errorsResult(
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
  return errorsResult(
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
  return errorsResult({ ...project, plot });
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
    floors.push({
      ...source,
      id,
      name: `Floor ${index}`,
      elevation: index * 300,
      footprint: { ...source.footprint },
      balconies: [],
      unitAreas: source.unitAreas.map((a) => ({
        unitId: unitMap.get(a.unitId)!,
        bounds: { ...a.bounds },
      })),
      rooms: source.rooms.map((r, i) => ({
        ...r,
        id: allocateId(`${id}-room-${i}`, ids),
        unitId: r.unitId === null ? null : unitMap.get(r.unitId)!,
        bounds: { ...r.bounds },
      })),
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
  return errorsResult({
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
  return errorsResult(
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
  return errorsResult(
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
  return errorsResult(
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
  return errorsResult({
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
  return errorsResult({
    ...project,
    verticalSpaces: project.verticalSpaces.map((v) => (v.id === id ? next : v)),
  });
}
export function removeVerticalSpace(project: Project, id: string): EditResult {
  if (!project.verticalSpaces.some((v) => v.id === id))
    return { ok: false, error: "Vertical space not found." };
  return errorsResult({
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
  return errorsResult({
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
  return errorsResult(
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
  return errorsResult({
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
  return errorsResult({
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
  return errorsResult(
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
  return errorsResult(
    replaceFloor(project, {
      ...floor,
      rooms: floor.rooms.map((r) =>
        r.id === a.id
          ? { ...r, kind: b.kind, name: b.name }
          : r.id === b.id
            ? { ...r, kind: a.kind, name: a.name }
            : r,
      ),
    }),
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
export function transformComponent(
  project: Project,
  floorId: string,
  id: string,
  bounds: Rect,
  mode: "move" | "resize",
): EditResult {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return { ok: false, error: "Floor not found." };
  if (floor.rooms.some((r) => r.id === id))
    return mode === "move"
      ? moveRoomSmart(project, floorId, id, bounds)
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

type Edge = {
  axis: "x" | "z";
  fixed: number;
  start: number;
  end: number;
  exterior: boolean;
};
function edges(r: Rect, exterior: boolean): Edge[] {
  return [
    { axis: "x", fixed: r.z, start: r.x, end: r.x + r.w, exterior },
    { axis: "x", fixed: r.z + r.d, start: r.x, end: r.x + r.w, exterior },
    { axis: "z", fixed: r.x, start: r.z, end: r.z + r.d, exterior },
    { axis: "z", fixed: r.x + r.w, start: r.z, end: r.z + r.d, exterior },
  ];
}
function touches(w: Wall, r: Rect) {
  return edges(r, false).some(
    (e) =>
      e.axis === w.axis &&
      e.fixed === (w.axis === "x" ? w.z : w.x) &&
      e.start <= (w.axis === "x" ? w.x : w.z) &&
      e.end >= (w.axis === "x" ? w.x : w.z) + w.length,
  );
}
export function deriveWalls(
  floor: GeometryFloor,
  road: EdgeSide = "south",
): Wall[] {
  const all = [
    ...edges(floor.footprint, true),
    ...floor.rooms.flatMap((r) => edges(r.bounds, false)),
    ...floor.unitAreas.flatMap((a) => edges(a.bounds, false)),
    ...floor.voids
      .filter((v) => v.kind === "courtyard")
      .flatMap((v) => edges(v.bounds, true)),
  ];
  const groups = new Map<string, Edge[]>();
  for (const e of all) {
    const key = `${e.axis}:${e.fixed}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const walls: Wall[] = [];
  for (const group of groups.values()) {
    const { axis, fixed } = group[0];
    const extra = [
      ...floor.voids.map((v) => v.bounds),
      ...floor.balconies.map((b) => balconyBounds(floor, b)),
    ]
      .flatMap((r) => edges(r, false))
      .filter((e) => e.axis === axis && e.fixed === fixed)
      .flatMap((e) => [e.start, e.end]);
    const cuts = [
      ...new Set([...group.flatMap((e) => [e.start, e.end]), ...extra]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i],
        end = cuts[i + 1],
        cover = group.filter((e) => e.start <= start && e.end >= end);
      if (!cover.length) continue;
      walls.push({
        id: `${floor.id}-${axis}-${fixed}-${start}-${end}`,
        axis,
        x: axis === "x" ? start : fixed,
        z: axis === "z" ? start : fixed,
        length: end - start,
        exterior: cover.some((e) => e.exterior),
      });
    }
  }
  const samples = (w: Wall) => {
    const x = w.x + (w.axis === "x" ? w.length / 2 : 0),
      z = w.z + (w.axis === "z" ? w.length / 2 : 0);
    return [
      { x: x + (w.axis === "z" ? 1 : 0), z: z + (w.axis === "x" ? 1 : 0) },
      { x: x - (w.axis === "z" ? 1 : 0), z: z - (w.axis === "x" ? 1 : 0) },
    ];
  };
  const unitsAt = (w: Wall) =>
    samples(w).map(
      (p) =>
        floor.unitAreas.find((a) => inside(a.bounds, p.x, p.z))?.unitId ?? null,
    );
  const privateBoundary = (w: Wall) => {
    const [a, b] = unitsAt(w);
    return a !== null && b !== null && a !== b;
  };
  const blocked = (w: Wall) =>
    samples(w).some((p) => floor.voids.some((v) => inside(v.bounds, p.x, p.z)));
  const roomOwners = (w: Wall) =>
    floor.rooms.filter((r) =>
      samples(w).some((p) => inside(r.bounds, p.x, p.z)),
    ).length;
  for (const room of floor.rooms) {
    const options = walls.filter(
      (w) =>
        !w.exterior &&
        !privateBoundary(w) &&
        !blocked(w) &&
        w.length >= 120 &&
        touches(w, room.bounds),
    );
    options.sort(
      (a, b) =>
        roomOwners(a) - roomOwners(b) ||
        b.length - a.length ||
        a.id.localeCompare(b.id),
    );
    if (options[0])
      options[0].opening = { kind: "door", width: 90, sill: 0, height: 215 };
  }
  for (const area of floor.unitAreas) {
    const options = walls.filter(
      (w) =>
        !w.exterior &&
        !privateBoundary(w) &&
        !blocked(w) &&
        w.length >= 140 &&
        touches(w, area.bounds),
    );
    options.sort(
      (a, b) =>
        roomOwners(a) - roomOwners(b) ||
        b.length - a.length ||
        a.id.localeCompare(b.id),
    );
    if (options[0])
      options[0].opening = { kind: "door", width: 100, sill: 0, height: 220 };
  }
  for (const w of walls)
    if (w.exterior && w.length >= 180)
      w.opening = {
        kind: "window",
        width: Math.min(180, w.length - 60),
        sill: 90,
        height: 135,
      };
  const atSide = (w: Wall, side: EdgeSide) =>
    side === "north"
      ? w.axis === "x" && w.z === floor.footprint.z
      : side === "south"
        ? w.axis === "x" && w.z === floor.footprint.z + floor.footprint.d
        : side === "west"
          ? w.axis === "z" && w.x === floor.footprint.x
          : w.axis === "z" && w.x === floor.footprint.x + floor.footprint.w;
  const entrance = (side: EdgeSide, balcony?: Balcony) => {
    const options = walls.filter(
      (w) =>
        atSide(w, side) &&
        w.length >= 150 &&
        !blocked(w) &&
        (!balcony ||
          (() => {
            const r = balconyBounds(floor, balcony),
              center = w.axis === "x" ? w.x + w.length / 2 : w.z + w.length / 2,
              start = w.axis === "x" ? r.x : r.z,
              span = w.axis === "x" ? r.w : r.d;
            return center - 55 >= start && center + 55 <= start + span;
          })()),
    );
    options.sort(
      (a, b) =>
        roomOwners(a) - roomOwners(b) ||
        b.length - a.length ||
        a.id.localeCompare(b.id),
    );
    if (options[0])
      options[0].opening = { kind: "door", width: 110, sill: 0, height: 230 };
  };
  if (floor.elevation === 0) entrance(road);
  for (const balcony of floor.balconies) entrance(balcony.edge, balcony);
  return walls.sort((a, b) => a.id.localeCompare(b.id));
}
export function slabTiles(
  floor: GeometryFloor,
  includeStairHole: boolean,
): Rect[] {
  let tiles = [{ ...floor.footprint }];
  for (const hole of floor.voids.filter(
    (v) => v.kind === "courtyard" || includeStairHole,
  )) {
    tiles = tiles.flatMap((tile) => {
      if (!overlaps(tile, hole.bounds)) return [tile];
      const x1 = Math.max(tile.x, hole.bounds.x),
        x2 = Math.min(tile.x + tile.w, hole.bounds.x + hole.bounds.w),
        z1 = Math.max(tile.z, hole.bounds.z),
        z2 = Math.min(tile.z + tile.d, hole.bounds.z + hole.bounds.d);
      return [
        rect(tile.x, tile.z, tile.w, z1 - tile.z),
        rect(tile.x, z2, tile.w, tile.z + tile.d - z2),
        rect(tile.x, z1, x1 - tile.x, z2 - z1),
        rect(x2, z1, tile.x + tile.w - x2, z2 - z1),
      ].filter((r) => r.w > 0 && r.d > 0);
    });
  }
  return tiles;
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
      throw new Error("The room tray must contain at most 48 rooms.");
    for (const entry of value.stagedRooms) {
      if (!obj(entry) || !str(entry.sourceFloorId) || !obj(entry.room))
        throw new Error("Project contains an invalid room tray item.");
      const r = entry.room;
      if (
        !str(r.id) ||
        !str(r.name) ||
        !str(r.kind) ||
        !rectangle(r.bounds) ||
        !nullableId(r.unitId)
      )
        throw new Error("Project contains an invalid room in the tray.");
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
    })),
  };
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors[0]);
  return project;
}
