// Pure view → visibility rules (construction stages, isolation, cutaway, roof).
// Reproduces the semantics of the v1 renderer:
//   stage 0 plot only · 1 foundation · 2 frame · 3 walls · 4 slabs/interior · 5 roof
import type { Floor, Project } from "../../domain/types";
import type { SceneView } from "../types";
import { FLOOR_SURFACE, floorBase } from "../coords";

export type Visibility = {
  /** Visible floors sorted by elevation. */
  floors: Floor[];
  top: Floor | null;
  topHasAbove: boolean;
  stage: number;
  roofVisible: boolean;
  cutActive: boolean;
  /** World y of the section cut (only meaningful while cutActive). */
  cutY: number;
  /** Roof covers everything: skip interiors entirely (performance). */
  interiorHidden: boolean;
  interiorWalls: boolean;
  /** Floor whose furniture is shown (top visible floor) or null. */
  furnishedFloorId: string | null;
  labelsFloorId: string | null;
};

export const hasFloorAbove = (project: Project, floor: Floor) =>
  project.floors.some((other) => other.elevation === floor.elevation + floor.height);

export function visibility(project: Project, view: SceneView): Visibility {
  const floors = project.floors
    .filter((f) => view.floor === "all" || f.id === view.floor)
    .sort((a, b) => a.elevation - b.elevation);
  const list = floors.length ? floors : [...project.floors].sort((a, b) => a.elevation - b.elevation);
  const top = list.length ? list[list.length - 1] : null;
  const topHasAbove = top ? hasFloorAbove(project, top) : false;
  const stage = Math.max(0, Math.min(5, Math.round(view.stage)));
  const roofVisible = !!top && view.roof && stage >= 5 && !topHasAbove;
  const cutActive = !!top && view.cutaway && !roofVisible && stage >= 3;
  const cutY = top
    ? floorBase(top) + FLOOR_SURFACE + (view.cutHeight ?? 120) / 100
    : 1e6;
  const walkFloor = view.walkFloorId ? list.find((f) => f.id === view.walkFloorId) ?? null : null;
  const interiorHidden = roofVisible && view.floor === "all" && !walkFloor;
  const interiorVisible = stage >= 4 && !interiorHidden;
  if (walkFloor)
    return {
      floors: list,
      top,
      topHasAbove,
      stage,
      roofVisible,
      cutActive: false,
      cutY: 1e6,
      interiorHidden,
      interiorWalls: true,
      furnishedFloorId: interiorVisible && view.furnishings !== false ? walkFloor.id : null,
      labelsFloorId: null,
    };
  return {
    floors: list,
    top,
    topHasAbove,
    stage,
    roofVisible,
    cutActive,
    cutY,
    interiorHidden,
    interiorWalls: view.walls && !interiorHidden,
    furnishedFloorId:
      interiorVisible && top && view.furnishings !== false && !roofVisible ? top.id : null,
    labelsFloorId: interiorVisible && top && view.labels ? top.id : null,
  };
}
