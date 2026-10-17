import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { duplicateRoom, rotateRoom } from "./builder";
import { floorForGeometry } from "./core";
import {
  AUTO_LAYOUTS,
  FURNITURE_CATALOG,
  FURNITURE_FINISHES,
  autoFurniture,
  autoLayoutKind,
  furnitureFitsRoom,
  furnitureFootprint,
  furnitureParts,
  furnitureShapeProblems,
  hasFurnitureParts,
  materializeFurniture,
  openContext,
  rotateLayout,
  suggestedFurniture,
} from "./furniture";
import {
  addFurniture,
  clearFurniture,
  customizeFurniture,
  duplicateFurniture,
  findFurnitureSpot,
  moveFurniture,
  removeFurniture,
  resetFurniture,
  rotateFurniture,
  updateFurniture,
} from "./furnitureCommands";
import {
  deriveWalls,
  parseProject,
  setFloorCount,
  swapRoomUses,
  updateRoom,
  validateProjectIssues,
} from "./model";
import { roomDetails, roomDoorApproaches } from "./roomDetails";
import { rotateStagedRoom, setAsideRoom } from "./tray";
import type {
  EditResult,
  FurnitureItem,
  Project,
  Rect,
  Room,
  RoomKind,
} from "./types";

const room = (
  id: string,
  bounds: Rect,
  kind: RoomKind = "bedroom",
  name = id,
): Room => ({ id, name, kind, bounds, unitId: null });
function sketch(rooms: Room[]): Project {
  return {
    schemaVersion: 2,
    name: "Sketch",
    plot: { width: 2000, depth: 2200, north: 0, road: "south", setback: 100 },
    floors: [
      {
        id: "f0",
        name: "Ground floor",
        elevation: 0,
        height: 300,
        footprint: { x: 500, z: 500, w: 1000, d: 1000 },
        rooms,
        balconies: [],
        unitAreas: [],
      },
    ],
    units: [],
    verticalSpaces: [],
    garden: false,
    parking: false,
  };
}
const home = () =>
  sketch([
    room("bed", { x: 500, z: 500, w: 400, d: 400 }),
    room("living", { x: 900, z: 500, w: 600, d: 400 }, "living"),
    room("kitchen", { x: 500, z: 900, w: 1000, d: 600 }, "kitchen"),
  ]);
const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const errors = (p: Project) =>
  validateProjectIssues(p).filter((i) => i.severity === "error");
const items = (p: Project, index = 0) => p.floors[0].rooms[index].furniture!;

describe("automatic layouts", () => {
  it("are deterministic and match their parts", () => {
    const r = room("bed", { x: 100, z: 100, w: 400, d: 400 });
    const auto = autoFurniture(r);
    expect(autoFurniture({ ...r })).toStrictEqual(auto);
    expect(auto.map((i) => i.id)).toEqual(auto.map((_, k) => `auto:bed:${k}`));
    expect(auto[0].catalogId).toBe("bed-double");
    const owners = new Set(roomDetails(r).map((p) => p.ownerId));
    expect([...owners].sort()).toEqual(auto.map((i) => i.id).sort());
    // Each auto item's footprint encloses its parts.
    for (const item of auto) {
      const fp = furnitureFootprint(item);
      for (const part of roomDetails(r).filter((p) => p.ownerId === item.id)) {
        expect(part.bounds.x).toBeGreaterThanOrEqual(r.bounds.x + fp.x - 5);
        expect(part.bounds.x + part.bounds.w).toBeLessThanOrEqual(r.bounds.x + fp.x + fp.w + 5);
      }
    }
  });
  it("draw the same parts as their materialised copies", () => {
    const p = home();
    for (const r of p.floors[0].rooms) {
      const walls = deriveWalls(floorForGeometry(p, "f0"), "south");
      const auto = roomDetails(r, walls).map(({ ownerId, ...part }) => {
        void ownerId;
        return part;
      });
      const next = materializeFurniture(p, "f0", r.id).project;
      const explicit = roomDetails(next.floors[0].rooms.find((x) => x.id === r.id)!, walls);
      expect(explicit.length).toBe(auto.length);
    }
  });
  it("uses only catalog pieces at valid sizes", () => {
    const kinds: Array<[RoomKind, string]> = [
      ["bedroom", "Bedroom"],
      ["kitchen", "Kitchen"],
      ["dining", "Dining"],
      ["living", "Living"],
      ["bathroom", "Bathroom"],
      ["utility", "Utility"],
      ["utility", "Prayer room"],
      ["utility", "Home office"],
      ["shop", "Shop"],
    ];
    for (const [kind, name] of kinds) {
      const r = room("r", { x: 0, z: 0, w: 420, d: 380 }, kind, name);
      const layout = AUTO_LAYOUTS[autoLayoutKind(r)](r, 394, 354, openContext());
      expect(layout.items.length, name).toBeGreaterThan(0);
      for (const p of layout.items) {
        const shape = furnitureShapeProblems({ id: "x", catalogId: p.catalogId, x: 0, z: 0, rotation: p.rotation, w: p.w, d: p.d });
        expect(shape, `${name}: ${p.catalogId}`).toEqual([]);
      }
    }
  });
});

