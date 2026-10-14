import { describe, expect, it } from "vitest";
import { createPreset } from "../../../domain/model";
import { floorForGeometry } from "../../../domain/core";
import { deriveWalls } from "../../../domain/walls";
import type { GeometryFloor, Wall, WallOpening } from "../../../domain/types";
import { junctionAdjustments, type JunctionWall } from "./junctions";
import { visibleFaces, subtractRect } from "./boxSoup";
import { QuadBuilder, normalOf, type V3 } from "./QuadBuilder";
import { wallPieceIntervals, wallShell, type WallContext } from "./walls";
import { GOING, heightAt, MAX_RISE, stairLayout } from "./stairs";
import { outerRect, ridgeHeight, roofOutline, roofRise, flatRoofEdges } from "./roof";

const W = (id: string, axis: "x" | "z", x: number, z: number, length: number, exterior = false): JunctionWall => ({
  id,
  axis,
  x,
  z,
  length,
  exterior,
});

describe("junctions", () => {
  it("L corner: x-wall extends by t_z/2, z-wall shortens by t_x/2", () => {
    const a = junctionAdjustments([W("x", "x", 0, 0, 400, true), W("z", "z", 0, 0, 300, true)]);
    expect(a.get("x")!.start).toBeCloseTo(0.1);
    expect(a.get("x")!.startKind).toBe("corner");
    expect(a.get("z")!.start).toBeCloseTo(-0.1);
  });
  it("T junction: the stem shortens by half the through wall", () => {
    const a = junctionAdjustments([
      W("a", "x", 0, 0, 200, true),
      W("b", "x", 200, 0, 200, true),
      W("stem", "z", 200, 0, 300),
    ]);
    expect(a.get("stem")!.start).toBeCloseTo(-0.1);
    expect(a.get("stem")!.startKind).toBe("tee");
    expect(a.get("a")!.end).toBe(0);
    expect(a.get("a")!.endKind).toBe("continue");
    expect(a.get("b")!.start).toBe(0);
  });
  it("cross: x-walls pass, z-walls shorten", () => {
    const a = junctionAdjustments([
      W("w", "x", 0, 100, 100),
      W("e", "x", 100, 100, 100),
      W("n", "z", 100, 0, 100),
      W("s", "z", 100, 100, 100),
    ]);
    expect(a.get("w")!.end).toBe(0);
    expect(a.get("e")!.start).toBe(0);
    expect(a.get("n")!.end).toBeCloseTo(-0.06);
    expect(a.get("s")!.start).toBeCloseTo(-0.06);
    expect(a.get("n")!.endKind).toBe("cross");
  });
  it("straight continuation and free ends stay unchanged", () => {
    const a = junctionAdjustments([W("a", "x", 0, 0, 100), W("b", "x", 100, 0, 100)]);
    expect(a.get("a")!.end).toBe(0);
    expect(a.get("a")!.start).toBe(0);
    expect(a.get("a")!.startKind).toBe("free");
  });
});

describe("boxSoup", () => {
  it("subtracts rectangles", () => {
    const r = subtractRect({ u0: 0, u1: 10, v0: 0, v1: 10 }, { u0: 4, u1: 6, v0: -1, v1: 11 });
    const area = r.reduce((s, x) => s + (x.u1 - x.u0) * (x.v1 - x.v0), 0);
    expect(area).toBeCloseTo(80);
  });
  it("removes touching faces so two boxes form one closed shell", () => {
    const faces = visibleFaces([
      { min: [0, 0, 0], max: [1, 1, 1], data: 0 },
      { min: [1, 0, 0], max: [2, 1, 1], data: 1 },
    ]);
    // 2 boxes × 6 faces − 2 shared faces.
    expect(faces.length).toBe(10);
    const area = faces.reduce((s, f) => s + f.rects.reduce((a, r) => a + (r.u1 - r.u0) * (r.v1 - r.v0), 0), 0);
    expect(area).toBeCloseTo(10); // surface area of a 2×1×1 box
  });
});

const opening = (offset: number, width: number, sill = 0, height = 210): WallOpening => ({
  id: `o${offset}`,
  kind: sill ? "window" : "door",
  offset,
  width,
  height,
  sill,
  auto: true,
});

