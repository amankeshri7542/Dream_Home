// Photo studio choices: moods (time of day and finish), shapes and framing,
// and how big and how carefully to render on this device.
import type { PhotoMood } from "./render";

export type MoodId = "morning" | "noon" | "golden" | "night" | "diwali";
export type ShapeId = "story" | "square" | "post" | "wide";
export type Framing = "view" | "room" | "front" | "aerial";

export const MOODS: Record<MoodId, { label: string; hour: number; finish: Omit<PhotoMood, "exposure"> }> = {
  morning: { label: "Morning", hour: 8.5, finish: { warmth: 0.03, bloom: 0.12, vignette: 0.18 } },
  noon: { label: "Noon", hour: 12.5, finish: { warmth: 0.015, bloom: 0.1, vignette: 0.16 } },
  golden: { label: "Golden hour", hour: 17.25, finish: { warmth: 0.06, bloom: 0.18, vignette: 0.22 } },
  night: { label: "Night", hour: 21.5, finish: { warmth: 0.02, bloom: 0.55, vignette: 0.28 } },
  // Warmer and glowier; Diwali props (diyas, string lights) arrive with lived-in details.
  diwali: { label: "Diwali night", hour: 21.25, finish: { warmth: 0.09, bloom: 0.75, vignette: 0.3 } },
};
export const MOOD_ORDER: MoodId[] = ["morning", "noon", "golden", "night", "diwali"];

/** Width ÷ height. */
export const SHAPES: Record<ShapeId, { label: string; aspect: number }> = {
  story: { label: "Story 9:16", aspect: 9 / 16 },
  square: { label: "Square", aspect: 1 },
  post: { label: "Post 4:5", aspect: 4 / 5 },
  wide: { label: "Wide 16:9", aspect: 16 / 9 },
};
export const SHAPE_ORDER: ShapeId[] = ["story", "square", "post", "wide"];

export const FRAMINGS: Record<Framing, string> = {
  view: "This view",
  room: "Room",
  front: "Front",
  aerial: "Aerial",
};

/** A photo's pixel size: the long edge given, the other from the aspect, both even. */
export function photoSize(aspect: number, longEdge: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1
    ? { width: even(longEdge), height: even(longEdge / aspect) }
    : { width: even(longEdge * aspect), height: even(longEdge) };
}

/**
 * End-to-end tests make tiny, quick photos (and can force the careful render
 * to fail, to check the quick fallback) through `window.__dreamHomePhotoTest`.
 */
export const photoTestHook = () =>
  (globalThis as { __dreamHomePhotoTest?: { longEdge?: number; samples?: number; fail?: boolean } }).__dreamHomePhotoTest;

/**
 * How big and how many samples on this device: phones get a smaller, quicker
 * photo (and less GPU memory); desktops a large, careful one. Never more than
 * the GPU's texture limit.
 */
export function photoQuality({ phone, maxTexture }: { phone: boolean; maxTexture: number }) {
  const test = photoTestHook();
  const longEdge = Math.min(test?.longEdge ?? (phone ? 1600 : 2560), maxTexture);
  const samples = test?.samples ?? (phone ? 16 : 40);
  return { longEdge, samples, shadowSize: phone ? 2048 : 4096 };
}
