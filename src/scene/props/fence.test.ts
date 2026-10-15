import { describe, expect, it } from "vitest";
import { createPreset } from "../../domain/model";
import { withStylePreset } from "../../domain/materials";
import type { Project } from "../../domain/types";
import { findEntrance } from "../building/geometry/porch";
import { FENCE_INSET, fencePlan, parkingSpots } from "./fence";
import { siteLayout } from "./site";

const plan = (p: Project) => fencePlan(p, siteLayout(p, findEntrance(p)));

describe("boundary fence plan", () => {
  it("is absent without a fence (old saves render exactly as before)", () => {
    expect(plan(createPreset("compact"))).toBeNull();
    expect(plan({ ...createPreset("compact"), site: { fence: "none" } })).toBeNull();
  });
  it("leaves a gate gap where the entrance path meets the road", () => {
    const p = withStylePreset(createPreset("family"), "indian-modern");
    const layout = siteLayout(p, findEntrance(p));
    const f = fencePlan(p, layout)!;
    expect(f.kind).toBe("compound-wall");
    const path = layout.path[0];
    expect(path).toBeDefined();
    const mid = (path.x0 + path.x1) / 2;
    const roadZ = p.plot.depth / 100 - FENCE_INSET;
    const gate = f.gates.find((g) => g.kind === "walk")!;
    expect(gate).toBeDefined();
    expect(gate.alongX).toBe(true);
    expect(gate.z).toBeCloseTo(roadZ, 5);
    expect(Math.abs(gate.x - mid)).toBeLessThan(0.05);
    expect(gate.width).toBeGreaterThanOrEqual(path.x1 - path.x0);
    // No wall run crosses the opening on the road side.
    const roadRuns = f.runs.filter((r) => Math.abs(r.z0 - roadZ) < 1e-6 && Math.abs(r.z1 - roadZ) < 1e-6);
    expect(roadRuns.length).toBeGreaterThanOrEqual(2);
    for (const r of roadRuns) {
      const [a, b] = [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1)];
      expect(b <= gate.x - gate.width / 2 + 1e-6 || a >= gate.x + gate.width / 2 - 1e-6).toBe(true);
    }
    // Pillars flank the gate and stand every ~2.5 m.
    expect(f.pillars.some(([x, z]) => Math.abs(z - roadZ) < 1e-6 && Math.abs(x - (gate.x - gate.width / 2)) < 0.01)).toBe(true);
    const longest = Math.max(...f.runs.map((r) => Math.hypot(r.x1 - r.x0, r.z1 - r.z0)));
    expect(f.pillars.length).toBeGreaterThanOrEqual(Math.floor(longest / 2.5));
  });
  it("opens a drive gate at the driveway when there is parking", () => {
    const p = withStylePreset({ ...createPreset("family"), parking: true }, "indian-modern");
    const layout = siteLayout(p, findEntrance(p));
    if (!layout.parking) return; // the preset has no room for a car
    const f = fencePlan(p, layout)!;
    const drive = f.gates.find((g) => g.kind === "drive");
    expect(drive).toBeDefined();
    expect(drive!.width).toBeGreaterThanOrEqual(2.6);
    expect(parkingSpots(p, layout)).toHaveLength(1);
  });
  it("encloses all four sides", () => {
    const p = { ...createPreset("compact"), site: { fence: "picket" } };
    const f = plan(p)!;
    const w = p.plot.width / 100,
      d = p.plot.depth / 100;
    const sideOf = (r: { x0: number; z0: number; x1: number; z1: number }) =>
      r.z0 === r.z1 ? (Math.abs(r.z0 - FENCE_INSET) < 1e-6 ? "north" : Math.abs(r.z0 - (d - FENCE_INSET)) < 1e-6 ? "south" : "?") : Math.abs(r.x0 - FENCE_INSET) < 1e-6 ? "west" : Math.abs(r.x0 - (w - FENCE_INSET)) < 1e-6 ? "east" : "?";
    expect(new Set(f.runs.map(sideOf))).toEqual(new Set(["north", "south", "east", "west"]));
    expect(f.pillars).toEqual([]);
  });
});
