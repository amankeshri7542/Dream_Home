import { describe, expect, it } from "vitest";
import { createPreset } from "../../domain/model";
import { lighting } from "../environment/timeOfDay";
import { lightRooms, lightSky } from "./input";
import { gridIrradiance, solveLightGrid, type LightGrid, type LightRoom, type LightSky, type RGB, type V3 } from "./solve";

const WHITE: RGB = [0.8, 0.8, 0.8];
/** A 4 × 3 × 5 m white room, with a window in the wall at z = 0 unless told otherwise. */
function room(over: Partial<LightRoom> = {}): LightRoom {
  return {
    id: "a",
    min: [0, 0, 0],
    max: [4, 3, 5],
    walls: { xMin: WHITE, xMax: WHITE, zMin: WHITE, zMax: WHITE },
    floor: WHITE,
    ceiling: WHITE,
    openings: [{ p: [1, 1, 0], u: [2, 0, 0], v: [0, 1.4, 0], inward: [0, 0, 1], kind: "window" }],
    lamps: [],
    ...over,
  };
}
const SKY: LightSky = { sky: [2, 2.2, 2.6], ground: [0.6, 0.5, 0.4], sun: null, target: 2.3 };
const spec = { min: [-0.5, -0.4, -0.5] as V3, max: [4.5, 3.4, 5.5] as V3, cell: 0.25, cellY: 0.4 };

const cellAt = (g: LightGrid, x: number, y: number, z: number) => {
  const i = Math.floor(((x - g.min[0]) / g.size[0]) * g.nx),
    j = Math.floor(((y - g.min[1]) / g.size[1]) * g.ny),
    k = Math.floor(((z - g.min[2]) / g.size[2]) * g.nz);
  return [i, j, k] as const;
};
const irradiance = (g: LightGrid, at: V3, n: V3) => {
  const [i, j, k] = cellAt(g, at[0], at[1], at[2]);
  const e = gridIrradiance(g, i, j, k, n);
  return e[0] * 0.2126 + e[1] * 0.7152 + e[2] * 0.0722;
};

