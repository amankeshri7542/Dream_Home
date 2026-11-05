import { describe, expect, it } from "vitest";
import { kelvinRgb, lightTemperature, warmthOf } from "./warmth";

describe("the colour of light through the day", () => {
  it("is cool in the morning, neutral at midday and warm in the evening", () => {
    const morning = lightTemperature(7, 12, 0);
    const noon = lightTemperature(12.5, 70, 0);
    const evening = lightTemperature(18.5, 6, 0.4);
    expect(morning).toBeGreaterThan(6000);
    expect(noon).toBeGreaterThan(5500);
    expect(noon).toBeLessThan(6000);
    expect(evening).toBeLessThan(3600);
    expect(lightTemperature(21, -20, 1)).toBe(2700);
  });

  it("turns kelvin into a believable tint", () => {
    expect(warmthOf(kelvinRgb(2700))).toBeGreaterThan(2);
    expect(warmthOf(kelvinRgb(6500))).toBeCloseTo(1, 0);
    expect(warmthOf(kelvinRgb(9000))).toBeLessThan(1);
    // Warmer is redder, always.
    expect(warmthOf(kelvinRgb(3000))).toBeGreaterThan(warmthOf(kelvinRgb(4500)));
  });
});
