import { describe, expect, it } from "vitest";
import type { HomeBrief } from "../ai/brief";
import { buildHome } from "../ai/buildHome";
import { plannerHomePlan } from "../ai/planner";
import { PLOT_SIZES, TEMPLATES, buildTemplate } from "../onboarding/templates";
import { homeChecks, projectAdvisories } from "./advice";
import { createPreset, removeBalcony, setFloorCount, validateProject } from "./model";
import { suggestBalcony, suggestVerticalSpace } from "./openSpaces";
import { planItems, selectionFloor } from "./selection";
import type { EdgeSide, Project } from "./types";

const windowless = (p: Project) =>
  projectAdvisories(p)
    .filter((i) => i.code === "room-no-window")
    .map((i) => i.source?.id);
/** The catalog's balcony sizes: small, regular, large. */
const BALCONY_SIZES = [
  [180, 90],
  [300, 120],
  [420, 180],
] as const;

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

  it("adds a balcony without costing a bedroom its only window", () => {
    // A 30×50 duplex: the centred road-side balcony used to open from Kids'
    // room 2's only window-sized outside wall.
    const brief: HomeBrief = {
      plot: { w: 30, d: 50 },
      facing: "east",
      family: "young-family",
      bedrooms: 3,
      floors: "auto",
      musts: ["garden", "balcony"],
      vibe: "indian-modern",
    };
    let project = buildHome(brief, plannerHomePlan(brief, 0))!.project;
    const upper = project.floors[1];
    for (const b of upper.balconies) {
      const r = removeBalcony(project, upper.id, b.id);
      if (r.ok) project = r.project;
    }
    expect(windowless(project)).toEqual([]);
    const [width, depth] = BALCONY_SIZES[1];
    const result = suggestBalcony(project, upper.id, "south", width, depth);
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (!result.ok) return;
    expect(windowless(result.project)).toEqual([]);
    expect(homeChecks(result.project).essentials.find((c) => c.id === "windows")?.done).toBe(true);
    expect(validateProject(result.project)).toEqual([]);
  });

  it("never takes a room's only window on any template, side or size", () => {
    const lost: string[] = [];
    for (const t of TEMPLATES)
      for (const plot of PLOT_SIZES)
        for (const bedrooms of [undefined, 4]) {
          const built = buildTemplate(t, { plot, floors: 2, bedrooms });
          if (!built.ok) continue;
          const home = built.project;
          const before = new Set(windowless(home));
          for (const floor of home.floors)
            for (const edge of ["north", "east", "south", "west"] as EdgeSide[])
              for (const [width, depth] of BALCONY_SIZES) {
                const result = suggestBalcony(home, floor.id, edge, width, depth);
                if (!result.ok) continue;
                for (const id of windowless(result.project))
                  if (!before.has(id))
                    lost.push(`${t.id} ${plot.label} ${bedrooms ?? "-"} ${floor.id} ${edge} ${width}: ${id}`);
              }
        }
    expect(lost).toEqual([]);
  });

  it("explains when every clear spot on a side would take a window", () => {
    const home = buildTemplate(TEMPLATES.find((t) => t.id === "villa")!, {
      plot: { w: 30, d: 50 },
      floors: 2,
    });
    expect(home.ok).toBe(true);
    if (!home.ok) return;
    const result = suggestBalcony(home.project, home.project.floors[1].id, "south", 700, 90);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe(
        "A balcony here would cost Bedroom 3 its only window. Try another side or a smaller balcony.",
      );
  });
});
