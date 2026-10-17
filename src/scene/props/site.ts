// Pure site layout: plinth extents, road frame, parking, path and garden trees.
import { balconyBounds } from "../../domain/core";
import { frontVehicles, lifeFootprint } from "../../domain/livedIn";
import type { EdgeSide, Project } from "../../domain/types";
import type { Entrance } from "../building/geometry/porch";

export const PLINTH_PAD = 0.6;
export const ROAD_BAND = 4.4;

export type Extents = { x0: number; x1: number; z0: number; z1: number };
/** Plinth top extents in plot-local metres (plot + side pads + road band). */
export function plinthExtents(project: Project): Extents {
  const w = project.plot.width / 100,
    d = project.plot.depth / 100,
    r = project.plot.road;
  return {
    x0: -(r === "west" ? ROAD_BAND : PLINTH_PAD),
    x1: w + (r === "east" ? ROAD_BAND : PLINTH_PAD),
    z0: -(r === "north" ? ROAD_BAND : PLINTH_PAD),
    z1: d + (r === "south" ? ROAD_BAND : PLINTH_PAD),
  };
}

/** Road-local frame: `along` the road, `out` metres beyond the plot edge. */
export function roadFrame(project: Project) {
  const w = project.plot.width / 100,
    d = project.plot.depth / 100,
    road: EdgeSide = project.plot.road;
  const horizontal = road === "south" || road === "north";
  const ext = plinthExtents(project);
  const alongMin = horizontal ? ext.x0 : ext.z0,
    alongMax = horizontal ? ext.x1 : ext.z1;
  const toPlot = (along: number, out: number): [number, number] =>
    road === "south" ? [along, d + out] : road === "north" ? [along, -out] : road === "east" ? [w + out, along] : [-out, along];
  return { road, horizontal, alongMin, alongMax, toPlot, length: horizontal ? w : d };
}

const rectsOverlap = (a: Extents, b: Extents) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

export type SiteLayout = {
  parking: { center: [number, number]; horizontal: boolean; driveway: Extents } | null;
  path: Extents[];
  trees: { x: number; z: number; scale: number; kind: "oak" | "pine" | "blossom" }[];
  shrubs: { x: number; z: number; r: number; flowers: boolean }[];
  obstacles: Extents[];
  /**
   * Open ground that planting must leave clear (not the house): the porch,
   * path and parking, and where the lived-in scooter and bicycle park.
   */
  keepClear: Extents[];
};

