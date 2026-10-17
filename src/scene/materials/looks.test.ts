// M3 regional materials: every new texture generator gives sane samples, and
// a Look's roughness really sets the material's sheen.
import { describe, expect, it } from "vitest";
import { lookRoughness } from "./library";
import { FACADE_LOOKS, FLOOR_LOOKS, ROOF_LOOKS, type Look } from "./palette";
import { sampleTexture } from "./textures";

const REGIONAL: Look[] = [
  FLOOR_LOOKS["red-oxide"],
  FLOOR_LOOKS.athangudi,
  FLOOR_LOOKS["athangudi-indigo"],
  FLOOR_LOOKS["athangudi-green"],
  FLOOR_LOOKS.kota,
  FLOOR_LOOKS.vitrified,
  FLOOR_LOOKS.azulejo,
  FACADE_LOOKS.laterite,
  FACADE_LOOKS["fair-faced"],
  FACADE_LOOKS["wood-slat"],
  ROOF_LOOKS.mangalore,
];
/** Mean roughness of a texture over a coarse grid of samples. */
const meanR = (look: Look) => {
  let sum = 0,
    n = 0;
  for (let i = 0; i < 24; i++)
    for (let j = 0; j < 24; j++) {
      sum += sampleTexture(look.texture, look.color, look.tile, (i + 0.5) / 24, (j + 0.5) / 24).r;
      n++;
    }
  return sum / n;
};

describe("regional textures", () => {
  for (const look of REGIONAL)
    it(`${look.texture} (${look.color}) samples stay in range and vary`, () => {
      const seen = new Set<string>();
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++) {
          const s = sampleTexture(look.texture, look.color, look.tile, (i + 0.5) / 16, (j + 0.5) / 16);
          for (const c of s.c) {
            expect(Number.isFinite(c)).toBe(true);
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThan(1.4);
          }
          expect(s.h).toBeGreaterThanOrEqual(0);
          expect(s.h).toBeLessThanOrEqual(1);
          expect(s.r).toBeGreaterThan(0);
          expect(s.r).toBeLessThanOrEqual(1);
          seen.add(s.c.map((c) => c.toFixed(2)).join());
        }
      // A pattern, not a flat colour.
      expect(seen.size).toBeGreaterThan(8);
    });

  it("a Look's roughness sets the material's mean sheen", () => {
    for (const look of [...REGIONAL, FLOOR_LOOKS.marble, FACADE_LOOKS["egg-plaster"]]) {
      const mean = meanR(look);
      expect(lookRoughness(look, mean) * mean).toBeCloseTo(look.roughness, 6);
    }
    // Waxy red oxide and polished egg plaster shine; laterite stays matte.
    const sheen = (look: Look) => lookRoughness(look, meanR(look)) * meanR(look);
    expect(sheen(FLOOR_LOOKS["red-oxide"])).toBeLessThan(0.3);
    expect(sheen(FACADE_LOOKS["egg-plaster"])).toBeLessThan(sheen(FACADE_LOOKS["lime-plaster"]));
    expect(sheen(FACADE_LOOKS.laterite)).toBeGreaterThan(0.9);
  });
});
