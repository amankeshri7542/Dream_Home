import { describe, expect, it } from "vitest";
import compact from "../../tests/fixtures/legacy-v1-compact.json" with { type: "json" };
import courtyard from "../../tests/fixtures/legacy-v1-courtyard.json" with { type: "json" };
import family from "../../tests/fixtures/legacy-v1-family.json" with { type: "json" };
import baseline from "../../tests/fixtures/v2-baseline.json" with { type: "json" };
import { addFurniture, updateFurniture } from "./furnitureCommands";
import { addLandscape, customizeLandscape } from "./landscapeCommands";
import {
  setExterior,
  setRoomFloorMaterial,
  setRoomWallColor,
  setSite,
  setStyle,
} from "./materials";
import { createPreset, migrateV1, parseProject, validateProject } from "./model";
import { addOpening, customizeOpenings, listCompatibleWalls } from "./openingCommands";
import type { EditResult, Project } from "./types";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const NEW_KEYS = [
  "openings",
  "furniture",
  "floorMaterial",
  "wallColor",
  "style",
  "site",
  "landscape",
];
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  return out;
}
const roundTrip = (p: Project) => parseProject(JSON.stringify(p));

describe("schema compatibility", () => {
  it("parses v1 saves exactly as before, with no new keys", () => {
    for (const fixture of [compact, courtyard, family]) {
      const parsed = parseProject(JSON.stringify(fixture));
      expect(parsed).toStrictEqual(migrateV1(structuredClone(fixture)));
      expect(NEW_KEYS.filter((k) => keysOf(parsed).has(k))).toEqual([]);
      expect(roundTrip(parsed)).toStrictEqual(parsed);
    }
  });
  it("parses the v2 baseline to the identical object", () => {
    const parsed = parseProject(JSON.stringify(baseline));
    expect(parsed).toStrictEqual(baseline);
    expect(NEW_KEYS.filter((k) => keysOf(parsed).has(k))).toEqual([]);
  });
  it("round-trips a richly customised home", () => {
    let p = createPreset("family");
    const floor = p.floors[0].id;
    const [living, second] = p.floors[0].rooms;
    p = ok(customizeOpenings(p, floor));
    const [spot] = listCompatibleWalls(p, floor, "archway");
    p = ok(addOpening(p, floor, "archway", spot, { width: spot.width, style: "plain" }));
    p = ok(addFurniture(p, floor, living.id, "armchair"));
    const chair = p.floors[0].rooms[0].furniture!.at(-1)!;
    p = ok(updateFurniture(p, floor, living.id, chair.id, { finish: "terracotta" }));
    p = ok(setRoomWallColor(p, floor, second.id, "dusty-blue"));
    p = ok(setRoomFloorMaterial(p, floor, second.id, "herringbone"));
    p = ok(setExterior(p, "white-stucco"));
    p = ok(setStyle(p, { trim: "oak", frontDoor: "sage", roof: { style: "gable", material: "slate", pitch: 30 } }));
    p = ok(setSite(p, { ground: "meadow", fence: "picket" }));
    p = ok(customizeLandscape(p));
    p = ok(addLandscape(p, "flowerbed"));
    expect(validateProject(p)).toEqual([]);
    for (const key of NEW_KEYS) expect(keysOf(p).has(key), key).toBe(true);
    expect(roundTrip(p)).toStrictEqual(p);
    expect(roundTrip(roundTrip(p))).toStrictEqual(p);
  });
  it("strips unknown keys from the new optional fields", () => {
    const p = ok(addFurniture(createPreset("compact"), "floor-0", createPreset("compact").floors[0].rooms[0].id, "plant-small"));
    const raw = JSON.parse(JSON.stringify(p));
    raw.floors[0].rooms[0].furniture[0].secret = "x";
    expect(roundTrip(raw)).toStrictEqual(p);
  });
});

describe("rejecting bad sandbox data", () => {
  const base = () => createPreset("compact");
  const withRoom = (patch: Record<string, unknown>) => {
    const raw = JSON.parse(JSON.stringify(base()));
    Object.assign(raw.floors[0].rooms[0], patch);
    return JSON.stringify(raw);
  };
  const item = { id: "item", catalogId: "plant-small", x: 100, z: 100, rotation: 0 };
  it("rejects oversized arrays", () => {
    const raw = JSON.parse(JSON.stringify(base()));
    raw.floors[0].openings = Array.from({ length: 257 }, (_, i) => ({
      id: `o${i}`, kind: "window", axis: "x", line: 0, center: 0, width: 100, height: 100, sill: 90,
    }));
    expect(() => parseProject(JSON.stringify(raw))).toThrow("Project contains an invalid opening.");
    expect(() =>
      parseProject(withRoom({ furniture: Array.from({ length: 33 }, (_, i) => ({ ...item, id: `f${i}` })) })),
    ).toThrow("Project contains an invalid furniture item.");
    const garden = JSON.parse(JSON.stringify(base()));
    garden.landscape = Array.from({ length: 121 }, (_, i) => ({ id: `l${i}`, kind: "rock", x: 0, z: 0, rotation: 0 }));
    expect(() => parseProject(JSON.stringify(garden))).toThrow("Project contains an invalid garden item.");
  });
  it("rejects bad ids, unknown catalog ids and off-grid values", () => {
    expect(() => parseProject(withRoom({ furniture: [{ ...item, id: "bad id" }] }))).toThrow(
      "Every component must have a unique, valid ID.",
    );
    expect(() => parseProject(withRoom({ furniture: [{ ...item, id: base().floors[0].id }] }))).toThrow(
      "Every component must have a unique, valid ID.",
    );
    expect(() => parseProject(withRoom({ furniture: [{ ...item, catalogId: "jacuzzi" }] }))).toThrow(
      "Choose furniture from the catalog.",
    );
    expect(() => parseProject(withRoom({ furniture: [{ ...item, x: 102 }] }))).toThrow(
      "Furniture snaps to a 5 cm grid.",
    );
    expect(() => parseProject(withRoom({ wallColor: "tartan" }))).toThrow("Choose a valid finish.");
    const opening = JSON.parse(JSON.stringify(ok(customizeOpenings(base(), "floor-0"))));
    opening.floors[0].openings[0].id = "auto:x";
    expect(() => parseProject(JSON.stringify(opening))).toThrow("Every component must have a unique, valid ID.");
    opening.floors[0].openings[0].id = "o";
    opening.floors[0].openings[0].center += 2;
    expect(() => parseProject(JSON.stringify(opening))).toThrow(
      "Doors and windows snap to a 5 cm grid along their wall.",
    );
    const garden = JSON.parse(JSON.stringify(base()));
    garden.landscape = [{ id: "rock", kind: "rock", x: 15, z: 20, rotation: 0 }];
    expect(() => parseProject(JSON.stringify(garden))).toThrow("Garden items snap to a 10 cm grid.");
  });
});
