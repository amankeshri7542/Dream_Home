import { describe, expect, it } from "vitest";
import { floorForGeometry } from "./core";
import { addAttachedBathroom, ensuiteOf } from "./ensuite";
import { setAsideRoom } from "./tray";
import {
  createPreset,
  deriveWalls,
  parseProject,

  updateRoom,
  validateProject,
} from "./model";
import type { EditResult, Project } from "./types";
import { ensuiteHost, isPassable, sharedEdge, wallSideRooms } from "./walls";

const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
const bedroomOf = (p: Project) => p.floors[0].rooms.find((r) => r.kind === "bedroom")!;

/** Doors (auto) touching a room, with the rooms on either side of each. */
function doorsOf(p: Project, roomId: string) {
  const geo = floorForGeometry(p, p.floors[0].id);
  return deriveWalls(geo, p.plot.road).flatMap((w) =>
    w.openings
      .filter((o) => isPassable(o.kind))
      .map(() => wallSideRooms(geo, w))
      .filter((sides) => sides.includes(roomId)),
  );
}

describe("attached bathrooms", () => {
  it("adds a bathroom that opens only into its bedroom", () => {
    const start = createPreset("compact");
    const bed = bedroomOf(start);
    const p = ok(addAttachedBathroom(start, start.floors[0].id, bed.id));
    expect(validateProject(p)).toEqual([]);
    const bath = ensuiteOf(p.floors[0].rooms, bed.id)!;
    expect(bath).toBeTruthy();
    expect(bath.kind).toBe("bathroom");
    expect(sharedEdge(bath.bounds, p.floors[0].rooms.find((r) => r.id === bed.id)!.bounds)).toBeGreaterThanOrEqual(120);
    const doors = doorsOf(p, bath.id);
    expect(doors.length).toBeGreaterThan(0);
    for (const sides of doors) expect([...sides].sort()).toEqual([bath.id, bed.id].sort());
    // The bedroom still has its own way in from elsewhere.
    expect(doorsOf(p, bed.id).some((sides) => !sides.includes(bath.id))).toBe(true);
  });

  it("refuses a second one, and non-bedrooms", () => {
    const start = createPreset("compact");
    const bed = bedroomOf(start);
    const p = ok(addAttachedBathroom(start, start.floors[0].id, bed.id));
    const again = addAttachedBathroom(p, p.floors[0].id, bed.id);
    expect(!again.ok && again.error).toMatch(/already has its own bathroom/);
    const kitchen = start.floors[0].rooms.find((r) => r.kind === "kitchen")!;
    expect(addAttachedBathroom(start, start.floors[0].id, kitchen.id).ok).toBe(false);
  });

  it("carves one from a roomy bedroom when there's no free floor beside it", () => {
    const start = createPreset("compact");
    const floor = start.floors[0];
    // One big bedroom filling the whole footprint: no free floor anywhere.
    const packed: Project = {
      ...start,
      floors: [{ ...floor, rooms: [{ ...bedroomOf(start), bounds: { ...floor.footprint } }] }],
      verticalSpaces: [],
    };
    const result = addAttachedBathroom(packed, floor.id, bedroomOf(start).id);
    const p = ok(result);
    const bed = p.floors[0].rooms.find((r) => r.kind === "bedroom")!;
    const bath = ensuiteOf(p.floors[0].rooms, bed.id)!;
    expect(bed.bounds.w * bed.bounds.d).toBeLessThan(floor.footprint.w * floor.footprint.d);
    expect(ensuiteHost(p.floors[0].rooms, bath)?.id).toBe(bed.id);
    expect(validateProject(p)).toEqual([]);
  });

  it("forgets the link when the bedroom changes use or is set aside", () => {
    const start = createPreset("compact");
    const bed = bedroomOf(start);
    const p = ok(addAttachedBathroom(start, start.floors[0].id, bed.id));
    const bathId = ensuiteOf(p.floors[0].rooms, bed.id)!.id;
    const studied = updateRoom(p, p.floors[0].id, bed.id, { kind: "utility", name: "Study" });
    expect(studied.ok).toBe(true);
    expect(ok(studied).floors[0].rooms.find((r) => r.id === bathId)!.attachedTo).toBeUndefined();
    expect(studied.ok && studied.notices?.some((n) => n.code === "ensuite-unlinked")).toBe(true);
    const aside = ok(setAsideRoom(p, p.floors[0].id, bed.id));
    expect(aside.floors[0].rooms.find((r) => r.id === bathId)!.attachedTo).toBeUndefined();
  });

  it("survives saving and loading", () => {
    const start = createPreset("compact");
    const p = ok(addAttachedBathroom(start, start.floors[0].id, bedroomOf(start).id));
    const loaded = parseProject(JSON.stringify(p));
    expect(loaded).toEqual(p);
    expect(() => parseProject(JSON.stringify({
      ...p,
      floors: [{ ...p.floors[0], rooms: p.floors[0].rooms.map((r) => ({ ...r, attachedTo: 5 as unknown as string })) }],
    }))).toThrow(/attached bathroom/);
  });
});
