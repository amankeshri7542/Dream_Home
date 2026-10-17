// Idle animation helpers shared by street life and lived-in details. Idle
// animation runs only while its gate is open (Explore, Photo or Reel; not on
// the battery tier; not with reduced motion) and the page is visible, by
// asking the demand frameloop for frames at a modest rate. Closed, the scene
// renders zero frames.
import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";

/** Idle animation frame rate: smooth enough, and kind to batteries. */
export const IDLE_FPS = 24;

/** document.visibilityState as state. */
export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** While `active`, ask for a frame `fps` times a second. */
export function useIdleTicker(active: boolean, fps = IDLE_FPS) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [active, fps, invalidate]);
}
