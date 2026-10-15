import { describe, expect, it } from "vitest";
import { Vector3, type Matrix4 } from "three";
import { createPreset } from "../../domain/model";
import type { Project } from "../../domain/types";
import { streetLightPlacements } from "./SiteExtras";

const at = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);

describe("street lights", () => {
  const base = createPreset("compact");
  it("line the kerb outside the plot, about every 9 m", () => {
    const p: Project = { ...base, plot: { ...base.plot, road: "south", width: 1800 } };
    const lights = streetLightPlacements(p);
    expect(lights.length).toBeGreaterThanOrEqual(2);
    for (const l of lights) {
      const v = at(l.matrix);
      expect(v.z).toBeGreaterThan(p.plot.depth / 100);
      expect(v.z).toBeLessThan(p.plot.depth / 100 + 2.5);
    }
  });
  it("keep clear of the gates", () => {
    const p: Project = { ...base, plot: { ...base.plot, road: "south", width: 1000 } };
    const gate = { x: 1.2, z: p.plot.depth / 100, width: 3, alongX: true, kind: "drive" as const };
    for (const l of streetLightPlacements(p, [gate])) expect(Math.abs(at(l.matrix).x - 1.2)).toBeGreaterThanOrEqual(2.4);
  });
  it("follow the road to any side", () => {
    for (const road of ["north", "east", "west"] as const) {
      const p: Project = { ...base, plot: { ...base.plot, road } };
      const v = at(streetLightPlacements(p)[0].matrix);
      if (road === "north") expect(v.z).toBeLessThan(0);
      if (road === "east") expect(v.x).toBeGreaterThan(p.plot.width / 100);
      if (road === "west") expect(v.x).toBeLessThan(0);
    }
  });
});
