// M6: a reading of a builder's plan becomes a valid home with working doors;
// the sanitiser clamps whatever the model sends and reads Hindi labels.
import { describe, expect, it } from "vitest";
import { projectAdvisories } from "../domain/advice";
import { validateProject } from "../domain/model";
import type { Project } from "../domain/types";
import { planFromReading, type PlotChoice } from "./fromReading";
import { kindFromLabel, sanitizeReading, type PlanReading, type ReadingRoom } from "./reading";

const FT = 30.48;
const plot30x40: PlotChoice = { widthCm: Math.round(30 * FT), depthCm: Math.round(40 * FT), road: "south" };
const room = (label: string, kind: ReadingRoom["kind"], x: number, y: number, w: number, h: number, confidence = 0.9): ReadingRoom => ({
  label,
  kind,
  x,
  y,
  w,
  h,
  confidence,
});
/** A two-bedroom home with a pooja room and a store, a hall strip down the right. */
const CLEAN: PlanReading = {
  units: "ft",
  outline: { w: 26, h: 34 },
  outlineBox: { x: 0.1, y: 0.08, w: 0.8, h: 0.84 },
  rooms: [
    room("Living", "living", 0, 0, 0.6, 0.35),
    room("Kitchen", "kitchen", 0.6, 0, 0.4, 0.3),
    room("Dining", "dining", 0.6, 0.3, 0.4, 0.2),
    room("M. Bed", "bedroom", 0, 0.35, 0.6, 0.35),
    room("Toilet", "bathroom", 0.6, 0.5, 0.4, 0.15),
    room("Bed 2", "bedroom", 0, 0.7, 0.6, 0.3),
    room("Pooja", "pooja", 0.6, 0.65, 0.2, 0.15, 0.4),
    room("Store", "utility", 0.8, 0.65, 0.2, 0.15),
    room("Car parking", "open", 0, 0.9, 0.5, 0.1),
  ],
  doors: [{ x: 0.3, y: 0, w: 0.1 }],
  stairs: [],
  notes: "",
};
/** The same plan read a little sloppily: neighbours overlap by a few per cent. */
const OVERLAPPING: PlanReading = {
  ...CLEAN,
  rooms: CLEAN.rooms.map((r, i) => ({ ...r, w: Math.min(1 - r.x, r.w + (i % 2 ? 0.06 : 0.03)), h: Math.min(1 - r.y, r.h + 0.04) })),
};
/** Photographed sideways: the road is on the drawing's right, so the plan is wide. */
const ROTATED: PlanReading = {
  ...CLEAN,
  outline: { w: 34, h: 26 },
  outlineBox: { x: 0.05, y: 0.1, w: 0.9, h: 0.8 },
  rooms: CLEAN.rooms.map((r) => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w })),
};
/** No dimensions on the drawing. */
const NO_UNITS: PlanReading = { ...CLEAN, units: "unknown", outline: { w: 0, h: 0 } };
/** Labels in Hindi, with the model's guessed types wrong. */
const HINDI: PlanReading = {
  ...CLEAN,
  rooms: [
    room("बैठक", "utility", 0, 0, 0.6, 0.35),
    room("रसोई", "utility", 0.6, 0, 0.4, 0.3),
    room("शयन कक्ष", "utility", 0, 0.35, 0.6, 0.35),
    room("शौचालय", "utility", 0.6, 0.5, 0.4, 0.15),
    room("पूजा", "utility", 0.6, 0.65, 0.2, 0.15),
    room("स्टोर", "kitchen", 0.8, 0.65, 0.2, 0.15),
  ],
};

const DOOR_PROBLEMS = new Set(["room-no-door", "door-blocked", "room-unreachable"]);
function check(project: Project) {
  expect(validateProject(project)).toEqual([]);
  const floor = project.floors[0];
  const env = project.plot.setback;
  expect(floor.footprint.x).toBeGreaterThanOrEqual(env);
  expect(floor.footprint.z).toBeGreaterThanOrEqual(env);
  expect(floor.footprint.x + floor.footprint.w).toBeLessThanOrEqual(project.plot.width - env);
  expect(floor.footprint.z + floor.footprint.d).toBeLessThanOrEqual(project.plot.depth - env);
  for (const r of floor.rooms) {
    expect(r.bounds.w).toBeGreaterThanOrEqual(120);
    expect(r.bounds.d).toBeGreaterThanOrEqual(120);
    for (const v of [r.bounds.x, r.bounds.z, r.bounds.w, r.bounds.d]) expect(v % 10).toBe(0);
  }
  // Every room has a door you can walk through (the v4 circulation checks).
  expect(projectAdvisories(project).filter((i) => DOOR_PROBLEMS.has(i.code)).map((i) => i.message)).toEqual([]);
}
const kinds = (p: Project) => p.floors[0].rooms.map((r) => `${r.kind}:${r.name}`).sort();