describe("catalog parts", () => {
  it("gives every catalog item procedural parts inside its footprint", () => {
    const r = room("r", { x: 200, z: 300, w: 600, d: 600 });
    for (const entry of FURNITURE_CATALOG) {
      expect(hasFurnitureParts(entry.id), entry.id).toBe(true);
      for (const rotation of [0, 90, 180, 270] as const) {
        const item: FurnitureItem = { id: "i", catalogId: entry.id, x: 300, z: 300, rotation };
        const parts = furnitureParts(r, item);
        expect(parts.length, entry.id).toBeGreaterThan(0);
        const fp = furnitureFootprint(item);
        for (const part of parts) {
          expect(part.ownerId).toBe("i");
          expect(part.bounds.x).toBeGreaterThanOrEqual(r.bounds.x + fp.x - 5);
          expect(part.bounds.z).toBeGreaterThanOrEqual(r.bounds.z + fp.z - 5);
          expect(part.bounds.x + part.bounds.w).toBeLessThanOrEqual(r.bounds.x + fp.x + fp.w + 5);
          expect(part.bounds.z + part.bounds.d).toBeLessThanOrEqual(r.bounds.z + fp.z + fp.d + 5);
        }
      }
    }
  });
  it("tints finish parts and suggests furniture per room", () => {
    const r = room("r", { x: 0, z: 0, w: 600, d: 600 });
    const parts = furnitureParts(r, {
      id: "s",
      catalogId: "sofa-3",
      x: 300,
      z: 300,
      rotation: 0,
      finish: "navy",
    });
    expect(parts.find((p) => p.role === "sofa base")?.color).toBe(
      FURNITURE_FINISHES.fabric.navy,
    );
    expect(parts.find((p) => p.role === "seat cushion")?.color).toBeUndefined();
    expect(suggestedFurniture("bathroom").map((i) => i.id)).toContain("toilet");
    expect(suggestedFurniture("bathroom").map((i) => i.id)).not.toContain("sofa-3");
  });
});

