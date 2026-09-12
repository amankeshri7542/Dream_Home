import type { Project, Rect, Room, Void, Balcony } from "./types";
import { parseProject } from "./model";
import { allocateId, sameRect, snap } from "./geometry";
export type LegacyRoom = Omit<Room, "unitId">;
export type LegacyFloor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  footprint: Rect;
  rooms: LegacyRoom[];
  voids: Void[];
  balcony: boolean;
};
export type LegacyProjectV1 = {
  schemaVersion: 1;
  name: string;
  plot: Project["plot"];
  floors: LegacyFloor[];
  garden: boolean;
  parking: boolean;
  finish?: Project["finish"];
};
export function migrateV1(value: unknown): Project {
  const obj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown): v is string =>
    typeof v === "string" && !!v.trim() && v.length <= 80;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const rectangle = (v: unknown) =>
    obj(v) && ["x", "z", "w", "d"].every((k) => num(v[k]));
  if (
    !obj(value) ||
    value.schemaVersion !== 1 ||
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
    value.floors.length > 3
  )
    throw new Error("This is not a supported version 1 Dream-Home project.");
  const used = new Set<string>();
  const checkId = (id: unknown) => {
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      used.has(id)
    )
      throw new Error("Legacy components must have unique, valid IDs.");
    used.add(id);
  };
  for (const floor of value.floors) {
    if (
      !obj(floor) ||
      !str(floor.id) ||
      !str(floor.name) ||
      !num(floor.height) ||
      !num(floor.elevation) ||
      !rectangle(floor.footprint) ||
      typeof floor.balcony !== "boolean" ||
      !Array.isArray(floor.rooms) ||
      floor.rooms.length > 24 ||
      !Array.isArray(floor.voids) ||
      floor.voids.length > 8
    )
      throw new Error("The legacy project contains an invalid floor.");
    checkId(floor.id);
    for (const r of floor.rooms) {
      if (
        !obj(r) ||
        !str(r.id) ||
        !str(r.name) ||
        !str(r.kind) ||
        !rectangle(r.bounds)
      )
        throw new Error("The legacy project contains an invalid room.");
      checkId(r.id);
    }
    for (const v of floor.voids) {
      if (
        !obj(v) ||
        !str(v.id) ||
        !["courtyard", "stairs"].includes(v.kind as string) ||
        !rectangle(v.bounds)
      )
        throw new Error(
          "The legacy project contains an invalid reserved space.",
        );
      checkId(v.id);
    }
  }
  const legacy = value as LegacyProjectV1,
    base = legacy.floors[0];
  for (const floor of legacy.floors)
    if (
      floor.voids.length !== base.voids.length ||
      base.voids.some(
        (v) =>
          !floor.voids.some(
            (other) =>
              other.kind === v.kind && sameRect(other.bounds, v.bounds),
          ),
      )
    )
      throw new Error(
        "Legacy stairs and courtyards must align across every floor.",
      );
  const unitId = allocateId("unit-home", used);
  const project: Project = {
    schemaVersion: 2,
    name: legacy.name,
    plot: { ...legacy.plot },
    garden: legacy.garden,
    parking: legacy.parking,
    ...(legacy.finish !== undefined ? { finish: legacy.finish } : {}),
    units: [{ id: unitId, name: "Home", use: "residential" }],
    verticalSpaces: base.voids.map((v) => ({
      ...v,
      bounds: { ...v.bounds },
      floorIds: legacy.floors.map((f) => f.id),
      unitId,
    })),
    floors: legacy.floors.map((f) => {
      const width = Math.min(360, f.footprint.w);
      const balconies: Balcony[] = f.balcony
        ? [
            {
              id: allocateId("balcony", used),
              edge: "south",
              offset: snap((f.footprint.w - width) / 2),
              width,
              depth: 150,
            },
          ]
        : [];
      return {
        id: f.id,
        name: f.name,
        elevation: f.elevation,
        height: f.height,
        footprint: { ...f.footprint },
        rooms: f.rooms.map((r) => ({ ...r, bounds: { ...r.bounds }, unitId })),
        balconies,
        unitAreas: [{ unitId, bounds: { ...f.footprint } }],
      };
    }),
  };
  return parseProject(JSON.stringify(project));
}