export function siteLayout(project: Project, entrance: Entrance | null): SiteLayout {
  const w = project.plot.width / 100,
    d = project.plot.depth / 100;
  const frame = roadFrame(project);
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const fp = ground.footprint;
  const road = project.plot.road;
  const horizontal = frame.horizontal;
  const len = frame.length;
  // Gap between the footprint and the road edge.
  const margin =
    (road === "south" ? project.plot.depth - fp.z - fp.d : road === "north" ? fp.z : road === "east" ? project.plot.width - fp.x - fp.w : fp.x) / 100;
  const footprints: Extents[] = project.floors.flatMap((f) => [
    { x0: f.footprint.x / 100 - 0.3, x1: (f.footprint.x + f.footprint.w) / 100 + 0.3, z0: f.footprint.z / 100 - 0.3, z1: (f.footprint.z + f.footprint.d) / 100 + 0.3 },
    ...f.balconies.map((b) => {
      const r = balconyBounds(f, b);
      return { x0: r.x / 100 - 0.2, x1: (r.x + r.w) / 100 + 0.2, z0: r.z / 100 - 0.2, z1: (r.z + r.d) / 100 + 0.2 };
    }),
  ]);
  const entryAlong = entrance ? (horizontal === (entrance.axis === "x") ? entrance.along : entrance.line) : len / 2;
  // Path: straight from the road edge to just beyond the porch step.
  const path: Extents[] = [];
  if (entrance && entrance.roadSide) {
    const stepEnd = entrance.line + entrance.out * 1.5;
    const edge = road === "south" ? d : road === "north" ? 0 : road === "east" ? w : 0;
    const a = Math.min(stepEnd, edge),
      b = Math.max(stepEnd, edge);
    if (b - a > 0.3) {
      const half = 0.55;
      path.push(
        horizontal
          ? { x0: entrance.along - half, x1: entrance.along + half, z0: a, z1: b }
          : { x0: a, x1: b, z0: entrance.along - half, z1: entrance.along + half },
      );
    }
  }
  // Parking (v1 logic).
  let parking: SiteLayout["parking"] = null;
  if (project.parking) {
    const along = entryAlong > len / 2 ? len / 4 : (len * 3) / 4;
    const fits = margin >= 4.8 && Math.abs(along - entryAlong) > 2.1 && along >= 1.3 && along <= len - 1.3;
    if (fits) {
      const center: [number, number] = horizontal
        ? [along, road === "south" ? d - margin / 2 : margin / 2]
        : [road === "east" ? w - margin / 2 : margin / 2, along];
      const edgeOut = road === "south" ? d : road === "north" ? 0 : road === "east" ? w : 0;
      const driveway: Extents = horizontal
        ? { x0: along - 1.3, x1: along + 1.3, z0: Math.min(edgeOut, center[1]), z1: Math.max(edgeOut, center[1]) }
        : { x0: Math.min(edgeOut, center[0]), x1: Math.max(edgeOut, center[0]), z0: along - 1.3, z1: along + 1.3 };
      parking = { center, horizontal, driveway };
    }
  }
  const obstacles = [...footprints, ...path];
  if (parking) {
    const [cx, cz] = parking.center;
    obstacles.push(horizontal ? { x0: cx - 1.5, x1: cx + 1.5, z0: cz - 2.5, z1: cz + 2.5 } : { x0: cx - 2.5, x1: cx + 2.5, z0: cz - 1.5, z1: cz + 1.5 });
    obstacles.push(parking.driveway);
  }
  const candidates: SiteLayout["trees"] = [
    { x: 0.95, z: 1.2, scale: 1.05, kind: "oak" },
    { x: w - 1.0, z: 1.3, scale: 1.15, kind: "oak" },
    { x: w - 0.95, z: d - 1.45, scale: 0.78, kind: "blossom" },
    { x: 0.95, z: d * 0.62, scale: 0.85, kind: "pine" },
    { x: w * 0.5, z: 0.95, scale: 0.8, kind: "blossom" },
    { x: w - 0.95, z: d * 0.55, scale: 0.8, kind: "oak" },
  ];
  const trees = candidates.filter((t) => {
    const r = t.scale * 0.95 + 0.15;
    const box = { x0: t.x - r, x1: t.x + r, z0: t.z - r, z1: t.z + r };
    return box.x0 >= -0.2 && box.x1 <= w + 0.2 && box.z0 >= -0.2 && box.z1 <= d + 0.2 && !obstacles.some((o) => rectsOverlap(o, box));
  });
  // Shrubs flanking the path near the house, plus a few along the facade.
  const shrubs: SiteLayout["shrubs"] = [];
  if (entrance && path.length) {
    for (const side of [-1, 1]) {
      const off = entrance.width / 2 + 0.95;
      const across = entrance.line + entrance.out * 0.62;
      const [x, z] = entrance.axis === "x" ? [entrance.along + side * off, across] : [across, entrance.along + side * off];
      const box = { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
      if (!obstacles.slice(footprints.length).some((o) => rectsOverlap(o, box))) shrubs.push({ x, z, r: 0.38, flowers: true });
    }
  }
  const keepClear = obstacles.slice(footprints.length);
  if (entrance) {
    // The porch landing and step (see emitPorch), with a little room around.
    const half = entrance.width / 2 + 0.55;
    const [a, b] = [entrance.line, entrance.line + entrance.out * 1.5].sort((m, n) => m - n);
    keepClear.push(
      entrance.axis === "x"
        ? { x0: entrance.along - half, x1: entrance.along + half, z0: a, z1: b }
        : { x0: a, x1: b, z0: entrance.along - half, z1: entrance.along + half },
    );
  }
  for (const vehicle of frontVehicles(project)) {
    const r = lifeFootprint(vehicle);
    keepClear.push({ x0: r.x / 100, x1: (r.x + r.w) / 100, z0: r.z / 100, z1: (r.z + r.d) / 100 });
  }
  return { parking, path, trees, shrubs, obstacles, keepClear };
}
