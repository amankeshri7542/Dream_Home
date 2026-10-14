// Keyboard camera control on the canvas wrapper: ←/→ orbit ±15°, ↑/↓ tilt
// ∓8°, +/− dolly, F fit home, T top view. Ignored while typing in a field.
import { useEffect, type RefObject } from "react";
import type { CameraApi } from "./api";

export const CAMERA_KEYBOARD_LABEL =
  "3D view of your home. Arrow keys orbit, plus and minus zoom, F fits the home, T top view";

export function useCameraKeyboard(target: RefObject<HTMLElement | null>, api: RefObject<CameraApi | null>) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const cam = api.current;
      if (!cam) return;
      let handled = true;
      switch (event.key) {
        case "ArrowLeft":
          cam.orbit(-15, 0);
          break;
        case "ArrowRight":
          cam.orbit(15, 0);
          break;
        case "ArrowUp":
          cam.orbit(0, -8);
          break;
        case "ArrowDown":
          cam.orbit(0, 8);
          break;
        case "+":
        case "=":
          cam.dolly(0.8);
          break;
        case "-":
        case "_":
          cam.dolly(1.25);
          break;
        case "f":
        case "F":
          cam.fit({ subject: "home", view: "keep" }, true);
          break;
        case "t":
        case "T":
          cam.fit({ subject: "home", view: "top" }, true);
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [target, api]);
}
