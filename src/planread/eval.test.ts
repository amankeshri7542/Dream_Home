// The plan scorer: it must be honest about what it measures, because later
// reading changes are judged by it.
import { describe, expect, it } from "vitest";
import { createPreset } from "../domain/model";
import type { Project, Room } from "../domain/types";
import { TEMPLATES, buildTemplate } from "../onboarding/templates";
import { TARGETS, perfectReading, scoreHome, sloppyReading, summarize } from "./eval";
import { feetInches, planSheetSvg } from "./evalSheet";
import { planFromReading, type PlotChoice } from "./fromReading";

const home = () => createPreset("family");
const plotOf = (p: Project): PlotChoice => ({ widthCm: p.plot.width, depthCm: p.plot.depth, road: p.plot.road });
/** The same home with its ground floor's rooms changed. */
const withRooms = (p: Project, change: (rooms: Room[]) => Room[]): Project => ({
  ...p,
  floors: p.floors.map((f, i) => (i === 0 ? { ...f, rooms: change(f.rooms) } : f)),
});

describe("scoreHome", () => {
  it("gives a home full marks against itself", () => {
    const s = scoreHome(home(), home());
    expect(s).toMatchObject({ roomRecall: 1, roomPrecision: 1, typeAccuracy: 1, meanIou: 1, medianEdgeCm: 0, footprintErrorCm: 0, doorRecall: 1, windowRecall: 1, openRecall: 1, floorsMissing: 0, fixes: 0 });
  });

  it("doesn't count where the house sits on its plot", () => {
    const moved = home();
    const shifted: Project = {
      ...moved,
      floors: moved.floors.map((f) => ({
        ...f,
        footprint: { ...f.footprint, x: f.footprint.x + 70 },
        rooms: f.rooms.map((r) => ({ ...r, bounds: { ...r.bounds, x: r.bounds.x + 70 } })),
      })),
    };
    expect(scoreHome(shifted, home())).toMatchObject({ medianEdgeCm: 0, roomRecall: 1, fixes: 0 });
  });

  it("names a missing room and an extra one, each as one fix", () => {
    const truth = home();
    const missing = truth.floors[0].rooms[0];
    const s = scoreHome(withRooms(truth, (rooms) => rooms.slice(1)), truth);
    expect(s.missingRooms).toEqual([missing.name]);
    const total = truth.floors.reduce((n, f) => n + f.rooms.length, 0);
    expect(s.roomRecall).toBeCloseTo((total - 1) / total);
    expect(s.fixes).toBe(1);
    const extra = scoreHome(truth, withRooms(truth, (rooms) => rooms.slice(1)));
    expect(extra.extraRooms).toEqual([missing.name]);
    expect(extra.roomPrecision).toBeLessThan(1);
    expect(extra.fixes).toBe(1);
  });

  it("sees a wrong use, and treats a pooja room as its own use", () => {
    const truth = withRooms(home(), (rooms) => rooms.map((r, i) => (i === 0 ? { ...r, kind: "utility" as const, name: "Pooja room" } : r)));
    const asStore = withRooms(truth, (rooms) => rooms.map((r, i) => (i === 0 ? { ...r, name: "Store" } : r)));
    const s = scoreHome(asStore, truth);
    expect(s.wrongTypes).toEqual(["Pooja room read as Store"]);
    expect(s.typeAccuracy).toBeLessThan(1);
    expect(s.fixes).toBe(1);
  });

  it("measures how far an edge is out, and calls a big miss a fix", () => {
    const truth = home();
    const resize = (by: number) =>
      withRooms(truth, (rooms) => rooms.map((r, i) => (i === 0 ? { ...r, bounds: { ...r.bounds, w: r.bounds.w - by } } : r)));
    const small = scoreHome(resize(20), truth);
    expect(small.p90EdgeCm).toBeLessThanOrEqual(20);
    expect(small.fixes).toBe(0);
    expect(scoreHome(resize(40), truth).fixes).toBe(1);
  });

  it("counts floors the reading doesn't cover", () => {
    const built = buildTemplate(TEMPLATES.find((t) => t.id === "duplex")!);
    if (!built.ok) throw new Error(built.error);
    const groundOnly = { ...built.project, floors: [built.project.floors[0]] };
    expect(scoreHome(groundOnly, built.project).floorsMissing).toBe(built.project.floors.length - 1);
  });
});