describe("materialising automatic furniture", () => {
  it("always produces valid explicit furniture for every corpus room", () => {
    for (const { name, project } of corpus()) {
      let p = project;
      let auto = 0,
        explicit = 0;
      for (const floor of project.floors)
        for (const r of floor.rooms) {
          const { project: next, idMap } = materializeFurniture(p, floor.id, r.id);
          p = next;
          auto += autoFurniture(
            r,
            deriveWalls(floorForGeometry(project, floor.id), project.plot.road),
          ).length;
          explicit += idMap.size;
        }
      // Materialising every room of a big block can pass the whole-home cap
      // (800 pieces); each room on its own must stay valid.
      const over = errors(p).some((i) => i.code === "limit");
      expect(errors(p).filter((i) => i.code !== "limit"), name).toEqual([]);
      for (const floor of p.floors)
        for (const r of floor.rooms) expect(r.furniture!.length, `${name}/${r.id}`).toBeLessThanOrEqual(32);
      expect(explicit, name).toBe(auto);
      if (!over) expect(parseProject(JSON.stringify(p))).toStrictEqual(p);
    }
  });
  it("keeps auto ids usable in commands", () => {
    const p = home();
    const [bed] = autoFurniture(p.floors[0].rooms[0]);
    const moved = moveFurniture(p, "f0", "bed", bed.id, { x: 200, z: 150 });
    expect(moved.ok).toBe(true);
    const next = ok(moved);
    expect(items(next).find((i) => i.catalogId === "bed-double")).toMatchObject({
      x: 200,
      z: 150,
    });
    expect(ok(removeFurniture(p, "f0", "bed", bed.id)).floors[0].rooms[0].furniture!.some(
      (i) => i.catalogId === "bed-double",
    )).toBe(false);
  });
});

describe("explicit furniture rules", () => {
  const base = () => ok(clearFurniture(home(), "f0", "living"));
  const put = (p: Project, list: FurnitureItem[]) => {
    const next = structuredClone(p);
    next.floors[0].rooms[1].furniture = list;
    return next;
  };
  const sofa: FurnitureItem = { id: "sofa", catalogId: "sofa-3", x: 300, z: 60, rotation: 0 };
  const codes = (p: Project) => errors(p).map((i) => i.code);
  it("accepts a valid layout and reports each kind of problem", () => {
    expect(codes(put(base(), [sofa]))).toEqual([]);
    expect(codes(put(base(), [{ ...sofa, catalogId: "jacuzzi" }]))).toEqual(["furniture-unknown"]);
    expect(codes(put(base(), [{ ...sofa, x: 302 }]))).toEqual(["furniture-shape"]);
    expect(codes(put(base(), [{ ...sofa, w: 300 }]))).toEqual(["furniture-shape"]);
    expect(codes(put(base(), [{ ...sofa, w: 200 }]))).toEqual([]);
    expect(codes(put(base(), [{ id: "t", catalogId: "toilet", x: 300, z: 200, rotation: 0, w: 50 }]))).toEqual(["furniture-shape"]);
    expect(codes(put(base(), [{ ...sofa, finish: "plaid" }]))).toEqual(["furniture-finish"]);
    expect(codes(put(base(), [{ ...sofa, z: 40 }]))).toEqual(["furniture-outside"]);
    expect(codes(put(base(), [sofa, { ...sofa, id: "sofa-b", x: 350 }]))).toEqual(["furniture-overlap"]);
    // A rug (floor layer) may sit under the sofa (standard layer).
    expect(codes(put(base(), [sofa, { id: "rug", catalogId: "rug-rect", x: 300, z: 150, rotation: 0 }]))).toEqual([]);
    expect(codes(put(base(), [sofa, { ...sofa, id: "bed" }]))).toContain("duplicate-id");
    const many = Array.from({ length: 33 }, (_, i): FurnitureItem => ({
      id: `p${i}`,
      catalogId: "plant-small",
      x: 30 + (i % 11) * 50,
      z: 30 + Math.floor(i / 11) * 50,
      rotation: 0,
    }));
    expect(codes(put(base(), many))).toEqual(["limit"]);
    expect(() =>
      parseProject(JSON.stringify(put(base(), [{ ...sofa, rotation: 45 as 0 }]))),
    ).toThrow("Project contains an invalid furniture item.");
  });
  it("warns when walk-blocking furniture sits in a doorway", () => {
    const p = base();
    const living = p.floors[0].rooms[1];
    const walls = deriveWalls(floorForGeometry(p, "f0"), "south");
    const [door] = roomDoorApproaches(living, walls);
    expect(door).toBeDefined();
    const snap = (n: number) => Math.round(n / 5) * 5;
    const fp = { w: 85, d: 85 };
    const lo = (size: number) => Math.ceil((10 + size / 2) / 5) * 5,
      hi = (span: number, size: number) => Math.floor((span - 10 - size / 2) / 5) * 5;
    const x = Math.min(hi(living.bounds.w, fp.w), Math.max(lo(fp.w), snap(door.x + door.w / 2 - living.bounds.x)));
    const z = Math.min(hi(living.bounds.d, fp.d), Math.max(lo(fp.d), snap(door.z + door.d / 2 - living.bounds.z)));
    const blocking = put(p, [{ id: "chair", catalogId: "armchair", x: snap(x), z: snap(z), rotation: 0 }]);
    const warnings = validateProjectIssues(blocking).filter((i) => i.code === "furniture-blocks-door");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: "warning", source: { kind: "furniture", id: "chair", roomId: "living" } });
    expect(errors(blocking)).toEqual([]);
    // Spot finding keeps the doorway clear when it can.
    const spot = findFurnitureSpot({ ...living, furniture: [] }, "armchair", undefined, { walls })!;
    const chair = furnitureFootprint({ catalogId: "armchair", ...spot });
    expect(roomDoorApproaches(living, walls).some((d) =>
      d.x < living.bounds.x + chair.x + chair.w && d.x + d.w > living.bounds.x + chair.x &&
      d.z < living.bounds.z + chair.z + chair.d && d.z + d.d > living.bounds.z + chair.z)).toBe(false);
  });
});

