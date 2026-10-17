// M3 designer interiors: every automatic layout, in every room size and door
// position, stays inside the room, never overlaps, never blocks a door and
// keeps a walkway between furniture groups — and roomy rooms look styled.
import { describe, expect, it } from "vitest";
import {
  AUTO_WALKWAY,
  autoFurniture,
  fitsRoom,
  footprintGap,
  furnitureBaseY,
  furnitureCatalogItem,
  furnitureCollisions,
  furnitureDoorConflicts,
  furnitureFitsRoom,
  furnitureFootprint,
  furnitureShapeProblems,
  normalizeAutoItem,
} from "./furniture";
import { roomDoorApproaches } from "./details";
import type { EdgeSide, FurnitureItem, Rect, Room, RoomKind, Wall } from "./types";

type Opening = { side: EdgeSide; kind: "door" | "window"; at: number; width?: number };
function walled(room: Room, openings: Opening[]): Wall[] {
  const { x, z, w, d } = room.bounds;
  return openings.map((o, i) => {
    const axis = o.side === "north" || o.side === "south" ? "x" : "z";
    const length = axis === "x" ? w : d;
    const door = o.kind === "door";
    return {
      id: `w${i}`,
      axis,
      x: o.side === "east" ? x + w : x,
      z: o.side === "south" ? z + d : z,
      length,
      exterior: false,
      openings: [
        {
          id: `o${i}`,
          kind: o.kind,
          offset: Math.round(length * o.at),
          width: o.width ?? (door ? 90 : 150),
          height: door ? 215 : 135,
          sill: door ? 0 : 90,
          auto: true,
        },
      ],
    } satisfies Wall;
  });
}
const KINDS: Array<[RoomKind, string]> = [
  ["bedroom", "Bedroom"],
  ["living", "Living room"],
  ["kitchen", "Kitchen"],
  ["dining", "Dining"],
  ["bathroom", "Bathroom"],
  ["utility", "Pooja room"],
  ["utility", "Study"],
  ["utility", "Utility"],
  ["shop", "Shop"],
];
const SIZES: Array<[number, number]> = [];
for (const w of [180, 240, 300, 360, 420, 500, 600])
  for (const d of [180, 240, 300, 380, 500]) SIZES.push([w, d]);
const DOORS: Opening[][] = [
  [],
  [{ side: "south", kind: "door", at: 0.5 }],
  [{ side: "north", kind: "door", at: 0.25 }, { side: "east", kind: "window", at: 0.5 }],
  [{ side: "west", kind: "door", at: 0.8 }, { side: "south", kind: "window", at: 0.4 }],
  [
    { side: "east", kind: "door", at: 0.3 },
    { side: "north", kind: "window", at: 0.5 },
    { side: "west", kind: "window", at: 0.5, width: 120 },
  ],
];
/** Major pieces that must keep a walkway to other groups (or sit snug). */
const GROUP: Record<string, string> = {
  "bed-double": "sleep",
  "bed-single": "sleep",
  "bedside-table": "sleep",
  wardrobe: "store",
  bookshelf: "store",
  sideboard: "store",
  "sofa-3": "seat",
  "sofa-2": "seat",
  "tv-panel": "media",
  "dining-table": "dine",
  "dining-chair": "dine",
  desk: "work",
  "office-chair": "work",
};
const room = (kind: RoomKind, name: string, w: number, d: number): Room => ({
  id: "r",
  name,
  kind,
  bounds: { x: 400, z: 300, w, d },
  unitId: null,
});
const plot = (r: Room, fp: Rect): Rect => ({ ...fp, x: fp.x + r.bounds.x, z: fp.z + r.bounds.z });
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;

