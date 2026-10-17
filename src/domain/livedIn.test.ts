// M3 lived-in details: derived from the project, deterministic, inside their
// rooms and out of every door approach; never touching the saved home.
import { describe, expect, it } from "vitest";
import { TEMPLATES, buildTemplate } from "../onboarding/templates";
import { createBlueprint } from "./blueprints";
import { floorForGeometry } from "./core";
import { overlapArea, roomDoorApproaches } from "./details";
import { LIFE_CATALOG, freeStretches, frontVehicles, lifeFootprint, livedInDecor, type LivedInItem } from "./livedIn";
import { withStylePreset } from "./materials";
import { createPreset } from "./model";
import { suggestBalcony } from "./openSpaces";
import type { EditResult, Project } from "./types";
import { deriveWalls } from "./walls";

const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

/** Every template on two floors, a road on each side, and a home with a balcony. */
function homes(): Project[] {
  const out: Project[] = [];
  for (const t of TEMPLATES) {
    const r = buildTemplate(t, { floors: 2 });
    if (r.ok) out.push(r.project);
  }
  for (const road of ["north", "east", "west"] as const)
    out.push(
      ok(
        createBlueprint({ widthCm: 1219, depthCm: 1829, marginCm: 60, road, kind: "home", floors: 2, bedrooms: 3, unitsPerFloor: 2, bedroomsPerUnit: 2, shopsPerFloor: 2 }),
      ),
    );
  const villa = out[1];
  const balcony = suggestBalcony(villa, villa.floors[1].id, "south", 300, 120);
  if (balcony.ok) out.push(balcony.project);
  out.push(withStylePreset(createPreset("family"), "kerala"));
  return out;
}
const all = (p: Project) => p.floors.flatMap((f) => livedInDecor(p, f.id));

