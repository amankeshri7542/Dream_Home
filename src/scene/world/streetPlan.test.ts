import { describe, expect, it } from "vitest";
import { createPreset } from "../../domain/model";
import { plinthExtents, roadFrame } from "../props/site";
import { buildStreet, streetLots } from "./streetPlan";

const overlaps = (a: { a0: number; a1: number; o0: number; o1: number }, b: { a0: number; a1: number; o0: number; o1: number }) =>
  a.a0 < b.a1 && a.a1 > b.a0 && a.o0 < b.o1 && a.o1 > b.o0;

describe("the street round a home", () => {
  for (const road of ["south", "north", "east", "west"] as const) {
    it(`leaves the plot and road clear (road on the ${road})`, () => {
      const project = createPreset("compact");
      project.plot = { ...project.plot, road };
      const frame = roadFrame(project);
      const depth = frame.horizontal ? project.plot.depth / 100 : project.plot.width / 100;
      const plot = { a0: frame.alongMin, a1: frame.alongMax, o0: -depth, o1: 4.4 };
      for (const lot of streetLots(project)) expect(overlaps(lot, plot)).toBe(false);
    });
  }

  it("is the same every time for the same plot", () => {
    const project = createPreset("compact");
    const a = buildStreet(project).get("plaster").triangles;
    const b = buildStreet(project).get("plaster").triangles;
    expect(a).toBe(b);
    expect(streetLots(project).map((l) => l.a0)).toEqual(streetLots(project).map((l) => l.a0));
  });

  it("stays cheap: a few merged buckets and a modest triangle count", () => {
    const buckets = buildStreet(createPreset("family"));
    const entries = buckets.entries();
    expect(entries.length).toBeLessThanOrEqual(9);
    const triangles = entries.reduce((sum, [, b]) => sum + b.triangles, 0);
    expect(triangles).toBeLessThan(120_000);
  });

  it("gives the next-door homes a side yard the plot's windows can see across", () => {
    const project = createPreset("compact");
    const frame = roadFrame(project);
    const next = streetLots(project).filter((l) => (l.gap0 ?? 0) > 3 || (l.gap1 ?? 0) > 3);
    expect(next.length).toBe(2);
    expect(next.some((l) => l.a0 > frame.alongMax)).toBe(true);
    expect(next.some((l) => l.a1 < frame.alongMin)).toBe(true);
  });

  it("reaches past the plinth so the ground never ends in shot", () => {
    const project = createPreset("compact");
    const ext = plinthExtents(project);
    const box = buildStreet(project).get("ground").build();
    box.computeBoundingBox();
    expect(box.boundingBox!.min.x).toBeLessThan(ext.x0 - 100);
    expect(box.boundingBox!.max.z).toBeGreaterThan(ext.z1 + 100);
  });
});