describe("designer layouts hold up in every room", () => {
  it.each(KINDS)("%s (%s): inside, apart, clear of doors, walkable", (kind, name) => {
    let checked = 0;
    for (const [w, d] of SIZES)
      for (const doors of DOORS) {
        const r = room(kind, name, w, d);
        const walls = walled(r, doors);
        const items = autoFurniture(r, walls);
        const where = `${name} ${w}×${d} ${doors.map((o) => `${o.kind}@${o.side}`).join(",")}`;
        expect(autoFurniture({ ...r }, walls), `${where} deterministic`).toStrictEqual(items);
        for (const item of items) {
          const entry = furnitureCatalogItem(item.catalogId)!;
          expect(furnitureFitsRoom(item.catalogId, kind), `${where}: ${item.catalogId} belongs`).toBe(true);
          expect(fitsRoom(r, furnitureFootprint(item)), `${where}: ${item.catalogId} inside`).toBe(true);
          expect(furnitureCollisions(item, items), `${where}: ${item.catalogId} overlaps`).toEqual([]);
          const shape = furnitureShapeProblems(normalizeAutoItem(item, "x"));
          expect(shape, `${where}: ${item.catalogId} shape`).toEqual([]);
          // Small styling pieces always sit on a surface or the floor (never float).
          if (entry.layer === "decor") expect(furnitureBaseY(item, items)).toBeGreaterThanOrEqual(0);
        }
        // No walk-blocking piece (or decor) in a door approach.
        expect(furnitureDoorConflicts({ ...r, furniture: items }, walls), `${where} doors`).toEqual([]);
        const approaches = roomDoorApproaches(r, walls);
        for (const item of items) {
          const layer = furnitureCatalogItem(item.catalogId)!.layer;
          if (layer !== "standard" && layer !== "decor") continue;
          const fp = plot(r, furnitureFootprint(item));
          expect(approaches.some((a) => overlap(a, fp)), `${where}: ${item.catalogId} in doorway`).toBe(false);
        }
        // Walkway: major pieces of different groups are snug or 80 cm apart.
        for (const a of items)
          for (const b of items) {
            const ga = GROUP[a.catalogId],
              gb = GROUP[b.catalogId];
            if (!ga || !gb || ga === gb || a.id >= b.id) continue;
            const gap = footprintGap(furnitureFootprint(a), furnitureFootprint(b));
            expect(gap <= 10 || gap >= AUTO_WALKWAY - 0.01, `${where}: ${a.catalogId}↔${b.catalogId} ${gap}`).toBe(true);
          }
        checked++;
      }
    expect(checked).toBe(SIZES.length * DOORS.length);
  });

  it("drops optional pieces first in small rooms", () => {
    const small = autoFurniture(room("bedroom", "Bedroom", 180, 180)).map((i) => i.catalogId);
    expect(small).toEqual(["sleeping-mat"]);
    const snug = autoFurniture(room("bedroom", "Bedroom", 240, 300)).map((i) => i.catalogId);
    expect(snug.some((id) => id.startsWith("bed-"))).toBe(true);
    const roomy = autoFurniture(room("bedroom", "Bedroom", 420, 420)).map((i) => i.catalogId);
    expect(roomy.length).toBeGreaterThan(snug.length);
    expect(autoFurniture(room("bathroom", "Bathroom", 120, 150)).map((i) => i.catalogId)).toContain("toilet");
  });
});

