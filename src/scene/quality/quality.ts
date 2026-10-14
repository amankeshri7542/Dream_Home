// Quality tiers: pure tier table, detection heuristics and override parsing.
import type { QualitySetting, QualityTier } from "../../editor/types";

export type PostMode = "none" | "balanced" | "beautiful";
export type TierSpec = {
  tier: QualityTier;
  dprMax: number;
  shadowMapSize: number;
  /** Shadow map size used on coarse-pointer (phone/tablet) devices. */
  shadowMapSizeMobile: number;
  envSize: number;
  post: PostMode;
  /** Fake-AO strip opacity multiplier at wall bases (0 = off). */
  aoStrips: number;
  textureSize: number;
  anisotropy: number;
};

export const TIERS: Record<QualityTier, TierSpec> = {
  battery: {
    tier: "battery",
    dprMax: 1.25,
    shadowMapSize: 1024,
    shadowMapSizeMobile: 1024,
    envSize: 64,
    post: "none",
    aoStrips: 1,
    textureSize: 256,
    anisotropy: 2,
  },
  balanced: {
    tier: "balanced",
    dprMax: 1.5,
    shadowMapSize: 2048,
    shadowMapSizeMobile: 2048,
    envSize: 128,
    post: "balanced",
    aoStrips: 0.5,
    textureSize: 256,
    anisotropy: 4,
  },
  beautiful: {
    tier: "beautiful",
    dprMax: 2,
    shadowMapSize: 4096,
    shadowMapSizeMobile: 2048,
    envSize: 128,
    post: "beautiful",
    aoStrips: 0,
    textureSize: 512,
    anisotropy: 8,
  },
};

export const TIER_ORDER: readonly QualityTier[] = ["battery", "balanced", "beautiful"];
export const QUALITY_STORAGE_KEY = "dream-home.quality.v1";
/** Median frame time (ms) above which the auto tier steps down once. */
export const SLOW_FRAME_MS = 28;
export const MEASURE_FRAMES = 40;

export const isTier = (v: unknown): v is QualityTier =>
  v === "battery" || v === "balanced" || v === "beautiful";

export function stepDown(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, i - 1)];
}

/** `?quality=battery|balanced|beautiful` → tier, otherwise null. */
export function parseQualityParam(search: string): QualityTier | null {
  try {
    const value = new URLSearchParams(search).get("quality");
    return isTier(value) ? value : null;
  } catch {
    return null;
  }
}

export type DeviceInfo = {
  /** Unmasked GPU renderer string (WEBGL_debug_renderer_info), if known. */
  renderer?: string | null;
  coarsePointer?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const WEAK_GPU =
  /mali-[45]\d\d|mali-t[67]|adreno \(tm\) [2-5]\d\d|powervr sgx|powervr rogue g6|intel\(r\) hd graphics( [2-5]\d{3})?$|gma |videocore/i;

export const isSoftwareRenderer = (renderer?: string | null) =>
  !!renderer && SOFTWARE.test(renderer);

/** Pure device heuristic: software/weak GPU → battery, phones/low memory → balanced. */
export function detectTier(info: DeviceInfo): QualityTier {
  const renderer = info.renderer ?? "";
  if (SOFTWARE.test(renderer) || WEAK_GPU.test(renderer)) return "battery";
  if (
    info.coarsePointer ||
    (info.deviceMemory !== undefined && info.deviceMemory <= 4) ||
    (info.hardwareConcurrency !== undefined && info.hardwareConcurrency <= 4)
  )
    return "balanced";
  return "beautiful";
}

export type TierSource = "prop" | "url" | "stored" | "detected";
/**
 * Precedence: explicit prop tier > `?quality=` > previously measured auto tier
 * > device detection. Only the last two may be stepped down by measurement.
 */
export function resolveTier(input: {
  setting: QualitySetting;
  search: string;
  stored: QualityTier | null;
  detected: QualityTier;
}): { tier: QualityTier; source: TierSource } {
  if (input.setting !== "auto") return { tier: input.setting, source: "prop" };
  const url = parseQualityParam(input.search);
  if (url) return { tier: url, source: "url" };
  if (input.stored) return { tier: input.stored, source: "stored" };
  return { tier: input.detected, source: "detected" };
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Step down one tier when the measured median frame time is too slow. */
export function measuredTier(tier: QualityTier, frameTimesMs: readonly number[]): QualityTier {
  return median(frameTimesMs) > SLOW_FRAME_MS ? stepDown(tier) : tier;
}

export function readStoredTier(): QualityTier | null {
  try {
    const raw = globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "tier" in parsed) {
      const tier = (parsed as { tier: unknown }).tier;
      return isTier(tier) ? tier : null;
    }
    return null;
  } catch {
    return null;
  }
}
export function storeTier(tier: QualityTier) {
  try {
    globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, JSON.stringify({ tier }));
  } catch {
    /* storage unavailable */
  }
}

/** Effective DPR range for a tier and device pixel ratio. */
export function tierDpr(spec: TierSpec, devicePixelRatio: number): [number, number] {
  const max = Math.min(spec.dprMax, Math.max(1, devicePixelRatio));
  return [1, max];
}
