import { useEffect, useState, useSyncExternalStore } from "react";
import type { Insets } from "./types";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
export const DESKTOP_QUERY = "(min-width: 1050px)";
export const useDesktop = () => useMediaQuery(DESKTOP_QUERY);
export const useReducedMotion = () =>
  useMediaQuery("(prefers-reduced-motion: reduce)");

/**
 * Measures chrome covering the canvas (elements marked `data-inset`) and
 * publishes the clear region, so the camera frames the home where it is visible.
 * The canvas itself never resizes when panels open.
 */
export function useChromeInsets(root: HTMLElement | null): Insets {
  const [insets, setInsets] = useState<Insets>({
    top: 56,
    right: 0,
    bottom: 140,
    left: 0,
  });
  useEffect(() => {
    if (!root) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = window.innerWidth,
          h = window.innerHeight;
        const next: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
        root.querySelectorAll<HTMLElement>("[data-inset]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          let side = el.dataset.inset as keyof Insets | "auto";
          // "auto": wide surfaces cover the top or bottom, narrow ones a side.
          if (side === "auto")
            side =
              r.width > w * 0.6
                ? r.top + r.height / 2 > h / 2
                  ? "bottom"
                  : "top"
                : r.left + r.width / 2 < w / 2
                  ? "left"
                  : "right";
          if (side === "top") next.top = Math.max(next.top, r.bottom);
          if (side === "bottom") next.bottom = Math.max(next.bottom, h - r.top);
          if (side === "left") next.left = Math.max(next.left, r.right);
          if (side === "right") next.right = Math.max(next.right, w - r.left);
        });
        root.style.setProperty("--dh-inset-top", `${next.top}px`);
        root.style.setProperty("--dh-inset-bottom", `${next.bottom}px`);
        root.style.setProperty("--dh-inset-left", `${next.left}px`);
        root.style.setProperty("--dh-inset-right", `${next.right}px`);
        setInsets((prev) =>
          Math.abs(prev.top - next.top) < 2 &&
          Math.abs(prev.bottom - next.bottom) < 2 &&
          Math.abs(prev.left - next.left) < 2 &&
          Math.abs(prev.right - next.right) < 2
            ? prev
            : next,
        );
      });
    };
    const observer = new ResizeObserver(measure);
    const watch = () => {
      observer.disconnect();
      observer.observe(root);
      root
        .querySelectorAll<HTMLElement>("[data-inset]")
        .forEach((el) => observer.observe(el));
      measure();
    };
    watch();
    // Chrome surfaces are direct children of the root; only their arrival,
    // departure or snap changes need re-observing.
    const children = new MutationObserver(watch);
    children.observe(root, { childList: true });
    const attributes = new MutationObserver(measure);
    attributes.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-inset", "data-snap"],
    });
    window.addEventListener("resize", measure);
    // Surfaces that rise into place settle after their entrance animation.
    root.addEventListener("animationend", measure);
    return () => {
      root.removeEventListener("animationend", measure);
      cancelAnimationFrame(frame);
      observer.disconnect();
      children.disconnect();
      attributes.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [root]);
  return insets;
}