describe("designer layouts look styled", () => {
  const ids = (kind: RoomKind, name: string, w: number, d: number, openings: Opening[] = []) => {
    const r = room(kind, name, w, d);
    return autoFurniture(r, walled(r, openings)).map((i) => i.catalogId);
  };
  const has = (list: string[], ...want: string[]) => {
    for (const id of want) expect(list, id).toContain(id);
  };
  it("bedroom: bed on a focal wall with panel, a pair of bedside tables and lamps, wardrobe, rug, art, curtains, fan", () => {
    const list = ids("bedroom", "Bedroom", 380, 420, [
      { side: "south", kind: "door", at: 0.8 },
      { side: "east", kind: "window", at: 0.5 },
    ]);
    has(list, "bed-double", "bed-panel", "wardrobe", "rug-rect", "wall-art", "curtains", "ceiling-fan");
    expect(list.filter((id) => id === "bedside-table")).toHaveLength(2);
    expect(list.filter((id) => id === "table-lamp")).toHaveLength(2);
  });
  it("bedroom: the bed never has the door behind it when another wall works", () => {
    const r = room("bedroom", "Bedroom", 360, 400);
    const walls = walled(r, [{ side: "north", kind: "door", at: 0.5 }]);
    const bed = autoFurniture(r, walls).find((i) => i.catalogId.startsWith("bed-"))!;
    expect(bed.rotation).not.toBe(0);
  });
  it("living: sofa facing a TV wall, coffee table on a rug, armchair, layered lamps, plant, art, fan", () => {
    const list = ids("living", "Living room", 480, 440, [
      { side: "south", kind: "door", at: 0.85 },
      { side: "west", kind: "window", at: 0.5 },
    ]);
    has(list, "tv-panel", "coffee-table", "rug-rect", "armchair", "floor-lamp", "table-lamp", "plant-floor", "wall-art", "ceiling-fan");
    expect(list.some((id) => id === "sofa-3" || id === "sofa-2")).toBe(true);
    const r = room("living", "Living room", 480, 440);
    const items = autoFurniture(r);
    const sofa = items.find((i) => i.catalogId.startsWith("sofa"))!;
    const tv = items.find((i) => i.catalogId === "tv-panel")!;
    expect((sofa.rotation + 180) % 360).toBe(tv.rotation);
  });
  it("living: a jhula swing in big rooms", () => {
    expect(ids("living", "Living room", 600, 500)).toContain("jhula");
  });
  it("kitchen: counter with sink and hob, chimney over the hob, fridge, wall cabinets, backsplash", () => {
    const list = ids("kitchen", "Kitchen", 320, 300, [{ side: "south", kind: "door", at: 0.5 }]);
    has(list, "kitchen-counter", "kitchen-chimney", "fridge", "kitchen-upper", "backsplash");
    const r = room("kitchen", "Kitchen", 320, 300);
    const run = autoFurniture(r).find((i) => i.catalogId === "kitchen-counter")!;
    expect(run.w).toBeGreaterThanOrEqual(200);
  });
  it("dining: table, chairs, pendant, sideboard", () => {
    const list = ids("dining", "Dining", 360, 380);
    has(list, "dining-table", "pendant-light", "sideboard");
    expect(list.filter((id) => id === "dining-chair").length).toBeGreaterThanOrEqual(4);
  });
  it("bathroom: toilet, vanity with mirror cabinet, shower", () => {
    has(ids("bathroom", "Bathroom", 220, 240), "toilet", "vanity", "mirror-cabinet", "shower");
  });
  it("pooja: shrine with mat and diyas, door clear", () => {
    const list = ids("utility", "Pooja room", 200, 220, [{ side: "south", kind: "door", at: 0.5 }]);
    has(list, "prayer-shrine", "prayer-mat", "diya");
  });
  it("study: desk, chair, bookshelf, table lamp", () => {
    has(ids("utility", "Study", 300, 300), "desk", "office-chair", "bookshelf", "table-lamp");
  });
  it("utility: washing machine, counter, shoe rack", () => {
    has(ids("utility", "Utility", 240, 220), "washing-machine", "laundry-counter", "shoe-rack");
  });
  it("lamps rest on the furniture under them", () => {
    const r = room("bedroom", "Bedroom", 380, 420);
    const items = autoFurniture(r);
    const lamps = items.filter((i) => i.catalogId === "table-lamp");
    expect(lamps.length).toBe(2);
    for (const lamp of lamps) expect(furnitureBaseY(lamp, items)).toBe(50);
    const loose: FurnitureItem = { id: "l", catalogId: "table-lamp", x: 30, z: 30, rotation: 0 };
    expect(furnitureBaseY(loose, items)).toBe(0);
  });
});

describe("adding decor", () => {
  it("puts a lamp or a vase on a surface, not the floor", async () => {
    const { addFurniture, clearFurniture } = await import("./furnitureCommands");
    const { createPreset } = await import("./model");
    const okP = (r: import("./types").EditResult) => {
      if (!r.ok) throw new Error(r.error);
      return r.project;
    };
    let p = createPreset("family");
    const f = p.floors[0].id;
    const living = p.floors[0].rooms.find((r) => r.kind === "living")!;
    p = okP(clearFurniture(p, f, living.id));
    p = okP(addFurniture(p, f, living.id, "console-table"));
    p = okP(addFurniture(p, f, living.id, "vase-books"));
    const items = p.floors[0].rooms.find((r) => r.id === living.id)!.furniture!;
    const vase = items.find((i) => i.catalogId === "vase-books")!;
    expect(furnitureBaseY(vase, items)).toBe(80);
  });
});
