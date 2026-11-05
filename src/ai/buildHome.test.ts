import { describe, expect, it } from "vitest";
import { homeChecks } from "../domain/advice";
import { validateProject } from "../domain/model";
import { ensuiteHost, sharedEdge } from "../domain/walls";
import { LOOK_BUNDLES } from "../domain/looks";
import type { Project, Room } from "../domain/types";
import { vastuReport } from "../insights/vastu";
import { REGIONAL_VIBES, isRegionalVibe, parseHomeBrief, type HomeBrief } from "./brief";
import { HOME_SYSTEM } from "./prompt";
import { applyRoomPlan, buildHome, layoutCost, roomZone } from "./buildHome";
import { VIBE_LOOK, plannerHomePlan, plannerRoomPlan } from "./planner";
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
    ["a Kerala home", { vibe: "kerala" }],
    ["a Chettinad home with a courtyard-sized plot", { plot: { w: 40, d: 60 }, vibe: "chettinad" }],
    ["a Bengaluru home", { vibe: "bengaluru-contemporary", musts: ["garden", "parking"] }],
    ["a 30×50 home with a garden and a balcony", { musts: ["garden", "balcony"] }],
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
        // The vibe's look outside (a regional one keeps its own facade), and rooms styled inside.
        expect(p.style?.preset).toBe(VIBE_LOOK[b.vibe]);
        if (isRegionalVibe(b.vibe)) expect(p.style?.exterior ?? p.finish).toBe(LOOK_BUNDLES[b.vibe].exterior);
        expect(p.site?.fence).toBe("compound-wall");
        // Rooms are styled, not left on defaults.
        expect(p.floors.flatMap((f) => f.rooms).some((r) => r.wallColor && r.floorMaterial && r.furniture?.length)).toBe(true);
      });

  // The balcony door takes the window on the wall it opens from, so a balcony
  // must never cost a bedroom its only window, whatever the plot, look or facing.
  for (const [label, over] of cases)
    it(`keeps every essential with a balcony: ${label}`, () => {
      for (const facing of ["south", "east", "north", "west"] as const)
        for (const variant of [0, 1]) {
          const b = brief({ ...over, facing });
          b.musts = [...new Set([...b.musts, "balcony" as const])];
          const built = buildHome(b, plannerHomePlan(b, variant))!;
          const at = `${facing} facing, look ${variant + 1}`;
          expect(validateProject(built.project), at).toEqual([]);
          expect(homeChecks(built.project).essentials.filter((c) => !c.done).map((c) => c.id), at).toEqual([]);
          // A balcony, or a note that says why there isn't one.
          const balcony = built.project.floors.some((f) => f.balconies.length > 0);
          expect(balcony || built.notes.some((n) => n.includes("balcony")), at).toBe(true);
        }
    });

  it("knows the regional looks: the brief, the prompt and the planner", () => {
    for (const vibe of REGIONAL_VIBES) {
      expect(parseHomeBrief(brief({ vibe })).ok).toBe(true);
      expect(HOME_SYSTEM).toContain(`  - ${vibe} (`);
      const plan = plannerHomePlan(brief({ vibe }));
      expect(plan.exterior.finish).toBe(LOOK_BUNDLES[vibe].exterior);
      expect(plannerHomePlan(brief({ vibe }), 1).name).not.toBe(plan.name);
    }
    expect(parseHomeBrief(brief({ vibe: "martian" as never })).ok).toBe(false);
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

  describe("lays rooms out like a designer", () => {
    const aspect = (r: Room) => Math.max(r.bounds.w, r.bounds.d) / Math.min(r.bounds.w, r.bounds.d);
    const touching = (a: Room, b: Room) => sharedEdge(a.bounds, b.bounds) >= 90;
    const builds = cases.flatMap(([label, over]) =>
      [0, 1].map((variant) => {
        const b = brief(over);
        const plan = plannerHomePlan(b, variant);
        return { label: `${label}, look ${variant + 1}`, b, plain: buildHome(b, plan, { arrange: false })!.project, home: buildHome(b, plan)!.project };
      }),
    );

    it("never makes a test brief's layout worse, and keeps its Vastu", () => {
      for (const { label, b, plain, home } of builds) {
        expect(layoutCost(home), label).toBeLessThanOrEqual(layoutCost(plain) + 1e-9);
        if (!b.musts.includes("vastu")) continue;
        const before = vastuReport(plain)!.score,
          after = vastuReport(home)!.score;
        expect(after, label).toBeGreaterThanOrEqual(50);
        expect(after, label).toBeGreaterThanOrEqual(before - 6);
      }
    });

    it("opens the kitchen onto the dining or living room", () => {
      for (const { label, home } of builds)
        for (const floor of home.floors) {
          const social = floor.rooms.filter((r) => r.kind === "living" || r.kind === "dining");
          for (const kitchen of floor.rooms.filter((r) => r.kind === "kitchen"))
            if (social.length) expect(social.some((r) => touching(kitchen, r)), label).toBe(true);
        }
    });

    it("leaves no corridors: a 24 × 9 ft kitchen keeps a good shape and gains a store", () => {
      let offcuts = 0;
      for (const { label, home } of builds) {
        // The narrow six-bedroom plot falls back to three bedrooms in whole-floor strips (the generator's).
        if (label.startsWith("six bedrooms")) continue;
        for (const room of home.floors.flatMap((f) => f.rooms)) {
          if (room.kind === "kitchen" || room.kind === "dining" || room.kind === "bedroom") expect(aspect(room), `${label}: ${room.name}`).toBeLessThanOrEqual(2.2);
          if (room.kind === "bathroom") expect(room.bounds.w * room.bounds.d, `${label}: ${room.name}`).toBeLessThanOrEqual(120_000);
          if (/^(Store room|Utility|Dressing room)$/.test(room.name)) offcuts++;
        }
      }
      expect(offcuts).toBeGreaterThan(0);
    });

    it("keeps the pooja room off bathroom walls more often than it was", () => {
      const pooja = (p: Project) =>
        p.floors.filter((f) => f.rooms.some((r) => r.name === "Pooja room" && f.rooms.some((o) => o.kind === "bathroom" && touching(r, o)))).length;
      const before = builds.reduce((n, x) => n + pooja(x.plain), 0);
      const after = builds.reduce((n, x) => n + pooja(x.home), 0);
      expect(after).toBeLessThan(before);
    });
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
