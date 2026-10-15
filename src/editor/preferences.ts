// Per-device preferences in `dream-home.preferences.v1`. Writes merge so newer
// keys never erase older ones, and unknown values fall back safely.
import type { Unit } from "../domain/display";
import type { QualitySetting } from "./types";

export const PREFERENCES_KEY = "dream-home.preferences.v1";
export const SESSION_KEY = "dream-home.session.v1";
export type Preferences = {
  language: "en";
  unit: Unit;
  tourSeen: boolean;
  quality: QualitySetting;
  singleKeyShortcuts: boolean;
  checklist: "show" | "hide";
  /** People and traffic on the road in Explore. */
  streetLife: boolean;
};
const QUALITIES: QualitySetting[] = ["auto", "battery", "balanced", "beautiful"];

export function normalizePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    // Earlier releases offered Hindi; the interface is English-only now.
    language: "en",
    unit: p.unit === "m" ? "m" : "ft",
    tourSeen: p.tourSeen === true,
    quality: QUALITIES.includes(p.quality as QualitySetting)
      ? (p.quality as QualitySetting)
      : "auto",
    singleKeyShortcuts: p.singleKeyShortcuts !== false,
    checklist: p.checklist === "hide" ? "hide" : "show",
    streetLife: p.streetLife !== false,
  };
}
function readRaw(storage: Storage | undefined, key: string): unknown {
  try {
    return JSON.parse(storage?.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}
export function loadPreferences(
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  return normalizePreferences(readRaw(storage, PREFERENCES_KEY));
}
export function savePreferences(
  patch: Partial<Preferences>,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    const current = readRaw(storage, PREFERENCES_KEY) as Record<string, unknown>;
    storage?.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ ...current, ...patch, language: "en" }),
    );
  } catch {
    /* Editing and export remain available when device storage is blocked. */
  }
}
export type Session = { titleDismissed: boolean };
export function loadSession(
  storage: Storage | undefined = globalThis.sessionStorage,
): Session {
  const raw = readRaw(storage, SESSION_KEY) as Record<string, unknown>;
  return { titleDismissed: raw.titleDismissed === true };
}
export function saveSession(
  patch: Partial<Session>,
  storage: Storage | undefined = globalThis.sessionStorage,
): void {
  try {
    const current = readRaw(storage, SESSION_KEY) as Record<string, unknown>;
    storage?.setItem(SESSION_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* A blocked session store only means the title screen may show again. */
  }
}
