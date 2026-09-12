import { describe, expect, it } from "vitest";
import {
  addBalcony,
  balconyBounds,
  transformComponent,
  validateProject,
} from "./model";
import {
  RESIZE_HANDLES,
  resizeBounds,
  resizeHandlesForBalcony,
} from "./resize";
import type { EdgeSide, Project } from "./types";

const bounds = { x: 500, z: 600, w: 400, d: 500 };
describe("resize anchors", () => {
  it.each(RESIZE_HANDLES)(
    "keeps opposite edges fixed while resizing %s",
    (handle) => {
      const result = resizeBounds(bounds, handle, -83, 67);
      if (handle.includes("w")) {
        expect(result.x).toBe(420);
        expect(result.x + result.w).toBe(900);
      } else expect(result.x).toBe(500);
      if (handle.includes("e")) expect(result.w).toBe(320);
      if (handle.includes("n")) {
        expect(result.z).toBe(670);
        expect(result.z + result.d).toBe(1100);
      } else expect(result.z).toBe(600);
      if (handle.includes("s")) expect(result.d).toBe(570);
      if (!handle.includes("e") && !handle.includes("w"))
        expect(result.w).toBe(400);
      if (!handle.includes("n") && !handle.includes("s"))
        expect(result.d).toBe(500);
    },
  );

  it("never crosses an anchor even with an oversized drag", () => {
    expect(resizeBounds(bounds, "nw", 10000, 10000)).toEqual({
      x: 780,
      z: 980,
      w: 120,
      d: 120,
    });
    expect(resizeBounds(bounds, "se", -10000, -10000)).toEqual({
      x: 500,
      z: 600,
      w: 120,
      d: 120,
    });
  });
});

function plot(): Project {
  return {
    schemaVersion: 2,
    name: "Balcony test",
    plot: { width: 2400, depth: 2400, north: 0, road: "south", setback: 100 },
    floors: [
      {
        id: "ground",
        name: "Ground",
        elevation: 0,
        height: 300,
        footprint: { x: 600, z: 600, w: 1200, d: 1200 },
        rooms: [],
        balconies: [],
        unitAreas: [],
      },
    ],
    units: [],
    verticalSpaces: [],
    garden: false,
    parking: false,
  };
}

describe("attached balcony resizing", () => {
  it.each<EdgeSide>(["north", "south", "east", "west"])(
    "preserves the wall attachment on every free %s handle",
    (edge) => {
      const added = addBalcony(plot(), "ground", {
        edge,
        offset: 300,
        width: 400,
        depth: 180,
      });
      if (!added.ok) throw new Error(added.error);
      const project = added.project,
        floor = project.floors[0],
        balcony = floor.balconies[0],
        original = balconyBounds(floor, balcony);
      const horizontal = edge === "north" || edge === "south";
      for (const handle of resizeHandlesForBalcony(edge)) {
        const nextBounds = resizeBounds(
          original,
          handle,
          40,
          50,
          horizontal ? 150 : 90,
          horizontal ? 90 : 150,
        );
        const result = transformComponent(
          project,
          floor.id,
          balcony.id,
          nextBounds,
          "resize",
        );
        if (!result.ok) throw new Error(result.error);
        const nextFloor = result.project.floors[0],
          next = nextFloor.balconies[0];
        expect(next.edge).toBe(edge);
        expect(balconyBounds(nextFloor, next)).toEqual(nextBounds);
        expect(validateProject(result.project)).toEqual([]);
      }
    },
  );

  it("rejects an edge extension beyond the wall instead of silently sliding the other end", () => {
    const added = addBalcony(plot(), "ground", {
      edge: "south",
      offset: 0,
      width: 400,
      depth: 180,
    });
    if (!added.ok) throw new Error(added.error);
    const floor = added.project.floors[0],
      balcony = floor.balconies[0];
    const next = resizeBounds(
      balconyBounds(floor, balcony),
      "w",
      -100,
      0,
      150,
      90,
    );
    expect(
      transformComponent(added.project, floor.id, balcony.id, next, "resize")
        .ok,
    ).toBe(false);
    expect(floor.balconies[0].offset).toBe(0);
  });
});
