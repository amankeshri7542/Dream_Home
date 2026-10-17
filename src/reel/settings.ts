// Reel studio choices, what a job asks for, and how big and carefully to
// film on this device. Small and eager: the filming itself loads lazily.
import type { SceneView } from "../scene/types";
import type { MoodId } from "../photo/settings";

export type ReelStyle = "grand" | "quick";
export type ReelMood = "day" | "golden" | "night" | "diwali";
export type ReelMusic = "morning" | "festive" | "night" | "none";

export const FPS = 30;
/** Vertical field of view: wider than the live view, so a tall frame still fits a room. */
export const REEL_FOV = 40;

export const REEL_STYLES: Record<ReelStyle, { label: string; seconds: number }> = {
  grand: { label: "Grand tour 15 s", seconds: 15 },
  quick: { label: "Quick 8 s", seconds: 8 },
};
export const STYLE_ORDER: ReelStyle[] = ["grand", "quick"];

/** Each mood's light and the photo finish (grade, glow, vignette) it borrows. */
export const REEL_MOODS: Record<ReelMood, { label: string; hour: number; finish: MoodId; festive: boolean }> = {
  day: { label: "Day", hour: 10.5, finish: "morning", festive: false },
  golden: { label: "Golden", hour: 17.25, finish: "golden", festive: false },
  night: { label: "Night", hour: 21.5, finish: "night", festive: false },
  diwali: { label: "Diwali", hour: 21.25, finish: "diwali", festive: true },
};
export const MOOD_ORDER: ReelMood[] = ["day", "golden", "night", "diwali"];

export const REEL_MUSIC: Record<ReelMusic, string> = {
  morning: "Warm morning",
  festive: "Festive",
  night: "Calm night",
  none: "None",
};
export const MUSIC_ORDER: ReelMusic[] = ["morning", "festive", "night", "none"];
/** The music that suits a mood, until someone picks their own. */
export const MOOD_MUSIC: Record<ReelMood, ReelMusic> = { day: "morning", golden: "morning", night: "night", diwali: "festive" };

/** What the live view shows: one shot's view and light (or the studio's preview). */
export type ReelScene = { key: string; view: SceneView; hour: number };

export type ReelSettings = {
  title: string;
  style: ReelStyle;
  mood: ReelMood;
  music: ReelMusic;
  livedIn: boolean;
  /** The home's share link for the end card, or null for the app's own address. */
  link: string | null;
  /** The app's address, for "Design yours at …". */
  appUrl: string;
  /** The Home score and its badges' names, for the end card. */
  score?: { value: number; badges: string[] } | null;
};
export type ReelQuality = {
  width: number;
  height: number;
  /** Jittered samples per frame (clean edges); lowered if filming runs slow. */
  samples: number;
  shadowSize: number;
  aoHalfRes: boolean;
  /** How long filming should take, in seconds; more samples only while it fits. */
  budget: number;
  /** Overrides the style's length (tests make one-second reels). */
  seconds?: number;
};
export type ReelJobRequest = { id: number } & ReelSettings & ReelQuality;
export type ReelOutcome = { id: number } & (
  | { blob: Blob; audio: boolean; seconds: number; ms: number }
  | { error: "cancelled" | "failed" | "unsupported" }
);
export type ReelProgress = { fraction: number; status: string; canvas?: HTMLCanvasElement };

/**
 * End-to-end tests make tiny, short reels through `window.__dreamHomeReelTest`:
 * a size, a length, samples, keeping each shot's middle frame as a JPEG
 * (`capture`), or pretending the browser can't encode video (`noVideo`).
 */
export type ReelTestHook = {
  width?: number;
  height?: number;
  seconds?: number;
  samples?: number;
  capture?: boolean;
  noVideo?: boolean;
};
export const reelTestHook = () => (globalThis as { __dreamHomeReelTest?: ReelTestHook }).__dreamHomeReelTest;

/**
 * Phones film 720 × 1280 with one sample a frame and quarter-cost ambient
 * occlusion; desktops 1080 × 1920 with up to three, kept only while filming
 * stays within its time budget.
 */
export function reelQuality({ phone }: { phone: boolean }): ReelQuality {
  const test = reelTestHook();
  return {
    width: test?.width ?? (phone ? 720 : 1080),
    height: test?.height ?? (phone ? 1280 : 1920),
    samples: test?.samples ?? (phone ? 1 : 3),
    shadowSize: phone ? 2048 : 4096,
    aoHalfRes: phone,
    budget: phone ? 90 : 30,
    seconds: test?.seconds,
  };
}

/** The words that go with the video when it's shared. */
export const reelCaption = (link: string | null) =>
  ["Designed our dream home on Dream Home 🏠", link, "#DreamHome #MyDreamHome"].filter(Boolean).join(" ");

/** A tiny subscribe/emit channel, so filming progress never re-renders the editor. */
export function createFeed<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type Feed<T> = ReturnType<typeof createFeed<T>>;