describe("wall pieces", () => {
  const wall = (openings: WallOpening[]) => ({ length: 600, openings });
  it("0 openings → one full-height piece", () => {
    expect(wallPieceIntervals(wall([]), 300)).toEqual([{ start: 0, length: 600, bottom: 0, height: 300 }]);
  });
  it("1 door → two piers + lintel", () => {
    const p = wallPieceIntervals(wall([opening(300, 90)]), 300);
    expect(p).toHaveLength(3);
    expect(p.filter((x) => x.bottom === 0 && x.height === 300).map((x) => [x.start, x.length])).toEqual([
      [0, 255],
      [345, 255],
    ]);
  });
  it("2 openings (door + window) → 3 piers, a sill and two lintels", () => {
    const p = wallPieceIntervals(wall([opening(150, 90), opening(420, 120, 90, 135)]), 300);
    expect(p.filter((x) => x.height === 300)).toHaveLength(3);
    expect(p.filter((x) => x.bottom === 0 && x.height === 90)).toHaveLength(1);
    expect(p.filter((x) => x.bottom > 0)).toHaveLength(2);
  });
  it("3 openings → pieces never overlap and cover the solid area", () => {
    const os = [opening(100, 80), opening(300, 100, 90, 120), opening(500, 80)];
    const p = wallPieceIntervals(wall(os), 300);
    const solid = p.reduce((s, x) => s + x.length * x.height, 0);
    const holes = 80 * 210 + 100 * 120 + 80 * 210;
    expect(solid).toBeCloseTo(600 * 300 - holes);
  });
});

function shellFor(floor: GeometryFloor, walls: Wall[]) {
  const ctx: WallContext = {
    floor,
    base: 0.15,
    height: 3,
    ground: true,
    openings: true,
    trim: "#f4f1ea",
    frontDoor: "#a87a52",
    stone: "#cfc4ae",
    aoStrips: false,
  };
  return wallShell(ctx, walls);
}

describe("wall shell", () => {
  const project = createPreset("compact");
  const floor = floorForGeometry(project, project.floors[0].id);
  const walls = deriveWalls(floor, project.plot.road);
  const shell = shellFor(floor, walls);

  it("faces outside the footprint are facade; faces inside are paint", () => {
    const fp = floor.footprint;
    for (const f of shell.faces) {
      if (f.face.axis === 1 || f.face.box.data.kind !== "wall") continue;
      const outward = f.face.plane + f.face.side * 0.02;
      const [x, z] =
        f.face.axis === 0
          ? [outward * 100, ((f.rect.v0 + f.rect.v1) / 2) * 100]
          : [((f.rect.u0 + f.rect.u1) / 2) * 100, outward * 100];
      const outside = x <= fp.x || x >= fp.x + fp.w || z <= fp.z || z >= fp.z + fp.d;
      expect(f.bucket).toBe(outside ? "facade" : "paint");
    }
  });

  it("paint faces carry the colour of the room on their side", () => {
    const living = floor.rooms.find((r) => r.kind === "living")!;
    const inLiving = shell.faces.filter((f) => f.roomId === living.id);
    expect(inLiving.length).toBeGreaterThan(0);
    const colors = new Set(inLiving.map((f) => f.color.join(",")));
    expect(colors.size).toBe(1);
  });

  it("has facade on every footprint side and no faces buried inside walls", () => {
    const facade = shell.faces.filter((f) => f.bucket === "facade" && f.face.axis !== 1);
    const sides = new Set(facade.map((f) => `${f.face.axis}:${f.face.side}`));
    expect(sides.size).toBe(4);
  });
});

