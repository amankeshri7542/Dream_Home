import { describe, expect, it } from "vitest";
import {
  roomDetails,
  roomDoorApproaches,
  roomFloorFinish,
} from "./roomDetails";
import { ROOM_META, type Room, type RoomKind, type Wall } from "./types";

const makeRoom = (kind: RoomKind, w = 320, d = 360): Room => ({
  id: "test-room",
  kind,
  name: ROOM_META[kind].label,
  bounds: { x: 150, z: 250, w, d },
  unitId: null,
});

describe("recognisable room details", () => {
  it.each(Object.keys(ROOM_META) as RoomKind[])(
    "keeps all %s fixtures contained in small and large rooms in every direction",
    (kind) => {
      for (const w of [120, 180, 320, 600])
        for (const d of [120, 210, 360, 600]) {
          for (const furnishingRotation of [0, 90, 180, 270] as const) {
            const room = { ...makeRoom(kind, w, d), furnishingRotation };
            const details = roomDetails(room);
            expect(details.length).toBeGreaterThan(0);
            for (const part of details) {
              expect(part.bounds.x).toBeGreaterThanOrEqual(
                room.bounds.x + 12.99,
              );
              expect(part.bounds.z).toBeGreaterThanOrEqual(
                room.bounds.z + 12.99,
              );
              expect(part.bounds.x + part.bounds.w).toBeLessThanOrEqual(
                room.bounds.x + w - 12.99,
              );
              expect(part.bounds.z + part.bounds.d).toBeLessThanOrEqual(
                room.bounds.z + d - 12.99,
              );
              expect(part.height).toBeGreaterThan(0);
            }
          }
        }
    },
  );

  it.each([
    ["bedroom", "bed base"],
    ["kitchen", "sink bowl"],
    ["kitchen", "cooking pot"],
    ["dining", "dining table"],
    ["living", "sofa base"],
    ["bathroom", "toilet bowl"],
    ["utility", "washing machine"],
    ["shop", "display shelf"],
  ] as const)("gives %s the recognisable %s", (kind, role) => {
    expect(
      roomDetails(makeRoom(kind)).some((detail) => detail.role === role),
    ).toBe(true);
  });

  it("rotates a full-size bed while preserving real dimensions", () => {
    const room = makeRoom("bedroom", 400, 400);
    const north = roomDetails({ ...room, furnishingRotation: 0 }).find(
      (part) => part.role === "bed base",
    )!;
    const east = roomDetails({ ...room, furnishingRotation: 90 }).find(
      (part) => part.role === "bed base",
    )!;
    expect(north.bounds.w).toBe(155);
    expect(north.bounds.d).toBe(200);
    expect(east.bounds.w).toBe(200);
    expect(east.bounds.d).toBe(155);
    expect(east.bounds.x).toBeGreaterThan(north.bounds.x);
  });

  it("uses a folded sleeping mat when a real bed cannot fit", () => {
    const details = roomDetails(makeRoom("bedroom", 120, 120));
    expect(details.some((part) => part.role === "bed base")).toBe(false);
    expect(details.some((part) => part.role === "folded sleeping mat")).toBe(
      true,
    );
  });

  it("chooses a bed orientation away from an available door approach", () => {
    const room = makeRoom("bedroom", 320, 360);
    const wall: Wall = {
      id: "north-door",
      axis: "x",
      x: 150,
      z: 250,
      length: 320,
      exterior: false,
      opening: { kind: "door", width: 90, height: 215, sill: 0 },
    };
    const bed = roomDetails(room, [wall]).find(
      (part) => part.role === "bed base",
    )!;
    const door = roomDoorApproaches(room, [wall])[0];
    expect(bed.bounds.z).toBeGreaterThanOrEqual(door.z + door.d);
  });

  it("supports distinct study and prayer cues without changing room geometry", () => {
    expect(
      roomDetails({ ...makeRoom("utility"), name: "Study" }).some(
        (p) => p.role === "desk",
      ),
    ).toBe(true);
    expect(
      roomDetails({ ...makeRoom("utility"), name: "Prayer room" }).some(
        (p) => p.role === "prayer platform",
      ),
    ).toBe(true);
  });

  it("honours empty rooms and explicit floor finishes deterministically", () => {
    const room = makeRoom("bedroom");
    const original = JSON.stringify(room);
    expect(roomDetails(room)).toEqual(roomDetails(room));
    expect(JSON.stringify(room)).toBe(original);
    expect(roomDetails({ ...room, furnishing: "none" })).toEqual([]);
    expect(roomFloorFinish(room)).toBe("wood");
    expect(roomFloorFinish({ ...room, floorFinish: "tile" })).toBe("tile");
    expect(roomFloorFinish(makeRoom("bathroom"))).toBe("tile");
  });
});
