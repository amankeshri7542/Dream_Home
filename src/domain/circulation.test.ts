import { describe, expect, it } from "vitest";
import { buildHome } from "../ai/buildHome";
import type { HomeBrief } from "../ai/brief";
import { plannerHomePlan } from "../ai/planner";
import { PLOT_SIZES, TEMPLATES, buildTemplate } from "../onboarding/templates";
import { homeChecks, projectAdvisories } from "./advice";
import { floorCirculation, projectCirculation } from "./circulation";
import { floorForGeometry } from "./core";
import { addAttachedBathroom } from "./ensuite";
import { ensureRoomDoor } from "./openingCommands";
import type { EditResult, Project, Rect, Room, RoomKind } from "./types";
import { autoOpenings } from "./walls";

const room = (id: string, bounds: Rect, kind: RoomKind = "bedroom"): Room => ({ id, name: id, kind, bounds, unitId: null });
function sketch(rooms: Room[], footprint: Rect = { x: 500, z: 500, w: 1000, d: 1000 }): Project {
  return {
    schemaVersion: 2,
    name: "Sketch",
    plot: { width: 2000, depth: 2200, north: 0, road: "south", setback: 100 },
    floors: [{ id: "f0", name: "Ground floor", elevation: 0, height: 300, footprint, rooms, balconies: [], unitAreas: [] }],
    units: [],
    verticalSpaces: [],
    garden: false,
    parking: false,
  };
}
const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
const sound = (p: Project) => {
  const c = projectCirculation(p);
  return { unreachable: c.unreachable.length, blocked: c.blockedDoors.length };
};

