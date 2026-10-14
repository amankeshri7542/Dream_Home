import { describe, expect, it } from "vitest";
import { directionFrom, envBucket, lighting, nightFactor, sunPosition } from "./timeOfDay";
import { fitShadowCamera, lightBasis, type V3 } from "./shadowFit";

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("timeOfDay", () => {
  it("follows the sun path: east at sunrise, south at midday, west at sunset", () => {
    expect(sunPosition(6).elevation).toBeCloseTo(0, 6);
    expect(sunPosition(6).bearing).toBeCloseTo(90, 6);
    expect(sunPosition(12.5).elevation).toBeCloseTo(62, 6);
    expect(sunPosition(12.5).bearing).toBeCloseTo(180, 6);
    expect(sunPosition(19).bearing).toBeCloseTo(270, 6);
    expect(sunPosition(19).elevation).toBeCloseTo(0, 6);
  });

  it("maps bearings onto plan axes (x east, z south) and rotates by north", () => {
    const east = directionFrom(90, 0, 0);
    expect(east[0]).toBeCloseTo(1, 6);
    expect(east[2]).toBeCloseTo(0, 6);
    const south = directionFrom(180, 0, 0);
    expect(south[2]).toBeCloseTo(1, 6);
    // True north rotated 90° clockwise: true east now points to plan south.
    const rotated = directionFrom(90, 0, 90);
    expect(rotated[2]).toBeCloseTo(1, 6);
    const up = directionFrom(123, 90, 0);
    expect(up[1]).toBeCloseTo(1, 6);
  });

  it("gives a bright warm build view at 10:30 and a dim cool night", () => {
    const day = lighting(10.5);
    expect(day.night).toBe(0);
    expect(day.keyDir[1]).toBeGreaterThan(0.6);
    expect(day.palette.sunIntensity).toBeGreaterThan(2.5);
    expect(day.palette.windowGlow).toBe(0);
    const night = lighting(22);
    expect(night.night).toBe(1);
    expect(night.palette.windowGlow).toBe(1);
    expect(night.palette.sunIntensity).toBeLessThan(1);
    // Moon is cool (blue > red).
    expect(night.palette.sun.b).toBeGreaterThan(night.palette.sun.r);
    // Golden hour: warm sun.
    const golden = lighting(17);
    expect(golden.palette.sun.r).toBeGreaterThan(golden.palette.sun.b * 1.5);
  });

  it("keeps the key light above the horizon at dusk and blends to the moon", () => {
    for (const h of [5, 6, 18.9, 19.5, 20, 23, 0, 3]) {
      const l = lighting(h);
      expect(l.keyDir[1]).toBeGreaterThan(0.1);
      expect(Math.hypot(...l.keyDir)).toBeCloseTo(1, 6);
    }
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(21)).toBe(1);
    expect(nightFactor(2)).toBe(1);
    expect(nightFactor(19.4)).toBeGreaterThan(0);
    expect(nightFactor(19.4)).toBeLessThan(1);
  });

  it("buckets the environment rebuild per 15 minutes", () => {
    expect(envBucket(10.5)).toBe(envBucket(10.55));
    expect(envBucket(10.5)).not.toBe(envBucket(10.75));
    expect(envBucket(24)).toBe(envBucket(0));
  });
});

describe("shadowFit", () => {
  it("covers every box corner inside the ortho frustum", () => {
    const dir: V3 = [0.27, 0.82, 0.51];
    const min: V3 = [-9, -0.8, -12],
      max: V3 = [9, 7, 12];
    const fit = fitShadowCamera(dir, min, max, 0.5);
    const { x, y, z } = lightBasis(dir);
    for (const cx of [min[0], max[0]])
      for (const cy of [min[1], max[1]])
        for (const cz of [min[2], max[2]]) {
          const rel: V3 = [cx - fit.position[0], cy - fit.position[1], cz - fit.position[2]];
          const px = dot(rel, x),
            py = dot(rel, y),
            depth = -dot(rel, z);
          expect(px).toBeGreaterThanOrEqual(fit.left);
          expect(px).toBeLessThanOrEqual(fit.right);
          expect(py).toBeGreaterThanOrEqual(fit.bottom);
          expect(py).toBeLessThanOrEqual(fit.top);
          expect(depth).toBeGreaterThanOrEqual(fit.near);
          expect(depth).toBeLessThanOrEqual(fit.far);
        }
  });

  it("is tight (no more than the pad beyond the projected box)", () => {
    const fit = fitShadowCamera([0, 1, 0.0001], [-5, 0, -5], [5, 3, 5], 0.5);
    expect(fit.right - fit.left).toBeLessThanOrEqual(10 + 1.0001);
    expect(fit.top - fit.bottom).toBeLessThanOrEqual(10 + 1.01);
  });
});
