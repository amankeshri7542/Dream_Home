// The bench's shots must stay fixed and sensible, or runs can't be compared.
import { describe, expect, it } from "vitest";
import { benchShots } from "./benchShots";
import { lookSample } from "./lookThumbs";

const home = () => lookSample("indian-modern");

describe("benchShots", () => {
  it("is the ten shots the plan asks for", () => {
    const shots = benchShots(home());
    expect(shots.map((s) => s.id)).toEqual([
      "01-eye-living",
      "02-eye-bedroom",
      "03-eye-kitchen",
      "04-eye-bathroom",
      "05-eye-window",
      "06-street-front",
      "07-street-gate",
      "08-aerial",
      "09-night-living",
      "10-reel-room",
    ]);
    const count = (group: string) => shots.filter((s) => s.group === group).length;
    expect([count("eye"), count("street"), count("aerial"), count("night"), count("reel")]).toEqual([5, 2, 1, 1, 1]);
  });

  it("gives the same shots every time", () => {
    expect(benchShots(home())).toEqual(benchShots(home()));
  });

  it("stands inside the room at eye level, facing into it", () => {
    const project = home();
    for (const shot of benchShots(project).filter((s) => s.walk)) {
      const { floorId, start, yaw } = shot.walk!;
      const floor = project.floors.find((f) => f.id === floorId)!;
      const room = floor.rooms.find((r) => start.x >= r.bounds.x && start.x <= r.bounds.x + r.bounds.w && start.z >= r.bounds.z && start.z <= r.bounds.z + r.bounds.d);
      expect(room, shot.id).toBeTruthy();
      expect(Number.isFinite(yaw)).toBe(true);
      expect(shot.view.walkFloorId).toBe(floorId);
    }
  });

  it("looks at the home from the street, at a person's height", () => {
    for (const shot of benchShots(home()).filter((s) => s.group === "street")) {
      expect(shot.camera!.position[1]).toBeGreaterThan(1.4);
      expect(shot.camera!.position[1]).toBeLessThan(2.2);
      expect(shot.view.roof).toBe(true);
    }
  });
});