describe("circulation", () => {
  it("never puts a door onto a gap too narrow to walk through", () => {
    // A bedroom 50 cm from the outside wall, with a living room beside it and a hall below.
    const p = sketch([
      room("bed", { x: 500, z: 500, w: 400, d: 450 }),
      room("living", { x: 900, z: 500, w: 600, d: 1000 }, "living"),
      room("store", { x: 500, z: 1050, w: 400, d: 450 }, "utility"),
    ]);
    // The 100 cm strip between bed and store is a hall; nothing faces a sliver.
    expect(sound(p)).toEqual({ unreachable: 0, blocked: 0 });
    const squeezed = sketch([
      room("bed", { x: 500, z: 500, w: 400, d: 450 }),
      room("living", { x: 900, z: 500, w: 600, d: 1000 }, "living"),
      room("store", { x: 500, z: 1000, w: 400, d: 500 }, "utility"),
    ]);
    // Now bed and store share a wall and the only open strip is gone; doors go through the living room.
    const doors = autoOpenings(floorForGeometry(squeezed, "f0"), "south").filter((o) => o.kind === "door");
    expect(doors.length).toBeGreaterThanOrEqual(3);
    expect(sound(squeezed)).toEqual({ unreachable: 0, blocked: 0 });
  });

  it("finds rooms nobody can reach, and the fix adds a way in", () => {
    // Explicit doors: the bedroom only opens into a pocket closed off from the house.
    const base = sketch([
      room("bed", { x: 500, z: 500, w: 400, d: 400 }),
      room("living", { x: 1000, z: 500, w: 500, d: 1000 }, "living"),
      room("kitchen", { x: 500, z: 1000, w: 500, d: 500 }, "kitchen"),
    ]);
    const p: Project = {
      ...base,
      floors: [
        {
          ...base.floors[0],
          openings: [
            { id: "front", kind: "door", axis: "x", line: 1500, center: 1250, width: 110, height: 230, sill: 0 },
            { id: "k", kind: "door", axis: "z", line: 1000, center: 1250, width: 90, height: 215, sill: 0 },
            // Bedroom door onto the 100 cm pocket at x 900–1000 between bed and living (closed at both ends).
            { id: "b", kind: "door", axis: "z", line: 900, center: 700, width: 90, height: 215, sill: 0 },
          ],
        },
      ],
    };
    const c = floorCirculation(p, "f0");
    expect(c.unreachable).toContain("bed");
    expect(projectAdvisories(p).some((i) => i.code === "room-unreachable" && i.source?.id === "bed")).toBe(true);
    expect(homeChecks(p).essentials.find((e) => e.id === "doors")?.done).toBe(false);
    const fixed = ok(ensureRoomDoor(p, "f0", "bed"));
    expect(floorCirculation(fixed, "f0").unreachable).toEqual([]);
  });

  it("flags a door that opens onto a wall and moves it", () => {
    const base = sketch([
      room("bed", { x: 500, z: 500, w: 400, d: 440 }),
      room("living", { x: 500, z: 1000, w: 1000, d: 500 }, "living"),
      room("study", { x: 900, z: 500, w: 600, d: 500 }, "utility"),
    ]);
    const p: Project = {
      ...base,
      floors: [
        {
          ...base.floors[0],
          openings: [
            { id: "front", kind: "door", axis: "x", line: 1500, center: 1000, width: 110, height: 230, sill: 0 },
            { id: "s", kind: "door", axis: "x", line: 1000, center: 1200, width: 90, height: 215, sill: 0 },
            // The bedroom's door faces the 60 cm gap above the living room.
            { id: "b", kind: "door", axis: "x", line: 940, center: 700, width: 90, height: 215, sill: 0 },
          ],
        },
      ],
    };
    const c = floorCirculation(p, "f0");
    expect(c.blockedDoors.map((d) => d.opening.id)).toEqual(["b"]);
    expect(projectAdvisories(p).some((i) => i.code === "door-blocked")).toBe(true);
    const fixed = ok(ensureRoomDoor(p, "f0", "bed"));
    expect(sound(fixed)).toEqual({ unreachable: 0, blocked: 0 });
  });

  it("reaches upper floors from the stairs", () => {
    const t = TEMPLATES.find((x) => x.id === "duplex")!;
    const p = ok(buildTemplate(t));
    expect(p.floors.length).toBeGreaterThan(1);
    for (const f of p.floors) expect(floorCirculation(p, f.id).unreachable).toEqual([]);
  });

  it("keeps the attached bathroom from cutting anyone off", () => {
    const t = TEMPLATES.find((x) => x.id === "duplex")!;
    const p = ok(buildTemplate({ ...t, ensuite: false }, { plot: { w: 20, d: 40 }, bedrooms: 2 }));
    const bed = p.floors[0].rooms.find((r) => r.kind === "bedroom")!;
    const result = addAttachedBathroom(p, p.floors[0].id, bed.id);
    if (result.ok) expect(sound(result.project)).toEqual(sound(p));
  });

  it("every starting home and every built-in design can be walked through", () => {
    const problems: string[] = [];
    const check = (label: string, p: Project) => {
      const s = sound(p);
      if (s.unreachable || s.blocked) problems.push(`${label}: ${JSON.stringify(s)}`);
    };
    for (const t of TEMPLATES)
      for (const plot of PLOT_SIZES)
        for (const bedrooms of t.tweak.bedrooms ? [t.tweak.bedrooms[0], t.request.bedrooms, t.tweak.bedrooms[1]] : [undefined]) {
          const r = buildTemplate(t, { plot, bedrooms });
          if (r.ok) check(`${t.id} ${plot.label} ${bedrooms ?? ""}`, r.project);
        }
    const families = ["single", "couple", "young-family", "big-family", "joint-family"] as const;
    const beds = { single: 1, couple: 2, "young-family": 3, "big-family": 4, "joint-family": 4 };
    for (const plot of PLOT_SIZES)
      for (const family of families)
        for (const musts of [
          ["ensuite", "pooja", "parking", "vastu"],
          ["balcony", "pooja", "office", "guest", "garden"],
        ] as const)
          for (const variant of [0, 1]) {
            const b: HomeBrief = {
              plot: { w: plot.w, d: plot.d },
              facing: "east",
              family,
              bedrooms: beds[family],
              floors: "auto",
              musts: [...musts],
              vibe: "indian-modern",
            };
            const built = buildHome(b, plannerHomePlan(b, variant));
            if (built) check(`AI ${plot.label} ${family} ${musts[0]} v${variant}`, built.project);
          }
    expect(problems).toEqual([]);
  }, 60000);
});
