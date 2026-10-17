// Per-floor render models with a geometry key. When a floor's key is
// unchanged the previous model object is reused, so React.memo'd FloorViews
// skip rebuilding (selection/hover/labels never rebuild geometry).
import { useRef } from "react";
import { floorForGeometry } from "../../domain/core";
import { exteriorFinish, frontDoorColor, styleDetails, stylePreset, trimColor, DOOR_COLORS, TRIM_COLORS, type ExteriorFinishId } from "../../domain/materials";
import { deriveWalls } from "../../domain/walls";
import type { EdgeSide, GeometryFloor, Project, RailingKind, StylePreset, Void, Wall } from "../../domain/types";
import type { SceneView } from "../types";
import { floorBase } from "../coords";
import { DEFAULT_JAALI, FACADE_LOOKS } from "../materials/palette";
import { findEntrance, type Entrance } from "./geometry/porch";
import { visibility, type Visibility } from "./visibility";

export type FloorStyle = {
  exterior: ExteriorFinishId;
  trim: string;
  frontDoor: string;
  stone: string;
  /** Two-tone accent band (floor lines, parapet coping), or null. */
  band: string | null;
  chhajja: boolean;
  /** Arched stone hoods over exterior windows. */
  arches: boolean;
  railing: RailingKind;
  /** Colour of jaali balcony screens. */
  jaali: string;
  /** The Look: default room paints and floors follow its palettes. */
  look: StylePreset | null;
};

export type FloorModel = {
  key: string;
  floor: GeometryFloor;
  /** Derived walls (with openings), filtered to exterior walls when interiors are hidden. */
  walls: Wall[];
  /** All derived walls (furniture door clearances, guard checks). */
  allWalls: Wall[];
  base: number;
  height: number;
  ground: boolean;
  stage: number;
  interior: boolean;
  interiorWalls: boolean;
  openings: boolean;
  style: FloorStyle;
  road: EdgeSide;
  stairsUp: Void[];
  stairsArrive: { void: Void; height: number }[];
  entrance: Entrance | null;
  aoStrips: boolean;
};

export function projectStyle(project: Project): FloorStyle {
  const exterior = exteriorFinish(project);
  const details = styleDetails(project);
  return {
    exterior,
    trim: TRIM_COLORS[trimColor(project)].color,
    frontDoor: DOOR_COLORS[frontDoorColor(project)].color,
    stone: FACADE_LOOKS[exterior].stone,
    band: FACADE_LOOKS[exterior].band ?? null,
    chhajja: details.chhajja,
    arches: details.arches,
    railing: details.railing,
    jaali: FACADE_LOOKS[exterior].jaali ?? DEFAULT_JAALI,
    look: stylePreset(project),
  };
}

export function buildFloorModels(
  project: Project,
  view: SceneView,
  vis: Visibility,
  aoStrips: boolean,
  previous?: Map<string, FloorModel>,
): FloorModel[] {
  const style = projectStyle(project);
  const road = project.plot.road;
  const stageKey = vis.stage >= 4 ? 4 : vis.stage;
  const entrance = vis.stage >= 4 && view.openings ? findEntrance(project) : null;
  return vis.floors.map((floor) => {
    const geometry = floorForGeometry(project, floor.id);
    const above = project.floors.find((f) => f.elevation === floor.elevation + floor.height);
    const below = project.floors.find((f) => f.elevation + f.height === floor.elevation);
    const stairsUp = above
      ? geometry.voids.filter(
          (v) => v.kind === "stairs" && project.verticalSpaces.some((s) => s.id === v.id && s.floorIds.includes(above.id)),
        )
      : [];
    const stairsArrive = below
      ? geometry.voids
          .filter((v) => v.kind === "stairs" && project.verticalSpaces.some((s) => s.id === v.id && s.floorIds.includes(below.id)))
          .map((v) => ({ void: v, height: below.height / 100 }))
      : [];
    const ground = floor.elevation === Math.min(...project.floors.map((f) => f.elevation));
    const interior = !vis.interiorHidden;
    const floorEntrance = ground && entrance && entrance.floorId === floor.id ? entrance : null;
    const key = JSON.stringify([
      geometry,
      stageKey,
      interior,
      vis.interiorWalls,
      view.openings,
      style,
      road,
      stairsUp,
      stairsArrive,
      floorEntrance,
      aoStrips,
      ground,
    ]);
    const prev = previous?.get(floor.id);
    if (prev && prev.key === key) return prev;
    const allWalls = vis.stage >= 3 ? deriveWalls(geometry, road) : [];
    return {
      key,
      floor: geometry,
      walls: vis.interiorWalls ? allWalls : allWalls.filter((w) => w.exterior),
      allWalls,
      base: floorBase(floor),
      height: floor.height / 100,
      ground,
      stage: stageKey,
      interior,
      interiorWalls: vis.interiorWalls,
      openings: view.openings,
      style,
      road,
      stairsUp,
      stairsArrive,
      entrance: floorEntrance,
      aoStrips,
    };
  });
}

/** Hook wrapper: reuses unchanged FloorModel objects across renders. */
export function useStableFloors(project: Project, view: SceneView, aoStrips: boolean) {
  const cache = useRef(new Map<string, FloorModel>());
  const vis = visibility(project, view);
  const models = buildFloorModels(project, view, vis, aoStrips, cache.current);
  const next = new Map<string, FloorModel>();
  for (const m of models) next.set(m.floor.id, m);
  cache.current = next;
  return { vis, models };
}
