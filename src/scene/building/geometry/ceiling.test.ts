import { describe, expect, it } from "vitest";
import { applyStylePreset, setRoomFalseCeiling } from "../../../domain/materials";
import { createPreset } from "../../../domain/model";
import type { Project } from "../../../domain/types";
import { deriveWalls, wallStart } from "../../../domain/walls";
import { floorForGeometry } from "../../../domain/core";
import { floorBase } from "../../coords";
import { buildCeilings, falseCeilings } from "./ceiling";

const modern = (): Project => {
  const r = applyStylePreset(createPreset("family"), "indian-modern");
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

describe("false ceiling geometry", () => {
  it("stays inside each room, below the slab, with downlights in the band", () => {
    const p = modern();
    for (const floor of p.floors) {
      for (const fc of falseCeilings(p, floor.id)) {
        const room = floor.rooms.find((r) => r.id === fc.roomId)!;
        const b = room.bounds;
        expect(fc.x0).toBeGreaterThanOrEqual(b.x / 100);
        expect(fc.x1).toBeLessThanOrEqual((b.x + b.w) / 100);
        expect(fc.z0).toBeGreaterThanOrEqual(b.z / 100);
        expect(fc.z1).toBeLessThanOrEqual((b.z + b.d) / 100);
        expect(fc.bottom).toBeLessThan(fc.top);
        expect(fc.downlights.length).toBeGreaterThan(0);
        for (const d of fc.downlights) {
          expect(d[0]).toBeGreaterThan(fc.x0);
          expect(d[0]).toBeLessThan(fc.x1);
          expect(d[2]).toBeGreaterThan(fc.z0);
          expect(d[2]).toBeLessThan(fc.z1);
        }
      }
    }
  });

  it("never cuts into a door or window: every opening's head is below the band", () => {
    const p = modern();
    for (const floor of p.floors) {
      const walls = deriveWalls(floorForGeometry(p, floor.id), p.plot.road);
      for (const fc of falseCeilings(p, floor.id)) {
        for (const w of walls)
          for (const o of w.openings) {
            const c = (wallStart(w) + o.offset) / 100;
            const line = (w.axis === "x" ? w.z : w.x) / 100;
            const touches =
              w.axis === "x"
                ? c >= fc.x0 - 0.1 && c <= fc.x1 + 0.1 && (Math.abs(line - fc.z0) < 0.2 || Math.abs(line - fc.z1) < 0.2)
                : c >= fc.z0 - 0.1 && c <= fc.z1 + 0.1 && (Math.abs(line - fc.x0) < 0.2 || Math.abs(line - fc.x1) < 0.2);
            if (touches) expect(floorBase(floor) + (o.sill + o.height) / 100).toBeLessThan(fc.bottom);
          }
      }
    }
  });

  it("gives a narrow room a plain drop ceiling, with no step and no cove", () => {
    const p = createPreset("compact");
    const floor = p.floors[0];
    const narrow = [...floor.rooms].sort((a, b) => Math.min(a.bounds.w, a.bounds.d) - Math.min(b.bounds.w, b.bounds.d))[0];
    const r = setRoomFalseCeiling(p, floor.id, narrow.id, true);
    if (!r.ok) throw new Error(r.error);
    const fc = falseCeilings(r.project, floor.id).find((c) => c.roomId === narrow.id);
    if (Math.min(narrow.bounds.w, narrow.bounds.d) < 240 + 12) {
      expect(fc?.band ?? 0).toBe(0);
      expect(fc?.cove ?? []).toEqual([]);
    }
  });

  it("switching it off removes it, and a plain home has none", () => {
    expect(createPreset("family").floors.every((f) => falseCeilings(createPreset("family"), f.id).length === 0)).toBe(true);
    const p = modern();
    const floor = p.floors[0];
    const [first] = falseCeilings(p, floor.id);
    const off = setRoomFalseCeiling(p, floor.id, first.roomId, false);
    if (!off.ok) throw new Error(off.error);
    expect(falseCeilings(off.project, floor.id).some((c) => c.roomId === first.roomId)).toBe(false);
  });

  it("merges every ceiling of a floor into a few buckets", () => {
    const keys = buildCeilings(modern(), modern().floors[0].id).entries().map(([k]) => k);
    expect(keys.length).toBeLessThanOrEqual(4);
    expect(keys).toContain("plaster");
    expect(keys).toContain("glow");
  });
});