describe("furniture commands", () => {
  it("adds against a wall, moves, turns, restyles, copies and removes", () => {
    let p = ok(clearFurniture(home(), "f0", "living"));
    const added = addFurniture(p, "f0", "living", "sofa-3");
    expect(added.ok && added.focusId).toBe("living-sofa-3");
    p = ok(added);
    const sofa = items(p, 1)[0];
    expect(furnitureFootprint(sofa).z === 10 || furnitureFootprint(sofa).x === 10 ||
      furnitureFootprint(sofa).x + furnitureFootprint(sofa).w === 590 ||
      furnitureFootprint(sofa).z + furnitureFootprint(sofa).d === 390).toBe(true);
    p = ok(moveFurniture(p, "f0", "living", sofa.id, { x: 300, z: 300, rotation: 180 }));
    expect(items(p, 1)[0]).toMatchObject({ x: 300, z: 300, rotation: 180 });
    p = ok(rotateFurniture(p, "f0", "living", sofa.id, 1));
    expect(items(p, 1)[0].rotation).toBe(270);
    p = ok(updateFurniture(p, "f0", "living", sofa.id, { finish: "mustard", w: 200 }));
    expect(items(p, 1)[0]).toMatchObject({ finish: "mustard", w: 200 });
    expect(updateFurniture(p, "f0", "living", sofa.id, { finish: "plaid" }).ok).toBe(false);
    p = ok(updateFurniture(p, "f0", "living", sofa.id, { finish: null, w: 220 }));
    expect(items(p, 1)[0].finish).toBeUndefined();
    expect(items(p, 1)[0].w).toBeUndefined();
    p = ok(duplicateFurniture(p, "f0", "living", sofa.id));
    expect(items(p, 1)).toHaveLength(2);
    expect(errors(p)).toEqual([]);
    p = ok(addFurniture(p, "f0", "living", "coffee-table", { x: 102, z: 300 }));
    expect(items(p, 1)[2]).toMatchObject({ x: 100, z: 300, rotation: 0 });
    p = ok(removeFurniture(p, "f0", "living", items(p, 1)[2].id));
    expect(items(p, 1)).toHaveLength(2);
    expect(addFurniture(p, "f0", "living", "jacuzzi").ok).toBe(false);
    expect(ok(resetFurniture(p, "f0", "living")).floors[0].rooms[1].furniture).toBeUndefined();
  });
  it("re-parents an item into another room on the same floor", () => {
    let p = ok(clearFurniture(ok(customizeFurniture(home(), "f0", "bed")), "f0", "living"));
    p = ok(addFurniture(p, "f0", "bed", "plant-floor"));
    const plant = items(p).find((i) => i.catalogId === "plant-floor")!;
    p = ok(moveFurniture(p, "f0", "bed", plant.id, { roomId: "living", x: 100, z: 100 }));
    expect(items(p).some((i) => i.id === plant.id)).toBe(false);
    expect(items(p, 1).find((i) => i.id === plant.id)).toMatchObject({ x: 100, z: 100 });
    expect(errors(p)).toEqual([]);
  });
  it("keeps furniture in rooms where it belongs (no beds in kitchens)", () => {
    expect(furnitureFitsRoom("bed-double", "kitchen")).toBe(false);
    expect(furnitureFitsRoom("bed-double", "bedroom")).toBe(true);
    expect(furnitureFitsRoom("plant-small", "shop")).toBe(true);
    const p = ok(clearFurniture(ok(customizeFurniture(home(), "f0", "bed")), "f0", "living"));
    const add = addFurniture(p, "f0", "kitchen", "bed-double");
    expect(!add.ok && add.error).toBe("A double bed belongs in a bedroom.");
    const bedside = items(p).find((i) => i.catalogId === "bedside-table")!;
    const move = moveFurniture(p, "f0", "bed", bedside.id, { roomId: "living", x: 100, z: 100 });
    expect(!move.ok && move.error).toBe("A bedside table belongs in a bedroom.");
  });
  it("a room that changes use drops pieces that no longer belong", () => {
    // A kitchen turned dining room keeps its table and loses the counters.
    let p = ok(customizeFurniture(home(), "f0", "kitchen"));
    p = ok(addFurniture(p, "f0", "kitchen", "dining-table"));
    const changed = updateRoom(p, "f0", "kitchen", { kind: "dining", name: "Dining" });
    const dining = ok(changed).floors[0].rooms.find((r) => r.id === "kitchen")!;
    const kept = dining.furniture!.map((i) => i.catalogId);
    expect(kept).toContain("dining-table");
    expect(kept.every((id) => furnitureFitsRoom(id, "dining"))).toBe(true);
    expect(kept).not.toContain("kitchen-counter");
    expect(changed.ok && changed.notices?.some((n) => n.code === "furniture-removed")).toBe(true);
    // With only accessories left (art, rugs, a plant), the room furnishes itself for its new use.
    let q = ok(customizeFurniture(home(), "f0", "bed"));
    q = ok(addFurniture(q, "f0", "bed", "plant-floor"));
    const bare = updateRoom(q, "f0", "bed", { kind: "kitchen", name: "Kitchen" });
    expect(ok(bare).floors[0].rooms.find((r) => r.id === "bed")!.furniture).toBeUndefined();
    expect(bare.ok && bare.notices?.some((n) => n.code === "furniture-removed")).toBe(true);
  });
  it("automatic layouts only ever use pieces that belong in the room", () => {
    for (const { project } of corpus())
      for (const floor of project.floors) {
        const walls = deriveWalls(floorForGeometry(project, floor.id), project.plot.road);
        for (const r of floor.rooms)
          for (const item of autoFurniture(r, walls))
            expect(furnitureFitsRoom(item.catalogId, r.kind), `${r.name}: ${item.catalogId}`).toBe(true);
      }
  });
  it("fails cleanly when nothing fits", () => {
    const r = room("tiny", { x: 0, z: 0, w: 200, d: 200 });
    expect(findFurnitureSpot(r, "bed-double")).toBeNull();
    expect(findFurnitureSpot(r, "plant-small")).not.toBeNull();
    const p = ok(clearFurniture(sketch([room("tiny", { x: 500, z: 500, w: 200, d: 200 })]), "f0", "tiny"));
    const full = addFurniture(p, "f0", "tiny", "bed-double");
    expect(!full.ok && full.error).toBe(
      "There's no free space for a double bed in tiny. Move something or choose a bigger room.",
    );
  });
  it("works for rooms in the tray", () => {
    let p = ok(setAsideRoom(home(), "f0", "bed"));
    p = ok(addFurniture(p, null, "bed", "wardrobe"));
    const tray = p.stagedRooms![0].room;
    expect(tray.furniture!.some((i) => i.catalogId === "wardrobe")).toBe(true);
    p = ok(rotateStagedRoom(p, "bed"));
    expect(errors(p)).toEqual([]);
  });
});

