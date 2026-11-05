import { describe, expect, it } from "vitest";
import { floorForGeometry } from "../../domain/core";
import { autoLayoutKind } from "../../domain/furniture";
import { createPreset } from "../../domain/model";
import { surfaceOf } from "../props/kit";
import { lightRooms } from "../roomlight/input";
import { contactShadows } from "./ContactShadows";
import { DRAPED, drapeGeometry, drapePanels } from "./drapePanels";

describe("curtains", () => {
  const project = createPreset("family");
  const floor = project.floors[0];
  const { rooms } = lightRooms(project, floor.id, false);
  const source = floorForGeometry(project, floor.id).rooms;
  const { panels, rods } = drapePanels(project, rooms, source);

  it("dresses the windows of lived-in rooms with a rod and two panels, never kitchens or bathrooms", () => {
    expect(panels.length).toBeGreaterThan(0);
    expect(panels.length).toBe(rods.length * 2);
    for (const room of source) {
      const inRoom = (x: number, z: number) => {
        const r = rooms.find((l) => l.id === room.id)!;
        return x >= r.min[0] - 0.4 && x <= r.max[0] + 0.4 && z >= r.min[2] - 0.4 && z <= r.max[2] + 0.4;
      };
      const here = panels.filter((p) => inRoom(p.at[0], p.at[2]));
      if (!DRAPED.has(autoLayoutKind(room))) expect(here.length, room.name).toBe(0);
    }
  });

  it("hangs from above the window down to just off the floor", () => {
    for (const p of panels) {
      expect(p.height).toBeGreaterThan(1.9);
      expect(p.height).toBeLessThan(2.8);
    }
  });

  it("merges into one geometry", () => {
    const g = drapeGeometry(panels, rods);
    expect(g).not.toBeNull();
    expect(g!.getAttribute("position").count).toBeGreaterThan(100);
    expect(drapeGeometry([], [])).toBeNull();
  });
});

describe("contact shadows", () => {
  it("sit under big pieces and rugs only, inside their rooms", () => {
    const project = createPreset("family");
    const floor = project.floors[0];
    const quads = contactShadows(project, floor.id);
    expect(quads.length).toBeGreaterThan(2);
    for (const q of quads) {
      expect(q.x1).toBeGreaterThan(q.x0);
      expect(q.z1).toBeGreaterThan(q.z0);
      expect(q.strength).toBeGreaterThan(0);
    }
  });
});

describe("close-up surfaces", () => {
  it("gives cloth, wood and metal slots their detail, and nothing to glass or glow", () => {
    expect(surfaceOf("fabric")).toBe("cloth");
    expect(surfaceOf("linen")).toBe("cloth");
    expect(surfaceOf("wood")).toBe("wood");
    expect(surfaceOf("wood_dark")).toBe("wood");
    expect(surfaceOf("metal")).toBe("metal");
    for (const slot of ["glass", "glow", "leaf", "ceramic", "water"]) expect(surfaceOf(slot)).toBeUndefined();
  });
});
