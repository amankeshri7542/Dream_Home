import { describe, expect, it } from "vitest";
import { applyStylePreset, roomCeiling, roomFalseCeiling, setRoomCeiling, setRoomFalseCeiling, stylePreset } from "./materials";
import { createPreset, parseProject } from "./model";
import { parseShared } from "../share/parse";
import type { Project } from "./types";

const withLook = (look: string): Project => {
  const result = applyStylePreset(createPreset("family"), look);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const rooms = (p: Project) => p.floors.flatMap((f) => f.rooms);

describe("ceilings and false ceilings", () => {
  it("gives the modern Looks a false ceiling in living, dining and bedrooms only", () => {
    const p = withLook("indian-modern");
    for (const room of rooms(p)) {
      const expected = room.kind === "living" || room.kind === "dining" || room.kind === "bedroom";
      expect(roomFalseCeiling(room, stylePreset(p)), room.name).toBe(expected);
      if (expected) expect(roomCeiling(room, stylePreset(p))).toBe("ivory-pop");
    }
  });

  it("keeps traditional Looks and homes with no Look plain, with teak in Kerala living rooms", () => {
    const kerala = withLook("kerala");
    for (const room of rooms(kerala)) expect(roomFalseCeiling(room, stylePreset(kerala))).toBe(false);
    const living = rooms(kerala).find((r) => r.kind === "living")!;
    expect(roomCeiling(living, stylePreset(kerala))).toBe("teak-panel");
    const plain = createPreset("family");
    for (const room of rooms(plain)) {
      expect(roomFalseCeiling(room, stylePreset(plain))).toBe(false);
      expect(roomCeiling(room, stylePreset(plain))).toBe("white-plaster");
    }
  });

  it("lets a room choose, undo by going back to automatic, and survives saving", () => {
    const p = createPreset("family");
    const floor = p.floors[0];
    const room = floor.rooms[0];
    const a = setRoomCeiling(p, floor.id, room.id, "teak-panel");
    if (!a.ok) throw new Error(a.error);
    const b = setRoomFalseCeiling(a.project, floor.id, room.id, true);
    if (!b.ok) throw new Error(b.error);
    const saved = parseProject(JSON.stringify(b.project));
    const back = saved.floors[0].rooms.find((r) => r.id === room.id)!;
    expect(back.ceiling).toBe("teak-panel");
    expect(back.falseCeiling).toBe(true);
    const auto = setRoomCeiling(saved, floor.id, room.id, "auto");
    const off = auto.ok ? setRoomFalseCeiling(auto.project, floor.id, room.id, null) : auto;
    if (!off.ok) throw new Error(off.error);
    const cleared = off.project.floors[0].rooms.find((r) => r.id === room.id)!;
    expect(cleared.ceiling).toBeUndefined();
    expect(cleared.falseCeiling).toBeUndefined();
  });

  it("refuses a ceiling it doesn't know, and a shared home drops one leniently", () => {
    const p = createPreset("family");
    expect(setRoomCeiling(p, p.floors[0].id, p.floors[0].rooms[0].id, "gold-leaf").ok).toBe(false);
    const odd = structuredClone(p) as unknown as { floors: { rooms: Record<string, unknown>[] }[] };
    odd.floors[0].rooms[0].ceiling = "gold-leaf";
    odd.floors[0].rooms[0].falseCeiling = "yes";
    expect(() => parseProject(JSON.stringify(odd))).toThrow();
    const shared = parseShared(odd).project;
    expect(shared.floors[0].rooms[0].ceiling).toBeUndefined();
    expect(shared.floors[0].rooms[0].falseCeiling).toBeUndefined();
  });
});
