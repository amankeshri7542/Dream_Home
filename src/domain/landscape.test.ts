import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { resizeBuilding } from "./builder";
import { floorForGeometry } from "./core";
import {
  LANDSCAPE_CATALOG,
  autoLandscape,
  findLandscapeSpot,
  landscapeFootprint,
  materializeLandscape,
  resolveLandscape,
} from "./landscape";
import {
  addLandscape,
  customizeLandscape,
  duplicateLandscape,
  moveLandscape,
  removeLandscape,
  resetLandscape,
  resizeLandscape,
  rotateLandscape,
  updateLandscape,
} from "./landscapeCommands";
import {
  addBalcony,
  createPreset,
  deriveWalls,
  parseProject,
  updatePlot,
  validateProjectIssues,
} from "./model";
import type { EditResult, LandscapeItem, Project } from "./types";
import { isWindow } from "./walls";

const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const errors = (p: Project) =>
  validateProjectIssues(p).filter((i) => i.severity === "error");
const codes = (p: Project) => errors(p).map((i) => i.code);
function sketch(): Project {
  return {
    schemaVersion: 2,
    name: "Garden",
    plot: { width: 2000, depth: 2400, north: 0, road: "south", setback: 100 },
    floors: [
      {
        id: "f0",
        name: "Ground floor",
        elevation: 0,
        height: 300,
        footprint: { x: 500, z: 500, w: 1000, d: 1000 },
        rooms: [{ id: "hall", name: "Hall", kind: "living", unitId: null, bounds: { x: 500, z: 500, w: 1000, d: 1000 } }],
        balconies: [],
        unitAreas: [],
      },
    ],
    units: [],
    verticalSpaces: [],
    garden: true,
    parking: true,
  };
}

/** The original scene's garden maths, in metres (the port's oracle). */
function legacyGarden(project: Project) {
  const { width, depth } = project.plot;
  const w = width / 100,
    d = depth / 100;
  const footprint = project.floors[0].footprint;
  const horizontal = project.plot.road === "south" || project.plot.road === "north";
  const margin =
    (project.plot.road === "south"
      ? depth - footprint.z - footprint.d
      : project.plot.road === "north"
        ? footprint.z
        : project.plot.road === "east"
          ? width - footprint.x - footprint.w
          : footprint.x) / 100;
  const exteriorDoor = deriveWalls(floorForGeometry(project, project.floors[0].id), project.plot.road).find(
    (wall) => wall.exterior && wall.openings.some((o) => !isWindow(o.kind)),
  );
  const entryOpening = exteriorDoor?.openings.find((o) => !isWindow(o.kind));
  const entryAlong =
    exteriorDoor && entryOpening
      ? ((horizontal ? exteriorDoor.x : exteriorDoor.z) + entryOpening.offset) / 100
      : (horizontal ? w : d) / 2;
  const parkingAlong = entryAlong > (horizontal ? w : d) / 2 ? (horizontal ? w : d) / 4 : ((horizontal ? w : d) * 3) / 4;
  const parkingFits =
    margin >= 4.8 &&
    Math.abs(parkingAlong - entryAlong) > 2.1 &&
    parkingAlong >= 1.3 &&
    parkingAlong <= (horizontal ? w : d) - 1.3;
  const trees = [
    { x: 0.85, z: 1.2, scale: 1.05 },
    { x: w - 0.95, z: 1.25, scale: 1.2 },
    { x: w - 0.9, z: d - 1.45, scale: 0.78 },
    { x: 0.9, z: d * 0.68, scale: 0.8 },
  ].filter((tree) => {
    const clearance = (tree.scale * 1.05 + 0.15) * 100;
    return (
      tree.x * 100 + clearance < footprint.x ||
      tree.x * 100 - clearance > footprint.x + footprint.w ||
      tree.z * 100 + clearance < footprint.z ||
      tree.z * 100 - clearance > footprint.z + footprint.d
    );
  });
  return {
    trees: project.garden ? trees : [],
    pavers: exteriorDoor ? Math.floor(margin / 0.46) : 0,
    entryAlong,
    parking: project.parking && parkingFits,
  };
}

