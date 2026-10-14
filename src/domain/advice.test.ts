import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { homeChecks, isCommercialOnly, projectAdvisories } from "./advice";
import { addFurniture } from "./furnitureCommands";
import { customizeLandscape } from "./landscapeCommands";
import { setRoomWallColor, setStyle } from "./materials";
import { createPreset, deriveWalls } from "./model";
import { floorForGeometry } from "./core";
import {
  addOpening,
  addRoomWindow,
  customizeOpenings,
  ensureRoomDoor,
  removeOpening,
} from "./openingCommands";
import { roomDoorApproaches } from "./roomDetails";
import { openingSide } from "./openings";
import { setAsideRoom } from "./tray";
import type { EditResult, Project, Rect, Room } from "./types";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const room = (id: string, bounds: Rect, kind: Room["kind"]): Room => ({
  id,
  name: id,
  kind,
  bounds,
  unitId: null,
});
function sketch(): Project {
  const floor = (id: string, elevation: number, rooms: Room[]) => ({
    id,
    name: elevation ? "First floor" : "Ground floor",
    elevation,
    height: 300,
    footprint: { x: 500, z: 500, w: 1000, d: 1000 },
    rooms,
    balconies: [],
    unitAreas: [],
  });
  return {
    schemaVersion: 2,
    name: "Advice",
    plot: { width: 2000, depth: 2200, north: 0, road: "south", setback: 100 },
    floors: [
      floor("f0", 0, [
        room("Kitchen", { x: 500, z: 900, w: 800, d: 600 }, "kitchen"),
        room("Bath", { x: 500, z: 500, w: 300, d: 400 }, "bathroom"),
      ]),
      floor("f1", 300, [
        room("Bedroom", { x: 500, z: 500, w: 500, d: 400 }, "bedroom"),
        room("Den", { x: 500, z: 900, w: 700, d: 600 }, "living"),
      ]),
    ],
    units: [],
    verticalSpaces: [
      { id: "stairs", kind: "stairs", bounds: { x: 1300, z: 1300, w: 200, d: 200 }, floorIds: ["f0", "f1"], unitId: null },
    ],
    garden: true,
    parking: false,
  };
}

describe("advisories", () => {
  it("flags a room without a door and fixes it", () => {
    const p = sketch();
    expect(projectAdvisories(p, "f1").filter((i) => i.code === "room-no-door")).toEqual([]);
    let next = ok(customizeOpenings(p, "f1"));
    const bedroom = next.floors[1].rooms[0];
    for (const o of next.floors[1].openings!.filter(
      (o) => o.kind === "door" && openingSide(o, bedroom.bounds),
    ))
      next = ok(removeOpening(next, "f1", o.id));
    const warning = projectAdvisories(next, "f1").find(
      (i) => i.code === "room-no-door" && i.source?.id === "Bedroom",
    )!;
    expect(warning).toMatchObject({
      severity: "warning",
      source: { kind: "room", id: "Bedroom", floorId: "f1" },
      fixes: [{ kind: "add-door", floorId: "f1", roomId: "Bedroom" }],
    });
    const fixed = ok(ensureRoomDoor(next, "f1", "Bedroom"));
    expect(
      projectAdvisories(fixed, "f1").some(
        (i) => i.code === "room-no-door" && i.source?.id === "Bedroom",
      ),
    ).toBe(false);
  });
  it("flags bedrooms and living rooms without windows", () => {
    let p = ok(addOpening(sketch(), "f1", "door", { axis: "x", line: 900, center: 700 }));
    for (const o of p.floors[1].openings!.filter((o) => o.kind === "window"))
      p = ok(removeOpening(p, "f1", o.id));
    const codes = projectAdvisories(p, "f1").filter((i) => i.code === "room-no-window");
    expect(codes.map((i) => i.source?.id).sort()).toEqual(["Bedroom", "Den"]);
    expect(codes[0].fixes[0].kind).toBe("add-window");
    const fixed = ok(addRoomWindow(p, "f1", "Bedroom"));
    expect(
      projectAdvisories(fixed, "f1").some((i) => i.code === "room-no-window" && i.source?.id === "Bedroom"),
    ).toBe(false);
  });
  it("warns about upper-floor doors that open onto a drop", () => {
    let p = ok(customizeOpenings(sketch(), "f1"));
    for (const o of p.floors[1].openings!.filter((o) => o.axis === "x" && o.line === 500))
      p = ok(removeOpening(p, "f1", o.id));
    p = ok(addOpening(p, "f1", "french-door", { axis: "x", line: 500, center: 800 }));
    const drop = projectAdvisories(p, "f1").filter((i) => i.code === "door-to-drop");
    expect(drop).toHaveLength(1);
    expect(drop[0].fixes[0]).toMatchObject({ kind: "edit", focus: "move" });
    expect(projectAdvisories(sketch()).some((i) => i.code === "door-to-drop")).toBe(false);
  });
  it("reports furniture standing in a doorway", () => {
    const p = sketch();
    expect(projectAdvisories(p).filter((i) => i.code === "furniture-blocks-door")).toEqual([]);
    const den = p.floors[1].rooms[1];
    const walls = deriveWalls(floorForGeometry(p, "f1"), "south");
    const [door] = roomDoorApproaches(den, walls);
    const at = (v: number, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, Math.round(v / 5) * 5));
    const blocked = ok(
      addFurniture(p, "f1", "Den", "plant-floor", {
        x: at(door.x + door.w / 2 - den.bounds.x, 35, den.bounds.w - 35),
        z: at(door.z + door.d / 2 - den.bounds.z, 35, den.bounds.d - 35),
      }),
    );
    const advice = projectAdvisories(blocked, "f1").filter(
      (i) => i.code === "furniture-blocks-door",
    );
    expect(advice).toHaveLength(1);
    expect(advice[0]).toMatchObject({
      source: { kind: "furniture", roomId: "Den", floorId: "f1" },
      fixes: [{ kind: "edit", focus: "move" }],
    });
  });
  it("produces no errors as advice for the corpus", () => {
    for (const { project } of corpus().slice(0, 10))
      expect(projectAdvisories(project).every((i) => i.severity === "warning")).toBe(true);
  });
});

