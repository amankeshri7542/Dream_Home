export type Rect = { x: number; z: number; w: number; d: number };
export type RoomKind =
  "living" | "kitchen" | "bedroom" | "bathroom" | "dining" | "utility";
export type Room = { id: string; name: string; kind: RoomKind; bounds: Rect };
export type Void = { id: string; kind: "courtyard" | "stairs"; bounds: Rect };
export type Floor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  footprint: Rect;
  rooms: Room[];
  voids: Void[];
  balcony: boolean;
};
export type Project = {
  schemaVersion: 1;
  name: string;
  plot: {
    width: number;
    depth: number;
    north: number;
    road: "south" | "north" | "east" | "west";
    setback: number;
  };
  floors: Floor[];
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
  roof: boolean;
  resetKey: number;
};
export const ROOM_META: Record<RoomKind, { label: string; color: string }> = {
  living: { label: "Living room", color: "#d9b493" },
  kitchen: { label: "Kitchen", color: "#9ab8aa" },
  bedroom: { label: "Bedroom", color: "#a8b9cc" },
  bathroom: { label: "Bathroom", color: "#b5cad0" },
  dining: { label: "Dining", color: "#d5c49d" },
  utility: { label: "Utility", color: "#c8bdcb" },
};
export const STAGES = ["Plot", "Foundation", "Frame", "Walls", "Slabs", "Roof"];