describe("perfectReading", () => {
  it("rebuilds the ground floor's rooms through the real pipeline", () => {
    const truth = home();
    const out = planFromReading(perfectReading(truth), plotOf(truth))!;
    const s = scoreHome(out.project, truth);
    expect(s.footprintErrorCm).toBeLessThanOrEqual(10);
    expect(s.roomRecall).toBeGreaterThan(0.9);
    expect(s.medianEdgeCm).toBeLessThanOrEqual(10);
  });
  it("lists the home's doors and stays within the drawing", () => {
    const reading = perfectReading(home());
    expect(reading.doors.length).toBeGreaterThan(0);
    for (const r of reading.rooms) {
      expect(r.x + r.w).toBeLessThanOrEqual(1.0001);
      expect(r.y + r.h).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("sloppyReading", () => {
  it("is deterministic for a seed and stays in range", () => {
    const reading = perfectReading(home());
    expect(sloppyReading(reading, 0.03, 7)).toEqual(sloppyReading(reading, 0.03, 7));
    expect(sloppyReading(reading, 0.03, 7)).not.toEqual(sloppyReading(reading, 0.03, 8));
    for (const r of sloppyReading(reading, 0.1, 3).rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe("summarize", () => {
  it("averages plans and compares them with the targets", () => {
    const full = scoreHome(home(), home());
    const poor = { ...full, roomRecall: 0.5, medianEdgeCm: 40, doorRecall: 0, fixes: 9 };
    const s = summarize([full, full, poor]);
    expect(s.plans).toBe(3);
    expect(s.roomRecall).toBeCloseTo(2.5 / 3);
    expect(s.medianEdgeCm).toBe(0);
    expect(s.within3Fixes).toBeCloseTo(2 / 3);
    expect(s.meetsTargets).toEqual({ roomRecall: false, medianEdgeCm: true, doorRecall: false, within3Fixes: false });
    expect(TARGETS.medianEdgeCm).toBe(15);
  });
  it("claims nothing with no plans", () => {
    expect(summarize([]).meetsTargets).toEqual({ roomRecall: false, medianEdgeCm: false, doorRecall: false, within3Fixes: false });
  });
});

describe("planSheetSvg", () => {
  it("draws every room with its size, in feet and inches, as builders write it", () => {
    const truth = home();
    const { svg, width, height } = planSheetSvg(truth);
    expect(width).toBeGreaterThan(300);
    expect(height).toBeGreaterThan(300);
    const ground = [...truth.floors].sort((a, b) => a.elevation - b.elevation)[0];
    for (const r of ground.rooms) expect(svg).toContain(`${feetInches(r.bounds.w)} X ${feetInches(r.bounds.d)}`.replace(/"/g, "&quot;"));
    expect(svg).toContain("GROUND FLOOR PLAN");
  });
  it("can label in Hindi, and escapes names", () => {
    const named = withRooms(home(), (rooms) => rooms.map((r, i) => (i === 0 ? { ...r, kind: "kitchen" as const, name: "Kitchen" } : i === 1 ? { ...r, name: 'A <b> & "c"' } : r)));
    expect(planSheetSvg(named, { hindi: true }).svg).toContain("रसोई");
    expect(planSheetSvg(named).svg).not.toContain("<b>");
  });
  it("writes sizes the way plans do", () => {
    expect(feetInches(30.48 * 12.5)).toBe(`12'6"`);
    expect(feetInches(304.8)).toBe(`10'0"`);
  });
});
