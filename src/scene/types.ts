// The contract between the editor shell and the lazy 3D scene.
import type { ReactNode } from "react";
import type { Project, ViewSettings } from "../domain/types";
import type {
  CameraCommand,
  EditorMode,
  ExploreView,
  GhostPreview,
  Insets,
  QualitySetting,
  QualityTier,
  SelectionTarget,
} from "../editor/types";

export type SceneView = ViewSettings & {
  /** Section-cut height in cm when `cutaway` is on (default 120). */
  cutHeight?: number;
  /** First-person walk: show the interior and furniture of this floor under the roof. */
  walkFloorId?: string;
  /**
   * The hero room (dollhouse): neighbours fade and are cut low, its own walls
   * glow at the cut. `soft` keeps neighbours visible (moving or resizing).
   */
  focus?: { floorId: string; roomId: string; soft?: boolean };
};

export type SceneProps = {
  project: Project;
  view: SceneView;
  mode: EditorMode;
  selection: SelectionTarget | null;
  hover?: SelectionTarget | null;
  onSelect: (target: SelectionTarget | null) => void;
  onHover?: (target: SelectionTarget | null) => void;
  /** Ids rendered with a blocked (red) outline, e.g. conflict blockers. */
  highlight?: string[];
  ghost?: GhostPreview | null;
  cameraCommand?: CameraCommand | null;
  /** Chrome covering the canvas; framing keeps the model inside the clear area. */
  insets: Insets;
  /** 0–24 hours; view preference, not project data. */
  hour: number;
  quality: QualitySetting;
  onQualityResolved?: (tier: QualityTier) => void;
  explore?: ExploreView;
  /** Free-standing R3F children rendered inside the Canvas (editor interaction layers). */
  children?: ReactNode;
  /** Fired once the first frame with the model has rendered. */
  onReady?: () => void;
  /** Each new id asks for one high-resolution photo of the current view. */
  photoRequest?: { id: number; scale?: number } | null;
  onPhoto?: (blob: Blob) => void;
  /** Units for room-label areas (default metres). */
  areaUnit?: "m" | "ft";
  /** Fired while walking when the room under the visitor changes. */
  onWalkStatus?: (status: { floorId: string; roomId: string | null }) => void;
};