describe("room light", () => {
  const g = solveLightGrid([room()], SKY, spec);

  it("is brighter near the window than at the far end", () => {
    expect(irradiance(g, [2, 1.2, 1], [0, 0, -1])).toBeGreaterThan(irradiance(g, [2, 1.2, 4.2], [0, 0, -1]));
  });

  it("lights a surface facing the window more than one with its back to it", () => {
    expect(irradiance(g, [2, 1.5, 2.5], [0, 0, -1])).toBeGreaterThan(irradiance(g, [2, 1.5, 2.5], [0, 0, 1]));
  });

  it("leaves the wall with the window dimmer than the wall facing it", () => {
    // The photographer's backlit wall: exact for axis-aligned surfaces.
    expect(irradiance(g, [0.6, 1.6, 0.2], [0, 0, 1])).toBeLessThan(irradiance(g, [2, 1.6, 4.8], [0, 0, -1]));
  });

  it("gets darker into a corner, with no screen-space help", () => {
    const middle = irradiance(g, [2, 1.5, 4.7], [0, 0, -1]);
    const corner = irradiance(g, [0.15, 0.2, 4.7], [0, 0, -1]);
    expect(corner).toBeLessThan(middle);
  });

  it("doesn't leak: a sealed room next door stays dark", () => {
    const sealed = room({ id: "b", min: [4.3, 0, 0], max: [8, 3, 5], openings: [] });
    const both = solveLightGrid([room(), sealed], SKY, { ...spec, max: [8.5, 3.4, 5.5] });
    expect(irradiance(both, [6, 1.5, 2.5], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("passes light through an open door to the next room", () => {
    const door = room({
      id: "b",
      min: [4.3, 0, 0],
      max: [8, 3, 5],
      openings: [{ p: [4.3, 0, 2], u: [0, 0, 1], v: [0, 2.1, 0], inward: [1, 0, 0], kind: "portal", to: "a" }],
    });
    const both = solveLightGrid([room(), door], SKY, { ...spec, max: [8.5, 3.4, 5.5] });
    expect(irradiance(both, [5, 1.2, 2.5], [-1, 0, 0])).toBeGreaterThan(0.02);
  });

  it("carries a floor's colour to the ceiling", () => {
    const warmth = (grid: LightGrid) => {
      const [i, j, k] = cellAt(grid, 2, 2.8, 2.5);
      return grid.total[(i + grid.nx * (j + grid.ny * k)) * 4 + 3];
    };
    const red = solveLightGrid([room({ floor: [0.7, 0.2, 0.12], ceiling: WHITE })], SKY, spec);
    expect(warmth(red)).toBeGreaterThan(warmth(g));
  });

  it("warms the room when the sun reaches it", () => {
    const sun: LightSky = { ...SKY, target: 0.0001, sun: { dir: [0, 0.6, -0.8], irradiance: [3.4, 3, 2.4] } };
    const noSun: LightSky = { ...SKY, target: 0.0001 };
    // Exposure aside (the target makes both gains equal), sunlight on the floor lights the ceiling.
    const lit = solveLightGrid([room()], sun, spec);
    const dim = solveLightGrid([room()], noSun, spec);
    expect(irradiance(lit, [2, 2.8, 2], [0, -1, 0])).toBeGreaterThan(irradiance(dim, [2, 2.8, 2], [0, -1, 0]));
  });

  it("lights a windowless room by its lamp, brightest near the lamp", () => {
    const lamp = room({ openings: [], lamps: [{ position: [2, 2.8, 2.5], color: [1, 0.8, 0.6], intensity: 1 }] });
    const dark: LightSky = { sky: [0, 0, 0], ground: [0, 0, 0], sun: null, target: 1.5 };
    const night = solveLightGrid([lamp], dark, spec);
    expect(irradiance(night, [2, 0.2, 2.5], [0, 1, 0])).toBeGreaterThan(irradiance(night, [0.3, 0.2, 0.3], [0, 1, 0]));
    expect(irradiance(night, [2, 0.2, 2.5], [0, 1, 0])).toBeGreaterThan(0.2);
  });

  it("exposes rooms towards the target, within limits", () => {
    const small = room({ openings: [{ p: [1.8, 1.6, 0], u: [0.4, 0, 0], v: [0, 0.5, 0], inward: [0, 0, 1], kind: "window" }] });
    const dim = solveLightGrid([small], SKY, spec);
    expect(dim.gains.a).toBeGreaterThan(g.gains.a);
    expect(dim.gains.a).toBeLessThanOrEqual(4.2);
  });

  it("marks the first ring round a room as inside, and beyond that outside", () => {
    const [i, j, k] = cellAt(g, 2, 1.5, 2.5);
    expect(g.signed[(i + g.nx * (j + g.ny * k)) * 4 + 3]).toBe(1);
    expect(g.signed[(0 + g.nx * (j + g.ny * 0)) * 4 + 3]).toBe(0);
  });
});

describe("a real home's light", () => {
  it("works out every starter home's floors quickly and sensibly", () => {
    for (const preset of ["compact", "family"] as const) {
      const project = createPreset(preset);
      for (const floor of project.floors) {
        const { rooms, spec } = lightRooms(project, floor.id, false);
        expect(rooms.length).toBe(floor.rooms.length);
        for (const r of rooms) {
          expect(r.max[0]).toBeGreaterThan(r.min[0]);
          expect(r.max[1]).toBeGreaterThan(r.min[1] + 2);
          expect(r.max[2]).toBeGreaterThan(r.min[2]);
        }
        const started = performance.now();
        const grid = solveLightGrid(rooms, lightSky(lighting(11, project.plot.north)), spec);
        // Generous for a loaded test machine; the bench reports the real figure.
        expect(performance.now() - started).toBeLessThan(600);
        for (const v of grid.total) expect(Number.isFinite(v)).toBe(true);
      }
      const windows = lightRooms(project, project.floors[0].id, false).rooms.flatMap((r) => r.openings).filter((o) => o.kind === "window");
      expect(windows.length).toBeGreaterThan(0);
    }
  });

  it("turns on a lamp in every room after dark", () => {
    const project = createPreset("family");
    const { rooms } = lightRooms(project, project.floors[0].id, true);
    for (const r of rooms) expect(r.lamps.length).toBeGreaterThan(0);
  });
});
