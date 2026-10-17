import type { CameraSubject } from "../../editor/types";

export type FitIntent = {
  subject: CameraSubject;
  floorId?: string;
  roomId?: string;
  /** Undefined: keep angles for home/plot, focus pose (polar 50°) for floor/room. */
  view?: "hero" | "top" | "front" | "keep" | "room" | "return";
};

/** Imperative camera surface used by keyboard, commands and the debug bridge. */
export type CameraApi = {
  fit(intent: FitIntent, animate: boolean): void;
  dolly(factor: number): void;
  orbit(azimuthDeg: number, polarDeg: number): void;
  /** True while a programmatic or user camera motion is still settling. */
  moving(): boolean;
};
