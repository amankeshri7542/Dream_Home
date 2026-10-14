// A pure state machine for one direct-manipulation gesture. It guarantees a
// single commit on release, and never commits after cancellation, a second
// finger, a lost capture, a stale document or a floor/mode change.
export type GestureKind = "move" | "resize" | "slide" | "place";
export type Gesture =
  | { phase: "idle" }
  | {
      phase: "pending" | "dragging";
      pointerId: number;
      start: { x: number; y: number };
      kind: GestureKind;
      revision: number;
    };
export type GestureEvent =
  | {
      t: "down";
      pointerId: number;
      client: { x: number; y: number };
      kind: GestureKind;
      revision: number;
    }
  | { t: "move" | "up"; pointerId: number; client: { x: number; y: number } }
  | { t: "cancel" | "lost"; pointerId: number }
  | { t: "escape" | "second-pointer" | "context-changed" }
  | { t: "revision"; revision: number };
export type GestureEffect = "start" | "preview" | "commit" | "cancel" | "tap";

export const DRAG_THRESHOLD = 5;
export const IDLE: Gesture = { phase: "idle" };

export function stepGesture(
  g: Gesture,
  e: GestureEvent,
): { g: Gesture; effect?: GestureEffect } {
  if (e.t === "down") {
    if (g.phase !== "idle") return { g: IDLE, effect: "cancel" };
    return {
      g: {
        phase: "pending",
        pointerId: e.pointerId,
        start: e.client,
        kind: e.kind,
        revision: e.revision,
      },
      effect: "start",
    };
  }
  if (g.phase === "idle") return { g };
  if (e.t === "move") {
    if (e.pointerId !== g.pointerId) return { g };
    if (g.phase === "pending") {
      const dx = e.client.x - g.start.x,
        dy = e.client.y - g.start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return { g };
      return { g: { ...g, phase: "dragging" }, effect: "preview" };
    }
    return { g, effect: "preview" };
  }
  if (e.t === "up") {
    if (e.pointerId !== g.pointerId) return { g };
    return { g: IDLE, effect: g.phase === "dragging" ? "commit" : "tap" };
  }
  if (e.t === "cancel" || e.t === "lost") {
    if (e.pointerId !== g.pointerId) return { g };
    return { g: IDLE, effect: "cancel" };
  }
  if (e.t === "revision") {
    if (e.revision === g.revision) return { g };
    return { g: IDLE, effect: "cancel" };
  }
  // escape, second pointer, floor/mode/selection change
  return { g: IDLE, effect: "cancel" };
}