describe("home checklist", () => {
  it("lists essentials and quests from project data", () => {
    const p = sketch();
    const checks = homeChecks(p);
    expect(checks.essentials.map((c) => c.id)).toEqual([
      "doors",
      "windows",
      "stairs",
      "kitchen",
      "bathroom",
      "tray",
    ]);
    expect(checks.essentials.every((c) => c.done)).toBe(true);
    expect(checks.quests.map((c) => [c.id, c.done])).toEqual([
      ["furnish", false],
      ["paint", false],
      ["roof", false],
      ["ensuite", false],
      ["garden", false],
    ]);
    let q = ok(addFurniture(p, "f1", "Bedroom", "wardrobe"));
    q = ok(setRoomWallColor(q, "f1", "Den", "sage"));
    q = ok(setStyle(q, { roof: { style: "hip", material: "terracotta", pitch: 30 } }));
    q = ok(customizeLandscape(q));
    expect(homeChecks(q).quests.filter((c) => c.id !== "ensuite").every((c) => c.done)).toBe(true);
    const trayed = ok(setAsideRoom(p, "f0", "Bath"));
    const after = homeChecks(trayed).essentials;
    expect(after.find((c) => c.id === "tray")!.done).toBe(false);
    expect(after.find((c) => c.id === "bathroom")!.done).toBe(false);
  });
  it("skips household essentials for shops and markets", () => {
    const market = corpus().find((c) => c.name === "blueprint-market-2f")!.project;
    expect(isCommercialOnly(market)).toBe(true);
    expect(homeChecks(market).essentials.map((c) => c.id)).toEqual(["doors", "stairs", "tray"]);
    expect(isCommercialOnly(createPreset("family"))).toBe(false);
  });
  it("offers a fix for the first room without a door", () => {
    let p = ok(customizeOpenings(sketch(), "f0"));
    for (const o of p.floors[0].openings!.filter((o) => o.kind === "door"))
      p = ok(removeOpening(p, "f0", o.id));
    const doors = homeChecks(p).essentials.find((c) => c.id === "doors")!;
    expect(doors.done).toBe(false);
    expect(doors.fix).toMatchObject({ kind: "add-door", floorId: "f0" });
  });
});
