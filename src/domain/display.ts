import type { Room, RoomKind } from "./types";
import { ROOM_META } from "./types";
export type Language = "en";
export type Unit = "ft" | "m";
export const toDisplay = (cm: number, unit: Unit) =>
  cm / (unit === "ft" ? 30.48 : 100);
export const fromDisplay = (value: number, unit: Unit) =>
  Math.round(value * (unit === "ft" ? 30.48 : 100));
export const length = (cm: number, unit: Unit) =>
  Number(toDisplay(cm, unit).toFixed(1)).toLocaleString("en-IN");
export const area = (sqm: number, unit: Unit) =>
  Math.round(sqm * (unit === "ft" ? 10.7639104167 : 1)).toLocaleString("en-IN");
export const unitLabel = (unit: Unit) => (unit === "ft" ? "ft" : "m");
export const areaLabel = (unit: Unit) => (unit === "ft" ? "sq ft" : "m²");
export const roomKindName = (kind: RoomKind) => ROOM_META[kind].label;
export const roomName = (room: Room) => room.name;
export const floorName = (index: number) =>
  index === 0 ? "Ground floor" : `Floor ${index}`;
export const roadName = (road: string) =>
  ({ south: "Front", north: "Back", east: "Right", west: "Left" })[road] ??
  road;
