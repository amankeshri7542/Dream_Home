// M3 designer interiors: room palettes per Look, look-based paints and floors,
// accent walls (command, validation, persistence, rendering) and focal walls.
import { describe, expect, it } from "vitest";
import { facePaint } from "../scene/building/geometry/walls";
import { FURNITURE_CATALOG, FURNITURE_FINISHES, autoFurniture, roomFocalWall } from "./furniture";
import {
  FLOOR_MATERIALS,
  WALL_PAINTS,
  autoPalette,
  effectiveFinish,
  paletteFinish,
  paletteTint,
  roomAccentWall,
  roomFloorMaterial,
  roomPalette,
  roomWallPaint,
  setRoomAccentWall,
  suggestAccentWall,
  withStylePreset,
} from "./materials";
import { createPreset, parseProject, validateProjectIssues } from "./model";
import { STYLE_PRESETS } from "./persist";
import type { EditResult, GeometryFloor, Project, Room, RoomKind, StylePreset } from "./types";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const LOOKS: readonly StylePreset[] = STYLE_PRESETS;
const ROOMS: Array<[RoomKind, string]> = [
  ["bedroom", "Bedroom"],
  ["living", "Living room"],
  ["kitchen", "Kitchen"],
  ["dining", "Dining"],
  ["bathroom", "Bathroom"],
  ["utility", "Pooja room"],
  ["utility", "Study"],
  ["utility", "Utility"],
];
const room = (kind: RoomKind, name: string, id = "r1"): Room => ({
  id,
  name,
  kind,
  bounds: { x: 0, z: 0, w: 400, d: 400 },
  unitId: null,
});