describe("planFromReading", () => {
  it("turns a clean reading into a valid home with every room and working doors", () => {
    const out = planFromReading(CLEAN, plot30x40)!;
    check(out.project);
    expect(kinds(out.project)).toEqual(
      [
        "bathroom:Bathroom",
        "bedroom:Bedroom 1",
        "bedroom:Main bedroom",
        "dining:Dining",
        "kitchen:Kitchen",
        "living:Living room",
        "utility:Pooja room",
        "utility:Store",
      ].sort(),
    );
    // The drawing's own size (26 × 34 ft), sitting at the back of the plot, away from the road.
    const fp = out.project.floors[0].footprint;
    expect(Math.abs(fp.w - 26 * FT)).toBeLessThan(10);
    expect(Math.abs(fp.d - 34 * FT)).toBeLessThan(10);
    expect(fp.z).toBe(60);
    // The pooja room was unsure: it's flagged for checking.
    expect(out.unsure.map((id) => out.project.floors[0].rooms.find((r) => r.id === id)!.name)).toEqual(["Pooja room"]);
    // The photo lies so the drawing's boundary sits on the house.
    expect(out.photo.x + 0.1 * out.photo.w).toBeCloseTo(fp.x, 5);
    expect(out.photo.z + 0.08 * out.photo.d).toBeCloseTo(fp.z, 5);
    expect(out.photo.w * 0.8).toBeCloseTo(fp.w, 5);
  });

  it("shrinks overlapping rooms back to the shared edge", () => {
    const out = planFromReading(OVERLAPPING, plot30x40)!;
    check(out.project);
    expect(out.project.floors[0].rooms.length).toBeGreaterThanOrEqual(7);
  });

  it("works when the road is on the drawing's side", () => {
    const out = planFromReading(ROTATED, { widthCm: Math.round(40 * FT), depthCm: Math.round(30 * FT), road: "east" })!;
    check(out.project);
    expect(out.project.plot.road).toBe("east");
    const fp = out.project.floors[0].footprint;
    expect(fp.w).toBeGreaterThan(fp.d);
    // At the back: the west edge, away from the road on the east.
    expect(fp.x).toBe(60);
  });

  it("fits a drawing without dimensions to the plot, keeping its shape", () => {
    const out = planFromReading(NO_UNITS, plot30x40, 3 / 4)!;
    check(out.project);
    const fp = out.project.floors[0].footprint;
    const aspect = ((3 / 4) * 0.8) / 0.84;
    expect(fp.w / fp.d).toBeCloseTo(aspect, 1);
    expect(fp.w).toBeLessThanOrEqual(plot30x40.widthCm - 120);
  });

  it("reads Hindi labels whatever type the model guessed", () => {
    const out = planFromReading(HINDI, plot30x40)!;
    check(out.project);
    expect(kinds(out.project)).toEqual(["bathroom:Bathroom", "bedroom:Bedroom 1", "kitchen:Kitchen", "living:Living room", "utility:Pooja room", "utility:Store"].sort());
  });

  it("scales a drawing that's bigger than the plot, and says so", () => {
    const big = { ...CLEAN, outline: { w: 60, h: 80 } };
    const out = planFromReading(big, plot30x40)!;
    check(out.project);
    expect(out.notes.join(" ")).toMatch(/scaled to fit/);
  });

  it("an empty reading still gives a house to draw rooms in (Draw it yourself)", () => {
    const out = planFromReading({ ...NO_UNITS, rooms: [] }, plot30x40, 1)!;
    expect(validateProject(out.project)).toEqual([]);
    expect(out.project.floors[0].rooms).toEqual([]);
  });
});

describe("sanitizeReading", () => {
  it("clamps every number, caps the rooms and trims labels", () => {
    const messy = sanitizeReading({
      units: "yards",
      outline: { w: -5, h: 1e9 },
      outlineBox: { x: -1, y: 2, w: 9, h: 0 },
      rooms: Array.from({ length: 50 }, (_, i) => ({ label: `<b>Room ${i}</b>   `, kind: "garage", x: 1.5, y: -2, w: 0.5, h: 0.5, confidence: 7 })),
      doors: [{ x: 3, y: -1, w: "wide" }],
      stairs: "none",
      notes: "x".repeat(1000),
    });
    expect(messy.units).toBe("unknown");
    expect(messy.outline).toEqual({ w: 0, h: 1000 });
    // A boundary that makes no sense becomes the whole photo.
    expect(messy.outlineBox).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    // Boxes pushed off the edge collapse and are dropped; at most 30 are looked at.
    expect(messy.rooms).toEqual([]);
    const ok = sanitizeReading({ rooms: Array.from({ length: 50 }, (_, i) => ({ label: `Bed ${i}`, kind: "bedroom", x: 0.1, y: 0.1, w: 0.2, h: 0.2, confidence: 3 })) });
    expect(ok.rooms).toHaveLength(30);
    expect(ok.rooms[0]).toMatchObject({ label: "Bed 0", kind: "bedroom", confidence: 1 });
    expect(sanitizeReading({ rooms: [{ label: "<script>Hall</script>", kind: "living", x: 0, y: 0, w: 1, h: 1 }] }).rooms[0].label).toBe("scriptHall/script");
    expect(messy.doors).toEqual([{ x: 1, y: 0, w: 0 }]);
    expect(messy.stairs).toEqual([]);
    expect(messy.notes).toHaveLength(300);
  });

  it("knows the labels Indian plans use", () => {
    const cases: [string, string][] = [
      ["Pooja", "pooja"],
      ["Puja room", "pooja"],
      ["Mandir", "pooja"],
      ["पूजा घर", "pooja"],
      ["Toilet", "bathroom"],
      ["W.C.", "bathroom"],
      ["Master bath", "bathroom"],
      ["Kitchen", "kitchen"],
      ["Rasoi", "kitchen"],
      ["रसोई", "kitchen"],
      ["M. Bed", "bedroom"],
      ["MBR", "bedroom"],
      ["Kids room", "bedroom"],
      ["शयन कक्ष", "bedroom"],
      ["Drawing room", "living"],
      ["Hall", "living"],
      ["बैठक", "living"],
      ["Dining", "dining"],
      ["Car parking", "open"],
      ["Sit out", "open"],
      ["Staircase", "stairs"],
      ["Store", "utility"],
    ];
    for (const [label, kind] of cases) expect([label, kindFromLabel(label)]).toEqual([label, kind]);
    expect(kindFromLabel("Room 7")).toBeNull();
  });
});