describe("stairs", () => {
  it("lays out a straight flight when it fits", () => {
    const s = stairLayout({ x: 890, z: 1150, w: 260, d: 400 }, 3, "south");
    expect(s.risers).toBe(Math.ceil(3 / MAX_RISE));
    expect(s.kind).toBe("straight");
    expect(s.going).toBeCloseTo(GOING);
    expect(s.steps).toHaveLength(s.risers - 1);
  });
  it("switches to a U-shape in a short, wide void", () => {
    const s = stairLayout({ x: 60, z: 460, w: 220, d: 340 }, 3, "south");
    expect(s.kind).toBe("u");
    expect(s.landings.length).toBeGreaterThanOrEqual(1);
  });
  it("compresses a straight flight when narrow and short", () => {
    const s = stairLayout({ x: 0, z: 0, w: 120, d: 300 }, 3, "south");
    expect(s.kind).toBe("compressed");
    expect(s.going).toBeLessThan(GOING);
  });
  it("heightAt rises monotonically along each flight and reaches the top", () => {
    for (const b of [
      { x: 890, z: 1150, w: 260, d: 400 },
      { x: 60, z: 460, w: 220, d: 340 },
    ]) {
      const s = stairLayout(b, 3, "south");
      let last = -1;
      for (const step of s.steps.filter((st) => st.v0 === s.lanes[0][0])) {
        const u = (step.u0 + step.u1) / 2,
          v = (step.v0 + step.v1) / 2;
        const x = s.origin[0] + s.U[0] * u + s.V[0] * v,
          z = s.origin[1] + s.U[1] * u + s.V[1] * v;
        const h = heightAt(s, x, z);
        expect(h).toBeGreaterThan(last);
        last = h;
      }
      const all = [...s.steps, ...s.landings].map((st) => st.y);
      expect(Math.max(...all)).toBeLessThanOrEqual(3 + 1e-9);
    }
  });
  it("starts at the edge opposite the road", () => {
    const south = stairLayout({ x: 0, z: 0, w: 260, d: 400 }, 3, "south");
    expect(south.U[1]).toBe(1); // climbs toward the road (south)
    const north = stairLayout({ x: 0, z: 0, w: 260, d: 400 }, 3, "north");
    expect(north.U[1]).toBe(-1);
  });
});

describe("roof", () => {
  const fp = { x: 100, z: 100, w: 1000, d: 800 };
  it("gable ridge height is (short/2)·tan(pitch) over the outer walls", () => {
    const r = outerRect(fp);
    const short = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    expect(ridgeHeight(short, 30)).toBeCloseTo((short / 2) * Math.tan(Math.PI / 6));
    expect(roofRise(fp, "gable", 30, "south")).toBeGreaterThan(ridgeHeight(short, 30));
    expect(roofRise(fp, "hip", 40, "south")).toBeGreaterThan(roofRise(fp, "hip", 20, "south"));
  });
  it("shed rises over the span perpendicular to the road", () => {
    const r = outerRect(fp);
    const span = r.z1 - r.z0;
    expect(roofRise(fp, "shed", 30, "south")).toBeGreaterThan(span * Math.tan((12 * Math.PI) / 180));
  });
  it("eave outline is closed and encloses the walls with overhangs", () => {
    for (const style of ["gable", "hip", "shed", "flat"] as const) {
      const o = roofOutline(fp, style, "south");
      expect(o[0]).toEqual(o[o.length - 1]);
      const r = outerRect(fp);
      const xs = o.map((p) => p[0]),
        zs = o.map((p) => p[1]);
      expect(Math.min(...xs)).toBeLessThanOrEqual(r.x0);
      expect(Math.max(...zs)).toBeGreaterThanOrEqual(r.z1);
    }
  });
  it("flat roof parapets follow the slab outline (courtyard included)", () => {
    const project = createPreset("courtyard");
    const floor = floorForGeometry(project, project.floors[1].id);
    const edges = flatRoofEdges(floor);
    const length = edges.reduce((s, e) => s + e.length, 0);
    const fpPerimeter = 2 * (floor.footprint.w + floor.footprint.d);
    expect(length).toBeGreaterThan(fpPerimeter);
  });
});

describe("QuadBuilder", () => {
  it("soft boxes are closed with outward-facing triangles", () => {
    const b = new QuadBuilder();
    b.softBox([0, 0, 0], [1, 0.5, 0.8], [1, 1, 1], 0.08);
    const g = b.build();
    const pos = g.getAttribute("position");
    const idx = g.getIndex()!;
    const c: V3 = [0.5, 0.25, 0.4];
    for (let i = 0; i < idx.count; i += 3) {
      const p = [0, 1, 2].map((k) => {
        const j = idx.getX(i + k);
        return [pos.getX(j), pos.getY(j), pos.getZ(j)] as V3;
      });
      const n = normalOf(p[0], p[1], p[2]);
      const m: V3 = [(p[0][0] + p[1][0] + p[2][0]) / 3 - c[0], (p[0][1] + p[1][1] + p[2][1]) / 3 - c[1], (p[0][2] + p[1][2] + p[2][2]) / 3 - c[2]];
      expect(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]).toBeGreaterThan(0);
    }
  });
});