describe("automatic garden", () => {
  it("ports the original trees, entrance path, parking and courtyard trees", () => {
    for (const { name, project } of corpus())
      for (const variant of [project, { ...project, garden: true, parking: true }]) {
        const legacy = legacyGarden(variant);
        const auto = autoLandscape(variant);
        const trees = auto.filter((i) => i.id.startsWith("auto:tree-"));
        expect(trees.length, name).toBe(legacy.trees.length);
        trees.forEach((t, i) => {
          expect(t.x).toBeCloseTo(legacy.trees[i].x * 100, 6);
          expect(t.z).toBeCloseTo(legacy.trees[i].z * 100, 6);
        });
        const path = auto.find((i) => i.kind === "path");
        expect(!!path, name).toBe(legacy.pavers > 0 && !!path);
        if (path) {
          const along = variant.plot.road === "south" || variant.plot.road === "north" ? path.x : path.z;
          expect(along).toBeCloseTo(legacy.entryAlong * 100, 6);
        }
        expect(auto.some((i) => i.kind === "parking"), name).toBe(legacy.parking);
        const courtyards = floorForGeometry(variant, variant.floors[0].id).voids.filter(
          (v) => v.kind === "courtyard",
        );
        expect(auto.filter((i) => i.id.startsWith("auto:courtyard-")).length).toBe(courtyards.length);
      }
  });
  it("materialises to a valid explicit garden for every corpus project", () => {
    for (const { name, project } of corpus())
      for (const variant of [project, { ...project, garden: true, parking: true }]) {
        const { project: p, idMap } = materializeLandscape(variant);
        expect(errors(p), name).toEqual([]);
        expect(p.landscape!.length, name).toBe(idMap.size);
        expect(parseProject(JSON.stringify(p))).toStrictEqual(p);
      }
  });
  it("prefers the explicit list once customised", () => {
    const p = sketch();
    expect(resolveLandscape(p)).toEqual(autoLandscape(p));
    const custom = ok(customizeLandscape(p));
    expect(resolveLandscape(custom)).toBe(custom.landscape);
    expect(ok(resetLandscape(custom))).toStrictEqual(p);
  });
});

describe("garden rules", () => {
  const tree: LandscapeItem = { id: "t", kind: "tree-oak", x: 200, z: 200, rotation: 0 };
  const put = (items: LandscapeItem[], base = sketch()) => ({ ...base, landscape: items });
  it("validates placement, overlap, shape and limits", () => {
    expect(codes(put([tree]))).toEqual([]);
    expect(codes(put([{ ...tree, x: 10 }]))).toEqual(["landscape-outside"]);
    expect(codes(put([{ ...tree, x: 700, z: 700 }]))).toEqual(["landscape-on-building"]);
    expect(codes(put([{ ...tree, x: 205 }]))).toEqual(["landscape-shape"]);
    expect(codes(put([{ ...tree, rotation: 90 }]))).toEqual(["landscape-shape"]);
    expect(codes(put([{ ...tree, variant: "xl" }]))).toEqual(["landscape-shape"]);
    expect(codes(put([{ ...tree, w: 80 }]))).toEqual(["landscape-shape"]);
    expect(codes(put([{ ...tree, kind: "volcano" }]))).toEqual(["landscape-unknown"]);
    expect(codes(put([tree, { ...tree, id: "t2", x: 240 }]))).toEqual(["landscape-overlap"]);
    // Paths and beds may run under solid items.
    expect(codes(put([tree, { id: "p", kind: "path", x: 200, z: 300, rotation: 0, d: 400 }]))).toEqual([]);
    expect(codes(put([{ id: "p", kind: "path", x: 200, z: 300, rotation: 90, w: 210 }]))).toEqual(["landscape-shape"]);
    const many = Array.from({ length: 121 }, (_, i): LandscapeItem => ({
      id: `s${i}`, kind: "planter", x: 100 + (i % 11) * 70, z: 1600 + Math.floor(i / 11) * 70, rotation: 0,
    }));
    expect(codes(put(many))).toEqual(["limit"]);
    expect(() =>
      parseProject(JSON.stringify(put([{ ...tree, rotation: 45 as 0 }]))),
    ).toThrow("Project contains an invalid garden item.");
  });
  it("keeps trees out from under upper balconies but allows low items", () => {
    const base = sketch();
    const two: Project = {
      ...base,
      floors: [
        base.floors[0],
        { ...base.floors[0], id: "f1", name: "First", elevation: 300, rooms: [{ ...base.floors[0].rooms[0], id: "hall-1" }] },
      ],
      verticalSpaces: [],
    };
    const withBalcony = addBalcony(two, "f1", { edge: "south", offset: 300, width: 300, depth: 150 });
    // Without stairs the project is invalid, so check the rule directly.
    expect(withBalcony.ok).toBe(false);
    const p: Project = {
      ...two,
      verticalSpaces: [{ id: "stairs", kind: "stairs", bounds: { x: 1200, z: 1200, w: 200, d: 200 }, floorIds: ["f0", "f1"], unitId: null }],
      floors: [
        { ...two.floors[0], rooms: [{ ...two.floors[0].rooms[0], bounds: { x: 500, z: 500, w: 700, d: 1000 } }] },
        { ...two.floors[1], rooms: [{ ...two.floors[1].rooms[0], bounds: { x: 500, z: 500, w: 700, d: 1000 } }], balconies: [{ id: "b", edge: "south", offset: 300, width: 300, depth: 150 }] },
      ],
    };
    expect(codes(p)).toEqual([]);
    expect(codes(put([{ ...tree, x: 950, z: 1560 }], p))).toEqual(["landscape-under-balcony"]);
    expect(codes(put([{ id: "bench", kind: "bench", x: 950, z: 1560, rotation: 0 }], p))).toEqual([]);
  });
});

