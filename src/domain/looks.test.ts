// M3 regional looks: every look names real ids, gives every room use a
// palette, plants a garden the kit has, and survives a save and a share.
import { describe, expect, it } from "vitest";
import landscapeJson from "./catalog/landscape.json" with { type: "json" };
import { isFence } from "./landscape";
import { LOOK_BUNDLES, LOOK_GARDENS, LOOK_ORDER, LOOK_PALETTES, STYLE_PRESET_INFO, lookGarden } from "./looks";
import {
  EXTERIOR_FINISHES,
  ROOF_STYLES,
  applyStylePreset,
  effectiveRoof,
  isDoorColor,
  isExterior,
  isRoofMaterial,
  isTrim,
  roomFloorMaterial,
  setStyleDetails,
  styleDetails,
  withStylePreset,
} from "./materials";
import { createPreset, parseProject, validateProject } from "./model";
import { STYLE_PRESETS } from "./persist";
import type { EditResult, Project, StylePreset } from "./types";

const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
const REGIONAL: StylePreset[] = ["kerala", "chettinad", "rajasthani", "goan", "mumbai-modern", "bengaluru-contemporary"];
const KINDS = ["living", "bedroom", "kitchen", "dining", "bathroom", "prayer", "study", "utility"] as const;

describe("regional looks", () => {
  it("are all listed once, in card order", () => {
    expect([...LOOK_ORDER].sort()).toEqual([...STYLE_PRESETS].sort());
    for (const look of REGIONAL) expect(STYLE_PRESET_INFO[look].region).toBeTruthy();
  });

  it("bundle only ids the app can draw", () => {
    for (const look of STYLE_PRESETS) {
      const b = LOOK_BUNDLES[look];
      expect(isExterior(b.exterior), look).toBe(true);
      expect(isTrim(b.trim), look).toBe(true);
      expect(isDoorColor(b.frontDoor), look).toBe(true);
      expect(isRoofMaterial(b.roof.material), look).toBe(true);
      expect(b.roof.style in ROOF_STYLES, look).toBe(true);
      if (b.fence) expect(isFence(b.fence), look).toBe(true);
      // The card's first colour is the look's own wall colour.
      expect(STYLE_PRESET_INFO[look].colors[0], look).toBe(EXTERIOR_FINISHES[b.exterior].color);
    }
  });

  it("give every room use at least one palette", () => {
    for (const look of STYLE_PRESETS) for (const kind of KINDS) expect(LOOK_PALETTES[look][kind].length, `${look} ${kind}`).toBeGreaterThan(0);
  });

  it("plant trees the garden kit has", () => {
    const kinds = new Set(landscapeJson.items.map((i) => i.id));
    for (const look of STYLE_PRESETS) {
      const tree = LOOK_GARDENS[look].tree;
      if (tree) expect(kinds.has(tree), look).toBe(true);
    }
    expect(lookGarden("kerala").tree).toBe("tree-palm");
    expect(lookGarden(null)).toEqual({ tree: null, tulsi: false, lush: false });
  });

  for (const look of REGIONAL)
    it(`${look} applies in one edit, validates and round-trips`, () => {
      const p = ok(applyStylePreset(createPreset("family"), look));
      expect(validateProject(p)).toEqual([]);
      expect(p.style?.preset).toBe(look);
      expect(parseProject(JSON.stringify(p))).toStrictEqual(p);
    });

  it("carry their region's materials", () => {
    const home = (look: StylePreset) => withStylePreset(createPreset("family"), look);
    const living = (p: Project) => p.floors[0].rooms.find((r) => r.kind === "living")!;
    expect(roomFloorMaterial(living(home("kerala")), "kerala")).toBe("red-oxide");
    expect(roomFloorMaterial(living(home("rajasthani")), "rajasthani")).toBe("kota");
    expect(roomFloorMaterial(living(home("mumbai-modern")), "mumbai-modern")).toBe("vitrified");
    expect(["athangudi", "athangudi-green"]).toContain(roomFloorMaterial(living(home("chettinad")), "chettinad"));
    expect(effectiveRoof(home("kerala"))).toEqual({ style: "hip", material: "mangalore", pitch: 30 });
    expect(effectiveRoof(home("goan")).material).toBe("mangalore");
    expect(styleDetails(home("rajasthani"))).toMatchObject({ arches: true, railing: "jaali" });
  });

  it("never take an object's built-in names for ids", () => {
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isExterior(id)).toBe(false);
      expect(isRoofMaterial(id)).toBe(false);
      expect(isTrim(id)).toBe(false);
      expect(isDoorColor(id)).toBe(false);
    }
    const p = createPreset("compact");
    expect(() => parseProject(JSON.stringify({ ...p, style: { exterior: "constructor" } }))).toThrow();
  });

  it("arched windows are a regional detail that saves and switches off", () => {
    let p = withStylePreset(createPreset("compact"), "indian-modern");
    expect(styleDetails(p).arches).toBe(false);
    p = ok(setStyleDetails(p, { arches: true }));
    expect(styleDetails(parseProject(JSON.stringify(p))).arches).toBe(true);
    p = ok(setStyleDetails(p, { arches: false }));
    expect(styleDetails(p).arches).toBe(false);
    expect(() => parseProject(JSON.stringify({ ...p, style: { ...p.style, details: { arches: "yes" } } }))).toThrow();
  });
});
