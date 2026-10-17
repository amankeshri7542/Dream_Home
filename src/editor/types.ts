// Shared editor/scene contract. Transient UI state only — never serialised.
import type { Rect } from "../domain/types";

export type EditorMode = "build" | "openings" | "decorate" | "outside" | "explore";
export const EDIT_MODES: readonly EditorMode[] = [
  "build",
  "openings",
  "decorate",
  "outside",
  "explore",
];

/** What the user has selected. Ids may be `auto:` keys for automatic items. */
export type SelectionTarget =
  | { kind: "room"; floorId: string; id: string }
  | { kind: "balcony"; floorId: string; id: string }
  | { kind: "vertical"; floorId: string; id: string }
  | { kind: "opening"; floorId: string; id: string }
  | { kind: "furniture"; floorId: string; roomId: string; id: string }
  | { kind: "landscape"; id: string }
  | { kind: "staged"; id: string };
export type SelectionKind = SelectionTarget["kind"];
export const sameTarget = (
  a: SelectionTarget | null | undefined,
  b: SelectionTarget | null | undefined,
) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/** Which kinds each mode lets the user pick on the canvas. */
export const PICKABLE: Record<EditorMode, readonly SelectionKind[]> = {
  build: ["room", "balcony", "vertical"],
  openings: ["opening", "room"],
  decorate: ["furniture", "room"],
  outside: ["landscape"],
  explore: [],
};

export type QualityTier = "battery" | "balanced" | "beautiful";
export type QualitySetting = QualityTier | "auto";
export type ExploreView = "orbit" | "walk" | "showcase";

/** Screen-space chrome covering the canvas edges, in CSS px. */
export type Insets = { top: number; right: number; bottom: number; left: number };

export type CameraSubject = "home" | "plot" | "floor" | "room";
export type CameraCommand = { id: number } & (
  | {
      type: "fit";
      subject: CameraSubject;
      floorId?: string;
      roomId?: string;
      /** "room": the dollhouse hero pose; "return": back to where the home was seen from. */
      view?: "hero" | "top" | "front" | "keep" | "room" | "return";
      instant?: boolean;
    }
  | { type: "dolly"; factor: number }
  | { type: "orbit"; azimuthDeg: number; polarDeg?: number }
  | { type: "reset" }
);

/** A transient preview drawn by the scene during a gesture (never persisted). */
export type GhostPreview = {
  floorId: string | null;
  bounds: Rect;
  status: "valid" | "snap" | "blocked";
  label: string;
  /** Plot-cm alignment guides. */
  guides: { axis: "x" | "z"; value: number; from: number; to: number }[];
  /** Ids of components blocking the preview (outlined in red). */
  blockers: string[];
};
