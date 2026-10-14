// Resolve the quality tier before the Canvas mounts (DPR, shadows, textures),
// then allow one measured step-down during the intro glide.
import { useCallback, useEffect, useRef, useState } from "react";
import type { QualitySetting, QualityTier } from "../../editor/types";
import { detectTier, measuredTier, readStoredTier, resolveTier, storeTier, type TierSource } from "./quality";

export type WebGLProbe = { ok: boolean; renderer: string | null };

/** WebGL2 support + unmasked GPU renderer string (context released after). */
export function probeWebGL(): WebGLProbe {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return { ok: false, renderer: null };
    let renderer: string | null = null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: null };
  }
}

function deviceInfo(renderer: string | null) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
    coarse = false;
  }
  return { renderer, coarsePointer: coarse, deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency };
}

export function useQualityTier(setting: QualitySetting, renderer: string | null, onResolved?: (tier: QualityTier) => void) {
  const [state, setState] = useState<{ tier: QualityTier; source: TierSource }>(() =>
    resolveTier({
      setting,
      search: typeof location !== "undefined" ? location.search : "",
      stored: readStoredTier(),
      detected: detectTier(deviceInfo(renderer)),
    }),
  );
  // Re-resolve when the explicit setting changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState(
      resolveTier({
        setting,
        search: location.search,
        stored: readStoredTier(),
        detected: detectTier(deviceInfo(renderer)),
      }),
    );
  }, [setting, renderer]);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  useEffect(() => {
    onResolvedRef.current?.(state.tier);
  }, [state.tier]);
  /** Report intro-glide frame times; only auto-detected tiers adapt. */
  const reportFrames = useCallback(
    (frameTimes: number[]) => {
      if (state.source !== "detected") return;
      const next = measuredTier(state.tier, frameTimes);
      storeTier(next);
      if (next !== state.tier) setState({ tier: next, source: "stored" });
      else setState((s) => ({ ...s, source: "stored" }));
    },
    [state],
  );
  return { tier: state.tier, source: state.source, reportFrames };
}
