import { describe, expect, it } from "vitest";
import {
  EXTERIOR_FINISHES,
  effectiveRoof,
  exteriorFinish,
  frontDoorColor,
  roomFloorMaterial,
  roomWallPaint,
  setExterior,
  setGarden,
  setParking,
  setRoomFloorMaterial,
  setRoomWallColor,
  setSite,
  setStyle,
  siteGround,
  trimColor,
} from "./materials";
import { customizeLandscape } from "./landscapeCommands";
import { createPreset, parseProject } from "./model";
import { roomFloorFinish } from "./roomDetails";
import { setAsideRoom } from "./tray";
import type { EditResult, Project } from "./types";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const preset = () => createPreset("family");
const first = (p: Project) => p.floors[0].rooms[0];

describe("material commands", () => {
  it("keeps the legacy exterior finish in sync with richer finishes", () => {
    const p = preset();
    const timber = ok(setExterior(p, "timber"));
    expect(timber.style).toEqual({ exterior: "timber" });
    expect(timber.finish).toBe("brick");
    expect(exteriorFinish(timber)).toBe("timber");
    const sand = ok(setExterior(timber, "sand"));
    expect(sand.style).toBeUndefined();
    expect(sand.finish).toBe("sand");
    expect(exteriorFinish(sand)).toBe("sand");
    expect(setExterior(p, "gold-leaf")).toEqual({ ok: false, error: "Choose a valid finish." });
  });
  it("sets floor materials with their legacy family, and resets them", () => {
    const p = preset();
    const room = first(p);
    const marble = ok(setRoomFloorMaterial(p, p.floors[0].id, room.id, "marble"));
    expect(first(marble)).toMatchObject({ floorMaterial: "marble", floorFinish: "stone" });
    expect(roomFloorMaterial(first(marble))).toBe("marble");
    expect(roomFloorFinish(first(marble))).toBe("stone");
    const auto = ok(setRoomFloorMaterial(marble, p.floors[0].id, room.id, "auto"));
    expect(first(auto)).toStrictEqual(room);
    expect(setRoomFloorMaterial(p, p.floors[0].id, room.id, "lava").ok).toBe(false);
    expect(setRoomFloorMaterial(p, p.floors[0].id, "nope", "oak").ok).toBe(false);
  });
  it("paints walls in the house and in the tray", () => {
    const p = preset();
    const room = first(p);
    const sage = ok(setRoomWallColor(p, p.floors[0].id, room.id, "sage"));
    expect(roomWallPaint(first(sage))).toBe("sage");
    expect(first(ok(setRoomWallColor(sage, p.floors[0].id, room.id, null)))).toStrictEqual(room);
    expect(setRoomWallColor(p, p.floors[0].id, room.id, "plaid").ok).toBe(false);
    const tray = ok(setAsideRoom(p, p.floors[0].id, room.id));
    const painted = ok(setRoomWallColor(tray, null, room.id, "navy"));
    expect(painted.stagedRooms![0].room.wallColor).toBe("navy");
  });
  it("sets trim, door and roof, and validates their ids", () => {
    const p = preset();
    const styled = ok(
      setStyle(p, {
        trim: "charcoal",
        frontDoor: "navy",
        roof: { style: "gable", material: "slate", pitch: 40 },
      }),
    );
    expect(trimColor(styled)).toBe("charcoal");
    expect(frontDoorColor(styled)).toBe("navy");
    expect(effectiveRoof(styled)).toEqual({ style: "gable", material: "slate", pitch: 40 });
    const cleared = ok(setStyle(styled, { trim: null, frontDoor: null, roof: null }));
    expect(cleared.style).toBeUndefined();
    const bad = setStyle(p, { roof: { style: "gable", material: "straw", pitch: 30 } });
    expect(bad).toMatchObject({ ok: false, error: "Choose a valid finish." });
    expect(setStyle(p, { trim: "chrome" }).ok).toBe(false);
  });
  it("sets the site ground and fence", () => {
    const p = preset();
    const site = ok(setSite(p, { ground: "gravel", fence: "picket" }));
    expect(site.site).toEqual({ ground: "gravel", fence: "picket" });
    expect(siteGround(site)).toBe("gravel");
    expect(ok(setSite(site, { ground: null, fence: null })).site).toBeUndefined();
    expect(setSite(p, { fence: "laser" }).ok).toBe(false);
  });
  it("toggles the garden and parking, adding a spot in a custom garden", () => {
    const p: Project = { ...preset(), parking: false };
    expect(ok(setGarden(p, false)).garden).toBe(false);
    const custom = ok(customizeLandscape(p));
    expect(custom.landscape!.some((i) => i.kind === "parking")).toBe(false);
    const parked = ok(setParking(custom, true));
    expect(parked.parking).toBe(true);
    expect(parked.landscape!.filter((i) => i.kind === "parking")).toHaveLength(1);
    const off = ok(setParking(parked, false));
    expect(off.landscape!.some((i) => i.kind === "parking")).toBe(false);
  });
  it("rejects unknown material ids on import", () => {
    const p = preset();
    const bad = structuredClone(p);
    bad.floors[0].rooms[0].wallColor = "tartan";
    expect(() => parseProject(JSON.stringify(bad))).toThrow("Choose a valid finish.");
    const roof = { ...p, style: { roof: { style: "dome", material: "slate", pitch: 30 } } };
    expect(() => parseProject(JSON.stringify(roof))).toThrow("Project contains an invalid style.");
  });
});

describe("bright Indian facades", () => {
  const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const dist = (a: string, b: string) => {
    const [x, y] = [rgbOf(a), rgbOf(b)];
    return x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0);
  };
  it("adds the bright finishes, each mapped to its nearest legacy family", () => {
    for (const id of ["saffron", "peach", "mint", "sky", "lime", "rose", "ochre", "two-tone"] as const) {
      const f = EXTERIOR_FINISHES[id];
      expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
      const nearest = (["ivory", "brick", "sand"] as const).reduce((best, l) =>
        dist(f.color, EXTERIOR_FINISHES[l].color) < dist(f.color, EXTERIOR_FINISHES[best].color) ? l : best,
      );
      expect(f.legacy, id).toBe(nearest);
      const p = ok(setExterior(preset(), id));
      expect(exteriorFinish(p)).toBe(id);
      expect(p.finish).toBe(nearest);
      expect(parseProject(JSON.stringify(p))).toStrictEqual(p);
    }
  });
});