describe("livedInDecor", () => {
  const list = homes();

  it("is deterministic, and the seed varies it", () => {
    for (const p of list) expect(all(p)).toEqual(all(structuredClone(p)));
    const p = list[0];
    const a = livedInDecor(p, p.floors[0].id, 0),
      b = livedInDecor(p, p.floors[0].id, 7);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a).not.toEqual(b);
  });

  it("never changes the project", () => {
    for (const p of list) {
      const before = JSON.stringify(p);
      all(p);
      expect(JSON.stringify(p)).toBe(before);
    }
  });

  it("only names models the kit or the renderer can draw, with unique ids", () => {
    for (const p of list) {
      const items = all(p);
      for (const i of items) expect(LIFE_CATALOG.has(i.model) || i.model === "rangoli" || i.model === "string-lights", i.model).toBe(true);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    }
  });

  it("keeps every piece inside its room, and floor pieces out of door approaches and furniture", () => {
    let floorPieces = 0;
    for (const p of list)
      for (const f of p.floors) {
        const geometry = floorForGeometry(p, f.id);
        const walls = deriveWalls(geometry, p.plot.road);
        const items = livedInDecor(p, f.id);
        for (const item of items.filter((i) => i.roomId)) {
          const room = geometry.rooms.find((r) => r.id === item.roomId)!;
          const fp = lifeFootprint(item);
          const b = room.bounds;
          expect(fp.x, `${item.id} leaves ${room.name}`).toBeGreaterThanOrEqual(b.x);
          expect(fp.z, `${item.id} leaves ${room.name}`).toBeGreaterThanOrEqual(b.z);
          expect(fp.x + fp.w, `${item.id} leaves ${room.name}`).toBeLessThanOrEqual(b.x + b.w);
          expect(fp.z + fp.d, `${item.id} leaves ${room.name}`).toBeLessThanOrEqual(b.z + b.d);
          if (item.y !== 0) continue;
          floorPieces++;
          for (const door of roomDoorApproaches(room, walls)) expect(overlapArea(fp, door), `${item.id} blocks a door`).toBeLessThanOrEqual(0.5);
          // Floor pieces never overlap each other.
          for (const other of items)
            if (other !== item && other.roomId === item.roomId && other.y === 0)
              expect(overlapArea(fp, lifeFootprint(other)), `${item.id} on ${other.id}`).toBeLessThanOrEqual(0.5);
        }
      }
    expect(floorPieces).toBeGreaterThan(40);
  });

  it("dresses a home like a home", () => {
    const villa = list[1];
    const items = all(villa);
    const models = new Set(items.map((i) => i.model));
    for (const m of ["shoes", "toran", "newspaper", "pressure-cooker", "cat", "wall-clock", "diwali-diya", "rangoli", "string-lights"])
      expect(models, m).toContain(m);
    // One sleeping cat per floor at most; clothes dry once per floor plus the terrace.
    for (const f of villa.floors) expect(livedInDecor(villa, f.id).filter((i) => i.model === "cat").length).toBeLessThanOrEqual(1);
    // The pressure cooker stands on the counter, a wall clock hangs high.
    const cooker = items.find((i) => i.model === "pressure-cooker")!;
    expect(cooker.y).toBe(92);
    expect(items.find((i) => i.model === "wall-clock")!.y).toBe(190);
    // Diwali pieces are their own set.
    expect(items.filter((i) => i.set === "diwali").every((i) => ["diwali-diya", "rangoli", "string-lights"].includes(i.model))).toBe(true);
  });

  it("puts clothes out to dry on a roomy balcony, and on a flat roof's terrace", () => {
    const withBalcony = list.at(-2)!;
    const upper = withBalcony.floors[1];
    expect(upper.balconies.length).toBeGreaterThan(0);
    const drying = livedInDecor(withBalcony, upper.id).filter((i) => i.model === "clothesline");
    expect(drying.some((i) => i.id.startsWith("balcony:"))).toBe(true);
    expect(drying.some((i) => i.on === "roof")).toBe(true);
    // A sloping roof has no terrace.
    const kerala = list.at(-1)!;
    expect(all(kerala).some((i) => i.on === "roof")).toBe(false);
  });

  it("keeps outside pieces on the plot", () => {
    for (const p of list)
      for (const item of all(p).filter((i) => !i.roomId)) {
        const fp = lifeFootprint(item);
        expect(fp.x, item.id).toBeGreaterThanOrEqual(0);
        expect(fp.z, item.id).toBeGreaterThanOrEqual(0);
        expect(fp.x + fp.w, item.id).toBeLessThanOrEqual(p.plot.width);
        expect(fp.z + fp.d, item.id).toBeLessThanOrEqual(p.plot.depth);
      }
  });

  it("parks the scooter on the side away from the car, clear of the house", () => {
    const parked = list.map((p) => ({ p, v: frontVehicles({ ...p, parking: true }) })).filter((x) => x.v.length);
    expect(parked.length).toBeGreaterThan(0);
    for (const { p, v } of parked)
      for (const item of v) {
        const fp = lifeFootprint(item);
        const house = p.floors[0].footprint;
        expect(overlapArea(fp, house), item.id).toBe(0);
      }
  });
});

describe("helpers", () => {
  it("freeStretches removes blocked intervals", () => {
    expect(freeStretches(0, 100, [])).toEqual([[0, 100]]);
    expect(freeStretches(0, 100, [[20, 30], [25, 50], [90, 120]])).toEqual([
      [0, 20],
      [50, 90],
    ]);
    expect(freeStretches(0, 100, [[-10, 110]])).toEqual([]);
  });
  it("lifeFootprint turns with the piece", () => {
    const item: Pick<LivedInItem, "model" | "x" | "z" | "rotation"> = { model: "cycle", x: 100, z: 100, rotation: 0 };
    expect(lifeFootprint(item)).toEqual({ x: 75, z: 15, w: 50, d: 170 });
    const turned = lifeFootprint({ ...item, rotation: 90 });
    expect(turned.w).toBeCloseTo(170);
    expect(turned.d).toBeCloseTo(50);
  });
});
