import { describe, expect, it } from "vitest";
import { homeChecks } from "../domain/advice";
import { validateProject } from "../domain/model";
import { ensuiteHost } from "../domain/walls";
import type { HomeBrief } from "./brief";
import { applyRoomPlan, buildHome, roomZone } from "./buildHome";
import { plannerHomePlan, plannerRoomPlan } from "./planner";
import { sanitizeHomePlan } from "./schema";

const brief = (over: Partial<HomeBrief> = {}): HomeBrief => ({
  plot: { w: 30, d: 50 },
  facing: "east",
  family: "young-family",
  bedrooms: 3,
  floors: "auto",
  musts: ["ensuite", "pooja", "parking", "vastu", "garden"],
  vibe: "indian-modern",
  ...over,
});
const rooms = (p: { floors: { rooms: { name: string; kind: string }[] }[] }) => p.floors.flatMap((f) => f.rooms);

describe("AI home engine", () => {
  const cases: [string, Partial<HomeBrief>][] = [
    ["typical 30×50, east facing", {}],
    ["small 20×40 couple", { plot: { w: 20, d: 40 }, family: "couple", bedrooms: 2, musts: ["pooja"] }],
    ["joint family, 2 floors, balcony", { plot: { w: 40, d: 60 }, family: "joint-family", bedrooms: 4, musts: ["balcony", "pooja", "office", "ensuite", "parking", "vastu", "guest"] }],
    ["big plot, minimal", { plot: { w: 60, d: 90 }, vibe: "minimal", musts: [] }],
    ["single person, colourful, north facing", { family: "single", bedrooms: 1, facing: "north", vibe: "colourful", musts: ["office"] }],
    ["six bedrooms on a narrow plot", { plot: { w: 25, d: 60 }, bedrooms: 6, family: "big-family", floors: 3, vibe: "indian-classic" }],
  ];
  for (const [label, over] of cases)
    for (const variant of [0, 1])
      it(`builds a valid, furnished home: ${label} (look ${variant + 1})`, () => {
        const b = brief(over);
        const built = buildHome(b, plannerHomePlan(b, variant));
        expect(built).not.toBeNull();
        const p = built!.project;
        expect(validateProject(p)).toEqual([]);
        expect(homeChecks(p).essentials.filter((c) => !c.done).map((c) => c.id)).toEqual([]);
        expect(rooms(p).filter((r) => r.kind === "bedroom").length).toBeGreaterThanOrEqual(1);
        // An Indian look outside, and rooms styled inside.
        expect(p.style?.preset).toBe(b.vibe === "indian-classic" ? "indian-classic" : "indian-modern");
        expect(p.site?.fence).toBe("compound-wall");
        // Rooms are styled, not left on defaults.
        expect(p.floors.flatMap((f) => f.rooms).some((r) => r.wallColor && r.floorMaterial && r.furniture?.length)).toBe(true);
      });

  it("gives the main bedroom its attached bathroom and adds a pooja room", () => {
    const b = brief();
    const p = buildHome(b, plannerHomePlan(b))!.project;
    const all = p.floors.flatMap((f) => f.rooms);
    expect(all.some((r) => r.name === "Pooja room")).toBe(true);
    const host = p.floors.flatMap((f) => f.rooms.map((r) => ensuiteHost(f.rooms, r))).find(Boolean);
    expect(host?.name).toBe("Main bedroom");
  });

  it("faces the plot the way the brief says", () => {
    for (const [facing, north] of [["south", 0], ["east", 90], ["north", 180], ["west", 270]] as const) {
      const b = brief({ facing });
      expect(buildHome(b, plannerHomePlan(b))!.project.plot.north).toBe(north);
    }
  });

  it("moves rooms toward their Vastu zones when it can", () => {
    const b = brief({ plot: { w: 40, d: 60 } });
    const plan = plannerHomePlan(b);
    const withVastu = buildHome(b, plan)!.project;
    const kitchen = withVastu.floors.flatMap((f) => f.rooms.map((room) => ({ f, room }))).find((r) => r.room.kind === "kitchen")!;
    // Not a guarantee on every plot, but a kitchen should never land in the north-east.
    expect(roomZone(withVastu, kitchen.f.id, kitchen.room)).not.toBe("northeast");
  });

  it("survives a nonsense plan from the model", () => {
    const b = brief();
    const plan = sanitizeHomePlan({
      name: "x".repeat(500),
      floors: 9,
      layout: "spaceship",
      rooms: [
        { use: "kitchen", name: "Kitchen", zone: "up", paint: "neon", floor: "lava", fabric: 1, wood: null, accent: "sage", extras: ["bed-double", "nope"] },
        ...Array.from({ length: 30 }, () => ({ use: "master-bedroom", name: "Main" })),
      ],
      exterior: { finish: "gold" },
      garden: ["pool", "pool", "dragon"],
      notes: ["  Nice  ", 5, "y".repeat(400)],
    });
    expect(plan.name.length).toBeLessThanOrEqual(40);
    expect(plan.rooms.filter((r) => r.use === "master-bedroom")).toHaveLength(1);
    expect(plan.rooms[0].extras).toEqual(["bed-double"]);
    const built = buildHome(b, plan)!;
    expect(validateProject(built.project)).toEqual([]);
    // A bed never lands in the kitchen.
    const kitchen = built.project.floors.flatMap((f) => f.rooms).find((r) => r.kind === "kitchen")!;
    expect(kitchen.furniture?.some((i) => i.catalogId === "bed-double")).toBeFalsy();
  });

  it("restyles one room", () => {
    const b = brief();
    const p = buildHome(b, plannerHomePlan(b))!.project;
    const floor = p.floors[0];
    const living = floor.rooms.find((r) => r.kind === "living")!;
    const plan = plannerRoomPlan({ kind: "living", name: living.name, w: living.bounds.w, d: living.bounds.d, items: [], vibe: "colourful" }, 1);
    const next = applyRoomPlan(p, floor.id, living.id, plan);
    const after = next.floors[0].rooms.find((r) => r.id === living.id)!;
    expect(validateProject(next)).toEqual([]);
    expect(after.wallColor).toBe(plan.paint);
    expect(after.floorMaterial).toBe(plan.floor);
    expect(after.furniture?.length).toBeGreaterThan(2);
  });
});
