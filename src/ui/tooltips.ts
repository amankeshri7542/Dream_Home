// Quick tooltips for icon-only buttons (`data-tip`, set by IconButton): the
// button's name after a short pause under a mouse, or at once on keyboard
// focus. One element for the whole page, placed by hand inside the screen,
// so nothing re-renders. Touch screens never see it.
import { useEffect } from "react";

const DELAY_MS = 350;

export function useTooltips() {
  useEffect(() => {
    const mouse = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    const tip = document.createElement("div");
    tip.className = "dh-tooltip";
    tip.setAttribute("aria-hidden", "true");
    document.body.append(tip);
    let timer = 0;
    let current: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      tip.classList.remove("is-shown");
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || !el.isConnected) return hide();
      tip.textContent = text;
      tip.classList.add("is-shown");
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth,
        h = tip.offsetHeight;
      // Below the button, or above it near the bottom; never off the screen.
      const top = r.bottom + 8 + h <= window.innerHeight - 4 ? r.bottom + 8 : r.top - 8 - h;
      const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const tipped = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !mouse?.matches) return;
      const el = tipped(e);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      timer = window.setTimeout(() => show(el), DELAY_MS);
    };
    const focus = (e: FocusEvent) => {
      const el = tipped(e);
      hide();
      if (el?.matches(":focus-visible")) {
        current = el;
        show(el);
      }
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", hide, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", hide, true);
      tip.remove();
    };
  }, []);
}
