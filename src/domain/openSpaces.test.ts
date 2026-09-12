import { describe, expect, it } from "vitest";
import { createPreset, setFloorCount, validateProject } from "./model";
import { suggestBalcony, suggestVerticalSpace } from "./openSpaces";
import { planItems, selectionFloor } from "./selection";

describe("open-space placement and selection", () => {
  it("finds a separate balcony position on every edge and exposes it as a selectable item", () => {
    let project = createPreset("courtyard");
    project.plot = { ...project.plot, width: 4000, depth: 4000 };
    project.floors.forEach((f) => {
      f.balconies = [];
    });
    for (const edge of ["north", "south", "east", "west"] as const) {
      const result = suggestBalcony(
        project,
        project.floors[1].id,
        edge,
        180,
        90,
      );
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
      if (!result.ok) continue;
      project = result.project;
      const item = planItems(project, project.floors[1]).at(
        project.floors[1].rooms.length + project.floors[1].balconies.length - 1,
      )!;
      expect(item.kind).toBe("balcony");
      expect(item.bounds.w).toBe(
        edge === "north" || edge === "south" ? 180 : 90,
      );
    }
    expect(validateProject(project)).toEqual([]);
  });

  it("keeps selection on the currently viewed floor for a shared courtyard", () => {
    const project = createPreset("courtyard");
    const courtyard = project.verticalSpaces.find(
      (space) => space.kind === "courtyard",
    )!;
    expect(selectionFloor(project, courtyard.id, project.floors[1])?.id).toBe(
      project.floors[1].id,
    );
    expect(
      planItems(project, project.floors[1]).find(
        (item) => item.id === courtyard.id,
      )?.name,
    ).toBe("Courtyard");
  });

  it("finds a courtyard clear on every floor without altering the supplied project", () => {
    const seed = createPreset("compact");
    seed.floors[0].rooms = [];
    seed.verticalSpaces = seed.verticalSpaces.filter(
      (space) => space.kind === "stairs",
    );
    const extended = setFloorCount(seed, 2);
    expect(extended.ok).toBe(true);
    if (!extended.ok) return;
    const before = structuredClone(extended.project);
    const result = suggestVerticalSpace(
      before,
      before.floors[0].id,
      "courtyard",
      180,
      180,
      before.units[0].id,
    );
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    expect(before).toEqual(extended.project);
    if (result.ok) {
      expect(result.project.verticalSpaces.at(-1)?.floorIds).toEqual(
        before.floors.map((f) => f.id),
      );
      expect(validateProject(result.project)).toEqual([]);
    }
  });
});
