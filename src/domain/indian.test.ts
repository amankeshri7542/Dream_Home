// M3 "Indian homes by default": style presets, regional details, schema.
import { describe, expect, it } from "vitest";
import baseline from "../../tests/fixtures/v2-baseline.json" with { type: "json" };
import { STYLE_PRESET_INFO } from "./looks";
import {
  EXTERIOR_FINISHES,
  applyStylePreset,
  effectiveRoof,
  exteriorFinish,
  setStyleDetails,
  styleDetails,
  withStylePreset,
} from "./materials";
import { createPreset, parseProject, validateProject } from "./model";
import { createStarter } from "./starters";
import type { EditResult, Project, StylePreset } from "./types";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const roundTrip = (p: Project) => parseProject(JSON.stringify(p));

describe("style presets", () => {
  for (const preset of Object.keys(STYLE_PRESET_INFO) as StylePreset[])
    it(`${preset} produces a valid project that round-trips`, () => {
      const p = ok(applyStylePreset(createPreset("family"), preset));
      expect(validateProject(p)).toEqual([]);
      expect(p.style?.preset).toBe(preset);
      expect(roundTrip(p)).toStrictEqual(p);
    });
  it("Indian looks are bright, flat-roofed and walled", () => {
    for (const preset of ["indian-modern", "indian-classic"] as const) {
      const p = ok(applyStylePreset(createPreset("compact"), preset));
      expect(effectiveRoof(p).style).toBe("flat");
      expect(p.site?.fence).toBe("compound-wall");
      expect(styleDetails(p)).toMatchObject({ chhajja: true, waterTank: true, carPorch: true });
      expect(["peach", "ochre"]).toContain(exteriorFinish(p));
    }
  });
  it("Diorama restores the original look and removes the wall", () => {
    let p = ok(applyStylePreset(createPreset("compact"), "indian-classic"));
    p = ok(applyStylePreset(p, "diorama"));
    expect(exteriorFinish(p)).toBe("ivory");
    expect(p.site?.fence).toBeUndefined();
    expect(p.style?.details).toBeUndefined();
    expect(styleDetails(p)).toEqual({ chhajja: false, waterTank: false, carPorch: false, railing: "glass", arches: false });
  });
  it("keeps the ground choice when applying a look", () => {
    const p0 = { ...createPreset("compact"), site: { ground: "gravel" } };
    expect(ok(applyStylePreset(p0, "indian-modern")).site).toEqual({ ground: "gravel", fence: "compound-wall" });
  });
  it("rejects unknown looks and railings", () => {
    expect(applyStylePreset(createPreset("compact"), "victorian").ok).toBe(false);
    expect(setStyleDetails(createPreset("compact"), { railing: "wire" as never }).ok).toBe(false);
  });
  it("toggles details individually", () => {
    let p = ok(setStyleDetails(createPreset("compact"), { chhajja: true }));
    expect(styleDetails(p).chhajja).toBe(true);
    p = ok(setStyleDetails(p, { railing: "jaali" }));
    expect(p.style?.details).toEqual({ chhajja: true, railing: "jaali" });
    expect(roundTrip(p)).toStrictEqual(p);
  });
});

describe("schema for style fields", () => {
  it("round-trips preset and details", () => {
    const p: Project = {
      ...createPreset("compact"),
      style: { preset: "indian-classic", details: { chhajja: true, waterTank: false, carPorch: true, railing: "grille" } },
      site: { fence: "compound-wall" },
    };
    expect(roundTrip(p)).toStrictEqual(p);
  });
  it("strips unknown keys inside details", () => {
    const p = { ...createPreset("compact"), style: { details: { chhajja: true, sparkle: 1 } } };
    expect(roundTrip(p as unknown as Project).style).toEqual({ details: { chhajja: true } });
  });
  it("refuses malformed style fields", () => {
    const bad = (style: unknown) => () => parseProject(JSON.stringify({ ...createPreset("compact"), style }));
    expect(bad({ preset: "gothic" })).toThrow();
    expect(bad({ details: { chhajja: "yes" } })).toThrow();
    expect(bad({ details: { railing: "rope" } })).toThrow();
    expect(bad({ details: [] })).toThrow();
  });
  it("old saves without a preset are untouched", () => {
    const parsed = parseProject(JSON.stringify(baseline));
    expect(parsed).toStrictEqual(baseline);
    expect(parsed.style?.preset).toBeUndefined();
    expect(styleDetails(parsed).chhajja).toBe(false);
  });
});

describe("new homes default to Indian modern", () => {
  it("createStarter applies the look", () => {
    const r = createStarter({ widthCm: 1219, depthCm: 1829, road: "south", marginCm: 60, bedrooms: 2, floors: 2 }, "family");
    const p = ok(r);
    expect(p.style?.preset).toBe("indian-modern");
    expect(effectiveRoof(p).style).toBe("flat");
    expect(p.site?.fence).toBe("compound-wall");
    expect(EXTERIOR_FINISHES[exteriorFinish(p)].legacy).toBe(p.finish);
  });
  it("withStylePreset is idempotent", () => {
    const p = withStylePreset(createPreset("compact"), "indian-modern");
    expect(withStylePreset(p, "indian-modern")).toStrictEqual(p);
  });
});