describe("garden commands", () => {
  it("shrinks a pool to fit a small garden instead of refusing", () => {
    const p = createPreset("compact");
    const added = addLandscape(p, "pool");
    expect(added.ok).toBe(true);
    const pool = ok(added).landscape!.find((i) => i.kind === "pool")!;
    const entry = LANDSCAPE_CATALOG.find((e) => e.id === "pool")!;
    expect(pool.w! * pool.d!).toBeLessThan(entry.size.w * entry.size.d);
    expect(pool.w).toBeGreaterThanOrEqual(entry.resizable!.w[0]);
    expect(validateProjectIssues(ok(added))).toEqual([]);
  });
  it("adds at a free spot, moves, resizes, turns, restyles, copies and removes", () => {
    let p = ok(customizeLandscape(sketch()));
    const before = p.landscape!.length;
    const added = addLandscape(p, "bench");
    expect(added.ok && added.focusId).toBe("bench");
    p = ok(added);
    expect(p.landscape).toHaveLength(before + 1);
    p = ok(moveLandscape(p, "bench", { x: 301, z: 1704 }));
    expect(p.landscape!.at(-1)).toMatchObject({ x: 300, z: 1700 });
    p = ok(rotateLandscape(p, "bench"));
    expect(p.landscape!.at(-1)!.rotation).toBe(90);
    expect(rotateLandscape(p, p.landscape!.find((i) => i.kind === "tree-oak")!.id).ok).toBe(false);
    p = ok(addLandscape(p, "flowerbed", { x: 1700, z: 300 }));
    p = ok(resizeLandscape(p, "flowerbed", { w: 300 }));
    expect(p.landscape!.at(-1)).toMatchObject({ w: 300, variant: "pink" });
    p = ok(updateLandscape(p, "flowerbed", { variant: "purple" }));
    expect(p.landscape!.at(-1)!.variant).toBe("purple");
    expect(resizeLandscape(p, "bench", { w: 300 }).ok).toBe(false);
    p = ok(duplicateLandscape(p, "bench"));
    expect(p.landscape!.filter((i) => i.kind === "bench")).toHaveLength(2);
    expect(errors(p)).toEqual([]);
    p = ok(removeLandscape(p, "bench"));
    expect(p.landscape!.some((i) => i.id === "bench")).toBe(false);
    expect(addLandscape(p, "volcano").ok).toBe(false);
    expect(addLandscape(p, "tree-oak", { x: 700, z: 700 }).ok).toBe(false);
  });
  it("edits automatic items by their auto ids", () => {
    const p = sketch();
    const tree = autoLandscape(p).find((i) => i.kind === "tree-oak")!;
    const next = ok(moveLandscape(p, tree.id, { x: 150, z: 200 }));
    expect(next.landscape!.some((i) => i.kind === "tree-oak" && i.x === 150 && i.z === 200)).toBe(true);
    const removed = ok(removeLandscape(p, tree.id));
    expect(removed.landscape!.length).toBe(autoLandscape(p).length - 1);
  });
  it("finds spots that are valid", () => {
    const p = ok(customizeLandscape(sketch()));
    for (const entry of LANDSCAPE_CATALOG) {
      const spot = findLandscapeSpot(p, entry.id);
      expect(spot, entry.id).not.toBeNull();
      const item = { id: "probe", kind: entry.id, ...spot! };
      expect(codes({ ...p, landscape: [...p.landscape!, item] }), entry.id).toEqual([]);
      expect(landscapeFootprint(item).w).toBeGreaterThan(0);
    }
  });
});

describe("reconciling the garden", () => {
  it("removes items the house grows over, or the plot loses, with notices", () => {
    let p = ok(customizeLandscape(sketch()));
    p = ok(addLandscape(p, "bench", { x: 1600, z: 700, rotation: 90 }));
    const grown = resizeBuilding(p, "f0", { w: 1200, d: 1000 });
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(grown.project.landscape!.some((i) => i.id === "bench")).toBe(false);
    expect(grown.notices?.find((n) => n.source?.id === "bench")).toMatchObject({
      code: "landscape-removed",
      severity: "notice",
    });
    expect(errors(grown.project)).toEqual([]);
    const shrunk = updatePlot(p, { width: 1800 });
    expect(shrunk.ok && shrunk.notices?.some((n) => n.code === "landscape-removed")).toBe(true);
  });
});
