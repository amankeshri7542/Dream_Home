// Keyboard behaviour for button-based radio groups (role="radiogroup"), like
// native radios: one Tab stop per group (the chosen option) and arrow keys to
// move and choose. Applied to a whole sheet at once.
import { useLayoutEffect, type KeyboardEvent, type RefObject } from "react";

/** Keeps only the chosen option of each group in the Tab order. Runs after every render. */
export function useRovingRadios(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>("[role='radiogroup']").forEach((group) => {
      const radios = [...group.querySelectorAll<HTMLElement>("[role='radio']")];
      const chosen = radios.find((r) => r.getAttribute("aria-checked") === "true") ?? radios[0];
      radios.forEach((r) => (r.tabIndex = r === chosen ? 0 : -1));
    });
  });
}

const NEXT = new Set(["ArrowRight", "ArrowDown"]);
const PREV = new Set(["ArrowLeft", "ArrowUp"]);
/** Arrow keys on a radio move to (and choose) the next or previous option. */
export function radioKeys(e: KeyboardEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement;
  if (target.getAttribute("role") !== "radio" || !(NEXT.has(e.key) || PREV.has(e.key))) return false;
  const group = target.closest("[role='radiogroup']");
  const radios = [...(group?.querySelectorAll<HTMLElement>("[role='radio']") ?? [])];
  const at = radios.indexOf(target);
  if (at < 0) return false;
  e.preventDefault();
  const next = radios[(at + (NEXT.has(e.key) ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
  return true;
}