describe("room palettes", () => {
  it("only name paints, floors and finishes that exist", () => {
    for (const look of LOOKS)
      for (const [kind, name] of ROOMS)
        for (const id of ["a", "b", "c", "d", "e", "f"]) {
          const p = roomPalette(look, room(kind, name, id))!;
          expect(p, `${look} ${name}`).not.toBeNull();
          expect(p.paint in WALL_PAINTS).toBe(true);
          expect(p.floor in FLOOR_MATERIALS).toBe(true);
          for (const key of ["fabric", "soft", "pop"] as const) expect(FURNITURE_FINISHES.fabric[p[key]], key).toBeDefined();
          expect(FURNITURE_FINISHES.wood[p.wood]).toBeDefined();
          for (const key of ["accent", "cabinet", "tile"] as const) expect(FURNITURE_FINISHES.accent[p[key]], key).toBeDefined();
          for (const entry of FURNITURE_CATALOG) {
            const finish = paletteFinish(p, entry.id);
            if (finish !== undefined) expect(entry.finishes, entry.id).toContain(finish);
          }
          for (const slot of ["fabric", "wood", "accent"] as const) expect(paletteTint(p, slot)).toMatch(/^#/);
        }
  });
  it("keep old homes (no Look) exactly as they were", () => {
    const p = createPreset("family");
    expect(p.style?.preset).toBeUndefined();
    for (const r of p.floors[0].rooms) {
      expect(autoPalette(p, r)).toBeNull();
      expect(roomWallPaint(r, p.style?.preset)).toBe(roomWallPaint(r));
      expect(roomFloorMaterial(r, p.style?.preset)).toBe(roomFloorMaterial(r));
      for (const item of autoFurniture(r))
        expect(effectiveFinish(p, r, item)).toBe(FURNITURE_CATALOG.find((e) => e.id === item.catalogId)!.defaultFinish);
    }
  });
  it("give rooms in a home with a Look coordinated paints, floors and finishes", () => {
    const p = withStylePreset(createPreset("family"), "indian-modern");
    const bed = p.floors[0].rooms.find((r) => r.kind === "bedroom")!;
    const palette = autoPalette(p, bed)!;
    expect(roomWallPaint(bed, "indian-modern")).toBe(palette.paint);
    expect(roomFloorMaterial(bed, "indian-modern")).toBe(palette.floor);
    // The bed takes the upholstery colour, the rug the soft furnishing colour.
    expect(effectiveFinish(p, bed, { catalogId: "bed-double" })).toBe(palette.fabric);
    expect(effectiveFinish(p, bed, { catalogId: "rug-rect" })).toBe(palette.soft);
    expect(effectiveFinish(p, bed, { catalogId: "table-lamp" })).toBe(palette.accent);
    // A chosen finish, paint or floor always wins.
    expect(effectiveFinish(p, bed, { catalogId: "bed-double", finish: "navy" })).toBe("navy");
    expect(roomWallPaint({ ...bed, wallColor: "charcoal" }, "indian-modern")).toBe("charcoal");
    expect(roomFloorMaterial({ ...bed, floorMaterial: "slate" }, "indian-modern")).toBe("slate");
    expect(roomFloorMaterial({ ...bed, floorFinish: "tile" }, "indian-modern")).toBe("light-tile");
  });
  it("are stable per room and vary between bedrooms", () => {
    const paints = new Set<string>();
    for (const id of ["bed-1", "bed-2", "bed-3", "bed-4", "bed-5", "bed-6", "bed-7", "bed-8"]) {
      const r = room("bedroom", "Bedroom", id);
      expect(roomPalette("indian-classic", r)).toEqual(roomPalette("indian-classic", { ...r }));
      paints.add(roomPalette("indian-classic", r)!.paint);
    }
    expect(paints.size).toBeGreaterThan(1);
    expect(roomPalette("indian-modern", room("shop", "Shop"))).toBeNull();
  });
});

describe("accent walls", () => {
  const home = () => withStylePreset(createPreset("family"), "indian-modern");
  it("set, default to a colour that suits the room, validate and clear", () => {
    const p = home();
    const f = p.floors[0].id,
      r = p.floors[0].rooms[0];
    const painted = ok(setRoomAccentWall(p, f, r.id, "north", "terracotta"));
    expect(painted.floors[0].rooms[0].accentWall).toEqual({ edge: "north", color: "terracotta" });
    const suggested = ok(setRoomAccentWall(p, f, r.id, "east"));
    expect(suggested.floors[0].rooms[0].accentWall).toEqual({ edge: "east", color: suggestAccentWall(p, r) });
    expect(suggestAccentWall(p, r)).not.toBe(roomWallPaint(r, "indian-modern"));
    expect(setRoomAccentWall(p, f, r.id, "north", "plaid").ok).toBe(false);
    expect(setRoomAccentWall(p, f, r.id, "up" as "north").ok).toBe(false);
    const cleared = ok(setRoomAccentWall(painted, f, r.id, null));
    expect(cleared.floors[0].rooms[0].accentWall).toBeUndefined();
    expect(setRoomAccentWall(p, f, "nope", "north").ok).toBe(false);
  });
  it("save and load, and old saves without one still load", () => {
    const p = home();
    const painted = ok(setRoomAccentWall(p, p.floors[0].id, p.floors[0].rooms[0].id, "south", "navy"));
    const loaded = parseProject(JSON.stringify(painted));
    expect(loaded.floors[0].rooms[0].accentWall).toEqual({ edge: "south", color: "navy" });
    expect(parseProject(JSON.stringify(p)).floors[0].rooms[0].accentWall).toBeUndefined();
    const broken = structuredClone(painted) as unknown as { floors: { rooms: Record<string, unknown>[] }[] };
    broken.floors[0].rooms[0].accentWall = { edge: "up", color: "navy" };
    expect(() => parseProject(JSON.stringify(broken))).toThrow("invalid room finish");
    const unknownColour = structuredClone(painted);
    unknownColour.floors[0].rooms[0].accentWall = { edge: "north", color: "plaid" };
    expect(roomAccentWall(unknownColour.floors[0].rooms[0])).toBeNull();
    expect(validateProjectIssues(unknownColour).some((i) => i.code === "material")).toBe(true);
  });
  it("paint only the inside face of that edge", () => {
    const r: Room = { ...room("bedroom", "Bedroom"), bounds: { x: 100, z: 200, w: 400, d: 300 }, accentWall: { edge: "north", color: "navy" } };
    const floor = { rooms: [r] } as unknown as GeometryFloor;
    const navy = WALL_PAINTS.navy.color;
    // North wall's inside face: z-normal pointing south (+z), 6 cm inside the line.
    expect(facePaint(floor, r.id, 2, 1, 2.06)).toBe(navy);
    expect(facePaint(floor, r.id, 2, -1, 4.94)).not.toBe(navy);
    expect(facePaint(floor, r.id, 0, 1, 1.06)).not.toBe(navy);
    expect(facePaint(floor, r.id, 2, 1, 3.5)).not.toBe(navy);
  });
  it("find the focal wall behind the bed or sofa", () => {
    const bed = { ...room("bedroom", "Bedroom"), bounds: { x: 0, z: 0, w: 380, d: 420 } };
    const item = autoFurniture(bed).find((i) => i.catalogId.startsWith("bed-"))!;
    expect(roomFocalWall(bed)).toBe({ 0: "north", 90: "east", 180: "south", 270: "west" }[item.rotation]);
    expect(roomFocalWall({ ...bed, furnishing: "none" })).toBeNull();
  });
});
