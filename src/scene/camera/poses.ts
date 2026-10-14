// Camera poses and fit subjects (pure).
import { balconyBounds } from "../../domain/core";
import { effectiveRoof } from "../../domain/materials";
import type { EdgeSide, Project } from "../../domain/types";
import type { SceneView } from "../types";
import { FLOOR_SURFACE, PLINTH_BOTTOM, floorBase } from "../coords";
import { visibility } from "../building/visibility";
import { roofRise } from "../building/geometry/roof";
import type { Vec3 } from "./fit";

const DEG = Math.PI / 180;
export type Pose = { azimuth: number; polar: number };

/** Azimuth that puts the camera on the road side looking across the plot. */
export const ROAD_AZIMUTH: Record<EdgeSide, number> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: -Math.PI / 2,
};
export const HERO_POLAR = 57 * DEG;
export const FRONT_POLAR = 80 * DEG;
export const FOCUS_POLAR = 50 * DEG;
export const TOP_POLAR = 0.0001;
export const HERO_OFFSET = 35 * DEG;

/**
 * Hero: on the road side, swung 35° clockwise on the compass (road south →
 * camera south-south-west looking north-north-east). camera-controls azimuth
 * grows toward +x (east), i.e. counter-clockwise, hence the minus sign. This
 * keeps the morning sun (SSE) to the front-left so shadows read clearly.
 */
export const heroPose = (road: EdgeSide): Pose => ({ azimuth: ROAD_AZIMUTH[road] - HERO_OFFSET, polar: HERO_POLAR });
/** Top view: azimuth 0 so screen-up is −z (plan north), like the 2D plan. */
export const topPose = (): Pose => ({ azimuth: 0, polar: TOP_POLAR });
export const frontPose = (road: EdgeSide): Pose => ({ azimuth: ROAD_AZIMUTH[road], polar: FRONT_POLAR });

export type Box = { min: Vec3; max: Vec3 };
const offsetBox = (project: Project, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => {
  const ox = -project.plot.width / 200,
    oz = -project.plot.depth / 200;
  return { min: [x0 + ox, y0, z0 + oz], max: [x1 + ox, y1, z1 + oz] };
};

/** Visible building (footprints + balconies), up to the cut or the roof. */
export function homeBox(project: Project, view: SceneView, floorId?: string): Box {
  const vis = visibility(project, floorId ? { ...view, floor: floorId } : view);
  const floors = vis.floors;
  if (!floors.length) return plotBox(project);
  const rects = floors.flatMap((f) => [f.footprint, ...f.balconies.map((b) => balconyBounds(f, b))]);
  // A little breathing room for the porch, eaves and planting around the walls.
  const pad = 0.75;
  const x0 = Math.min(...rects.map((r) => r.x)) / 100 - pad,
    x1 = Math.max(...rects.map((r) => r.x + r.w)) / 100 + pad,
    z0 = Math.min(...rects.map((r) => r.z)) / 100 - pad,
    z1 = Math.max(...rects.map((r) => r.z + r.d)) / 100 + pad;
  const bottom = floors[0].elevation === 0 ? 0 : floorBase(floors[0]) - 0.2;
  const top = vis.top!;
  let y1: number;
  if (vis.stage < 3) y1 = floorBase(top) + 0.4;
  else if (vis.cutActive) y1 = vis.cutY + 0.25;
  else {
    y1 = floorBase(top) + top.height / 100;
    if (vis.roofVisible) {
      const roof = effectiveRoof(project);
      y1 += roofRise(top.footprint, roof.style, roof.pitch, project.plot.road);
    }
  }
  return offsetBox(project, x0, x1, bottom, y1, z0, z1);
}

/** The whole diorama plot including the road band. */
export function plotBox(project: Project, view?: SceneView): Box {
  const w = project.plot.width / 100,
    d = project.plot.depth / 100;
  const road = project.plot.road;
  const pad = 0.6,
    roadBand = 4.4;
  const x0 = -(road === "west" ? roadBand : pad),
    x1 = w + (road === "east" ? roadBand : pad),
    z0 = -(road === "north" ? roadBand : pad),
    z1 = d + (road === "south" ? roadBand : pad);
  const home = view ? homeBox(project, view) : null;
  const top = Math.max(2.5, home ? home.max[1] : 3);
  return offsetBox(project, x0, x1, PLINTH_BOTTOM * 0.5, top, z0, z1);
}

export function floorBox(project: Project, view: SceneView, floorId: string): Box {
  return homeBox(project, view, floorId);
}

export function roomBox(project: Project, view: SceneView, floorId: string, roomId: string): Box | null {
  const floor = project.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find((r) => r.id === roomId);
  if (!floor || !room) return null;
  const base = floorBase(floor);
  const vis = visibility(project, view);
  const cut = vis.cutActive && vis.top?.id === floorId ? (view.cutHeight ?? 120) / 100 : floor.height / 100;
  const r = room.bounds;
  return offsetBox(
    project,
    r.x / 100 - 0.2,
    (r.x + r.w) / 100 + 0.2,
    base,
    base + FLOOR_SURFACE + Math.min(cut, 1.4),
    r.z / 100 - 0.2,
    (r.z + r.d) / 100 + 0.2,
  );
}

/** Bounding sphere radius of a box (for distance limits). */
export const boxRadius = (b: Box) =>
  Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
