import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { applyFocal, boxCorners, cameraBasis, fitBox, nearestAngle, type FitInput } from "./fit";
import { heroPose, topPose } from "./poses";

/** Project the box corners through a real camera with camera-controls' focal offset. */
function project(input: FitInput) {
  const fit = fitBox(input);
  const cam = new PerspectiveCamera(input.fov, input.width / input.height, 0.1, 2000);
  const basis = cameraBasis(input.azimuth, input.polar);
  cam.position.set(...fit.position);
  cam.lookAt(new Vector3(...fit.target));
  cam.updateMatrixWorld();
  // camera-controls: position += right·fx + up·(−fy) after lookAt (orientation unchanged).
  cam.position.set(...applyFocal(fit.position, basis, fit.focal));
  cam.updateMatrixWorld();
  const px = boxCorners(input.min, input.max).map((c) => {
    const v = new Vector3(...c).project(cam);
    return { x: ((v.x + 1) / 2) * input.width, y: ((1 - v.y) / 2) * input.height };
  });
  const t = new Vector3(...fit.target).project(cam);
  return { fit, px, target: { x: ((t.x + 1) / 2) * input.width, y: ((1 - t.y) / 2) * input.height } };
}

const base: FitInput = {
  min: [-5, 0, -6],
  max: [5, 4, 6],
  azimuth: heroPose("south").azimuth,
  polar: heroPose("south").polar,
  fov: 32,
  width: 390,
  height: 844,
};

describe("fitBox", () => {
  it("fits all corners inside the viewport with margin", () => {
    const { px } = project(base);
    for (const p of px) {
      expect(p.x).toBeGreaterThanOrEqual(-0.5);
      expect(p.x).toBeLessThanOrEqual(390.5);
      expect(p.y).toBeGreaterThanOrEqual(-0.5);
      expect(p.y).toBeLessThanOrEqual(844.5);
    }
    // Tight: some corner touches the 8% margin on the limiting axis.
    const minX = Math.min(...px.map((p) => p.x)),
      maxX = Math.max(...px.map((p) => p.x));
    const minY = Math.min(...px.map((p) => p.y)),
      maxY = Math.max(...px.map((p) => p.y));
    const xSlack = Math.min(minX, 390 - maxX),
      ySlack = Math.min(minY, 844 - maxY);
    expect(Math.min(xSlack / 195, ySlack / 422)).toBeCloseTo(0.08, 1);
  });

  it("keeps a room above a phone sheet that covers 60% of the screen", () => {
    // A room seen from above the sheet: top bar 56 px, sheet + bars 506 px.
    const insets = { top: 56, right: 0, bottom: 506, left: 0 };
    const room = { ...base, min: [-2, 0, -2] as [number, number, number], max: [2, 1.4, 2] as [number, number, number], insets };
    const { px } = project(room);
    for (const p of px) {
      expect(p.y).toBeGreaterThanOrEqual(56 - 0.5);
      expect(p.y).toBeLessThanOrEqual(844 - 506 + 0.5);
    }
  });

  it("keeps corners inside the safe rect and centres the target in it", () => {
    const insets = { top: 60, right: 0, bottom: 300, left: 0 };
    const { px, target } = project({ ...base, insets, width: 390, height: 844 });
    for (const p of px) {
      expect(p.y).toBeGreaterThanOrEqual(60 - 0.5);
      expect(p.y).toBeLessThanOrEqual(844 - 300 + 0.5);
      expect(p.x).toBeGreaterThanOrEqual(-0.5);
      expect(p.x).toBeLessThanOrEqual(390.5);
    }
    // Target lands at the clear-area centre.
    expect(target.y).toBeCloseTo(60 + (844 - 60 - 300) / 2, 0);
    expect(target.x).toBeCloseTo(195, 0);
  });

  it("handles side insets on desktop", () => {
    const insets = { top: 0, right: 380, bottom: 0, left: 80 };
    const { px, target } = project({ ...base, width: 1440, height: 1000, insets });
    for (const p of px) {
      expect(p.x).toBeGreaterThanOrEqual(80 - 0.5);
      expect(p.x).toBeLessThanOrEqual(1440 - 380 + 0.5);
    }
    expect(target.x).toBeCloseTo(80 + (1440 - 80 - 380) / 2, 0);
  });

  it("top view puts plan north (−z) at the top of the screen", () => {
    const pose = topPose();
    const { px } = project({ ...base, azimuth: pose.azimuth, polar: pose.polar, width: 800, height: 800 });
    // Corners with z = −6 (north) project above corners with z = +6.
    const north = boxCorners(base.min, base.max).map((c, i) => ({ c, p: px[i] }));
    const nY = north.filter((n) => n.c[2] < 0).map((n) => n.p.y);
    const sY = north.filter((n) => n.c[2] > 0).map((n) => n.p.y);
    expect(Math.max(...nY)).toBeLessThan(Math.min(...sY));
    // East (+x) is to the right.
    const eX = north.filter((n) => n.c[0] > 0).map((n) => n.p.x);
    const wX = north.filter((n) => n.c[0] < 0).map((n) => n.p.x);
    expect(Math.min(...eX)).toBeGreaterThan(Math.max(...wX));
  });

  it("distance grows with a narrower viewport", () => {
    const wide = fitBox({ ...base, width: 1440, height: 1000 }).distance;
    const narrow = fitBox(base).distance;
    expect(narrow).toBeGreaterThan(wide);
  });

  it("nearestAngle avoids spinning", () => {
    expect(nearestAngle(Math.PI * 4 + 0.1, 0)).toBeCloseTo(Math.PI * 4, 6);
    expect(nearestAngle(-0.2, Math.PI * 2)).toBeCloseTo(0, 6);
  });
});
