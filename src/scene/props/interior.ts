// What the interior props need to know about the scene beyond one floor: the
// project's Look (room palettes), the quality tier, whether we are exploring,
// which floor's furniture is showing, and whether idle motion (fans, curtains)
// runs: with lived-in details on (or Diwali), gated like street life.
// Provided once by SceneRoot.
import { createContext, useContext } from "react";
import type { QualityTier } from "../../editor/types";
import type { Project } from "../../domain/types";

export type InteriorScene = {
  project: Project | null;
  tier: QualityTier;
  /** Explore mode (walking or the showcase turntable). */
  explore: boolean;
  /** The floor whose furniture is shown, or null. */
  furnishedFloorId: string | null;
  /** Fans turn and curtains sway: lived-in details or Diwali on, gated like street life. */
  motion: boolean;
};
export const InteriorContext = createContext<InteriorScene>({
  project: null,
  tier: "balanced",
  explore: false,
  furnishedFloorId: null,
  motion: false,
});
export const useInterior = () => useContext(InteriorContext);
