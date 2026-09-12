export type Rect = { x: number; z: number; w: number; d: number };
export type EdgeSide = "north" | "south" | "east" | "west";
export type RoomKind =
  "living" | "kitchen" | "bedroom" | "bathroom" | "dining" | "utility" | "shop";
export type Room = {
  id: string;
  name: string;
  kind: RoomKind;
  bounds: Rect;
  unitId: string | null;
  furnishingRotation?: 0 | 90 | 180 | 270;
  floorFinish?: "auto" | "wood" | "tile" | "stone";
  furnishing?: "auto" | "none";
};
export type StagedRoom = { room: Room; sourceFloorId: string };
export type Void = { id: string; kind: "courtyard" | "stairs"; bounds: Rect };
export type Balcony = {
  id: string;
  edge: EdgeSide;
  offset: number;
  width: number;
  depth: number;
};
export type Unit = {
  id: string;
  name: string;
  use: "residential" | "commercial";
};
export type UnitArea = { unitId: string; bounds: Rect };
export type VerticalSpace = Void & {
  floorIds: string[];
  unitId: string | null;
};
export type Floor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  footprint: Rect;
  rooms: Room[];
  balconies: Balcony[];
  unitAreas: UnitArea[];
};
export type GeometryFloor = Floor & { voids: Void[] };
export type Project = {
  schemaVersion: 2;
  name: string;
  plot: {
    width: number;
    depth: number;
    north: number;
    road: EdgeSide;
    setback: number;
  };
  floors: Floor[];
  units: Unit[];
  verticalSpaces: VerticalSpace[];
  stagedRooms?: StagedRoom[];
  garden: boolean;
  parking: boolean;
  finish?: "ivory" | "brick" | "sand";
};
export type Wall = {
  id: string;
  axis: "x" | "z";
  x: number;
  z: number;
  length: number;
  exterior: boolean;
  opening?: {
    kind: "door" | "window";
    width: number;
    sill: number;
    height: number;
  };
};
export type EditResult =
  { ok: true; project: Project } | { ok: false; error: string };
export type PresetId = "courtyard" | "compact" | "family";
export type ViewSettings = {
  floor: string | "all";
  stage: number;
  cutaway: boolean;
  walls: boolean;
  openings: boolean;
  landscape: boolean;
  labels: boolean;
  furnishings?: boolean;
  roof: boolean;
  resetKey: number;
};
export const ROOM_META: Record<RoomKind, { label: string; color: string }> = {
  shop: { label: "Shop", color: "#c7b5cb" },
  living: { label: "Living room", color: "#d9b493" },
  kitchen: { label: "Kitchen", color: "#9ab8aa" },
  bedroom: { label: "Bedroom", color: "#a8b9cc" },
  bathroom: { label: "Bathroom", color: "#b5cad0" },
  dining: { label: "Dining", color: "#d5c49d" },
  utility: { label: "Utility", color: "#c8bdcb" },
};
export const STAGES = ["Plot", "Foundation", "Frame", "Walls", "Slabs", "Roof"];