describe("reconciling furniture through room edits", () => {
  const furnished = () => ok(customizeFurniture(home(), "f0", "kitchen"));
  it("keeps absolute positions when a room grows from its west edge", () => {
    const p = ok(clearFurniture(home(), "f0", "kitchen"));
    const q = ok(addFurniture(p, "f0", "kitchen", "dining-table", { x: 500, z: 300 }));
    const grown = ok(
      updateRoom(
        { ...q, floors: [{ ...q.floors[0], rooms: [q.floors[0].rooms[1], q.floors[0].rooms[2]] }] },
        "f0",
        "kitchen",
        { bounds: { x: 500, z: 900, w: 1000, d: 600 } },
      ),
    );
    expect(items(grown, 1)[0]).toMatchObject({ x: 500, z: 300 });
  });
  it("clamps, nudges or removes items with a notice when a room shrinks", () => {
    const p = furnished();
    const result = updateRoom(p, "f0", "kitchen", {
      bounds: { x: 500, z: 900, w: 300, d: 600 },
    });
    const next = ok(result);
    expect(errors(next)).toEqual([]);
    const kept = items(next, 2).length,
      removed = result.ok ? (result.notices ?? []).filter((n) => n.code === "furniture-removed") : [];
    expect(kept + removed.length).toBe(items(p, 2).length);
    expect(removed.every((n) => n.severity === "notice")).toBe(true);
  });
  it("turns furniture with rotateRoom and keeps it valid", () => {
    const p = ok(customizeFurniture(home(), "f0", "bed"));
    const before = items(p);
    const rotated = ok(rotateRoom(p, "f0", "bed"));
    expect(errors(rotated)).toEqual([]);
    expect(items(rotated).map((i) => i.rotation)).toEqual(
      rotateLayout(p.floors[0].rooms[0], before).map((i) => i.rotation),
    );
  });
  it("re-ids furniture when duplicating a room or adding floors", () => {
    let p = ok(customizeFurniture(home(), "f0", "bed"));
    p = { ...p, floors: [{ ...p.floors[0], rooms: [p.floors[0].rooms[0], p.floors[0].rooms[2]] }] };
    const copy = ok(duplicateRoom(p, "f0", "bed"));
    const ids = copy.floors[0].rooms.flatMap((r) => (r.furniture ?? []).map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(errors(copy)).toEqual([]);
  });
  it("lets furniture follow the use when two rooms swap", () => {
    const p = ok(customizeFurniture(home(), "f0", "bed"));
    const bedItems = items(p).map((i) => i.catalogId);
    const swapped = ok(swapRoomUses(p, "f0", "bed", "kitchen"));
    expect(swapped.floors[0].rooms[0].furniture).toBeUndefined();
    expect(swapped.floors[0].rooms[0].kind).toBe("kitchen");
    expect(swapped.floors[0].rooms[2].furniture!.map((i) => i.catalogId)).toEqual(bedItems);
    expect(errors(swapped)).toEqual([]);
    // Finishes stay with the physical room.
    const painted = structuredClone(p);
    painted.floors[0].rooms[0].wallColor = "sage";
    expect(ok(swapRoomUses(painted, "f0", "bed", "kitchen")).floors[0].rooms[0].wallColor).toBe("sage");
  });
  it("keeps setFloorCount copies valid", () => {
    const p = ok(customizeFurniture(home(), "f0", "bed"));
    const withStairs: Project = {
      ...p,
      verticalSpaces: [
        { id: "stairs", kind: "stairs", bounds: { x: 1300, z: 1300, w: 200, d: 200 }, floorIds: ["f0"], unitId: null },
      ],
      floors: [{ ...p.floors[0], rooms: p.floors[0].rooms.map((r) => r.id === "kitchen" ? { ...r, bounds: { ...r.bounds, w: 700 } } : r) }],
    };
    const two = ok(setFloorCount(withStairs, 2));
    expect(errors(two)).toEqual([]);
  });
});
