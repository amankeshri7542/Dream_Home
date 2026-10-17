import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createPreset } from "../domain/model";
import { DEFAULT_VIEW } from "../editor/state";
import { boxCorners } from "../scene/camera/fit";
import { HERO_POLAR, heroPose, plotBox, roomBox } from "../scene/camera/poses";
import { aerialPose, orbitPoint, photoShot } from "./framing";
import { halton } from "./render";
import { SHAPES, SHAPE_ORDER, photoQuality, photoSize, type Framing } from "./settings";

describe("halton", () => {
  it("is the classic low-discrepancy sequence, the same every time", () => {
    expect([1, 2, 3, 4].map((i) => halton(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
    expect([1, 2, 3].map((i) => halton(i, 3))).toEqual([1 / 3, 2 / 3, 1 / 9]);
    const a = Array.from({ length: 40 }, (_, i) => halton(i + 1, 3));
    const b = Array.from({ length: 40 }, (_, i) => halton(i + 1, 3));
    expect(a).toEqual(b);
    for (const v of a) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("photoSize", () => {
  it("keeps the long edge and the shape, in even pixels", () => {
    expect(photoSize(1, 2560)).toEqual({ width: 2560, height: 2560 });
    expect(photoSize(9 / 16, 1600)).toEqual({ width: 900, height: 1600 });
    expect(photoSize(4 / 5, 320)).toEqual({ width: 256, height: 320 });
    expect(photoSize(16 / 9, 320)).toEqual({ width: 320, height: 180 });
    for (const shape of SHAPE_ORDER) {
      const { width, height } = photoSize(SHAPES[shape].aspect, 1001);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      expect(width / height).toBeCloseTo(SHAPES[shape].aspect, 1);
    }
  });

  it("phones get smaller, quicker photos, never past the GPU's limit", () => {
    expect(photoQuality({ phone: true, maxTexture: 8192 })).toEqual({ longEdge: 1600, samples: 16, shadowSize: 2048 });
    expect(photoQuality({ phone: false, maxTexture: 8192 })).toEqual({ longEdge: 2560, samples: 40, shadowSize: 4096 });
    expect(photoQuality({ phone: false, maxTexture: 2048 }).longEdge).toBe(2048);
  });
});

describe("aerialPose", () => {
  it("is the usual hero view for wide shapes and steeper for tall ones", () => {
    expect(aerialPose("south", 16 / 9)).toEqual(heroPose("south"));
    expect(aerialPose("south", 1)).toEqual(heroPose("south"));
    const story = aerialPose("south", 9 / 16);
    expect(story.polar).toBeLessThan(HERO_POLAR);
    expect(Math.abs(story.azimuth)).toBeLessThan(Math.abs(heroPose("south").azimuth));
  });
});

describe("photoShot", () => {
  const project = createPreset("compact");
  const view = { ...DEFAULT_VIEW, labels: false };
  const floor = project.floors[0];
  const room = floor.rooms[0];
  const live = { target: [0, 1, 0] as [number, number, number], azimuth: 0.6, polar: 1.0, distance: 22 };

  /** Every corner of the subject inside the photo (NDC −1…1). */
  function framed(framing: Framing, aspect: number) {
    const { width, height } = photoSize(aspect, 1000);
    const v = framing === "room" ? { ...view, focus: { floorId: floor.id, roomId: room.id } } : view;
    const shot = photoShot(framing, { project, view: v, live, fov: 32, width, height });
    const camera = new PerspectiveCamera(32, width / height, 0.1, 1000);
    camera.position.set(...shot.position);
    camera.lookAt(...shot.target);
    camera.updateMatrixWorld();
    const box = framing === "room" ? roomBox(project, v, floor.id, room.id)! : plotBox(project, v);
    return boxCorners(box.min, box.max).map((c) => new Vector3(...c).project(camera));
  }

  for (const framing of ["aerial", "front", "room"] as Framing[])
    for (const shape of SHAPE_ORDER)
      it(`${framing} keeps the whole subject in a ${shape} photo`, () => {
        const corners = framed(framing, SHAPES[shape].aspect);
        for (const p of corners) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
          expect(p.z).toBeLessThan(1);
        }
        // Centred, and filling the frame in the limiting direction.
        const lo = (k: "x" | "y") => Math.min(...corners.map((p) => p[k])),
          hi = (k: "x" | "y") => Math.max(...corners.map((p) => p[k]));
        expect(Math.abs(lo("x") + hi("x"))).toBeLessThan(0.02);
        expect(Math.abs(lo("y") + hi("y"))).toBeLessThan(0.02);
        expect(Math.max(hi("x") - lo("x"), hi("y") - lo("y"))).toBeGreaterThan(1.75);
      });

  it("This view keeps the live camera exactly", () => {
    const shot = photoShot("view", { project, view, live, fov: 32, width: 800, height: 1000 });
    expect(shot.target).toEqual(live.target);
    expect(shot.position).toEqual(orbitPoint(live.target, live.azimuth, live.polar, live.distance));
  });
});
