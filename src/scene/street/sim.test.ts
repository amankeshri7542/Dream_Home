import { describe, expect, it } from "vitest";
import { createPreset } from "../../domain/model";
import { BIRDS, STREET_CAST, actorPose, birdPose, cowTravel, greenery, streetFrame } from "./sim";

const p = createPreset("family");

describe("street life choreography", () => {
  it("keeps every actor on the road band and wraps around", () => {
    const frame = streetFrame(p);
    for (const a of STREET_CAST)
      for (let t = 0; t < 120; t += 0.7) {
        const pose = actorPose(p, a, t, frame);
        // road = south: z beyond the plot edge by `out`, x inside the band.
        expect(pose.z).toBeCloseTo(p.plot.depth / 100 + a.out, 5);
        expect(pose.x).toBeGreaterThanOrEqual(frame.lo - 1e-6);
        expect(pose.x).toBeLessThanOrEqual(frame.hi + 1e-6);
        expect(pose.scale).toBeGreaterThanOrEqual(0);
        expect(pose.scale).toBeLessThanOrEqual(1);
      }
  });
  it("vehicles keep to lanes that never overlap the cow", () => {
    const cow = STREET_CAST.find((a) => a.kind === "cow")!;
    for (const v of STREET_CAST.filter((a) => a.kind === "vehicle"))
      expect(Math.abs(v.out - cow.out) - (v.shadow[0] + cow.shadow[0]) / 2).toBeGreaterThan(0);
  });
  it("the cow mostly stands and ambles slowly", () => {
    expect(cowTravel(0)).toBe(0);
    expect(cowTravel(8.9)).toBe(0);
    expect(cowTravel(14)).toBeCloseTo(5, 5);
    expect(cowTravel(140)).toBeCloseTo(50, 5);
  });
  it("swings limbs and spins wheels", () => {
    const walker = STREET_CAST.find((a) => a.kind === "walker")!;
    const a = actorPose(p, walker, 0.2).parts["leg-l"][0];
    const b = actorPose(p, walker, 0.6).parts["leg-l"][0];
    expect(a).not.toBeCloseTo(b, 3);
    const auto = STREET_CAST.find((x) => x.model === "auto")!;
    expect(actorPose(p, auto, 1).parts["wheel-f"][0]).not.toBe(0);
  });
  it("birds circle high above", () => {
    for (let i = 0; i < BIRDS; i++) expect(birdPose(p, i, 3).y).toBeGreaterThan(7);
  });
  it("plants tufts along the verge and lawn edges", () => {
    const g = greenery(p, []);
    expect(g.tufts.length).toBeGreaterThan(30);
  });
});
