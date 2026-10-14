import { useEffect, useRef } from "react";

/**
 * Makes the phone/browser Back button step out of the top layer (sheet, plan,
 * dialog, gallery) instead of leaving the app. While any layer is open we keep
 * one extra history entry; Back consumes it and we close a layer.
 */
export function useBackButton(open: boolean, onBack: () => void) {
  const armed = useRef(false);
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (open && !armed.current) {
      history.pushState({ dreamHomeLayer: true }, "");
      armed.current = true;
    }
  }, [open]);
  useEffect(() => {
    const pop = () => {
      if (!armed.current) return;
      armed.current = false;
      latest.current();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  // Re-arm after a Back that left other layers open.
  useEffect(() => {
    if (!open || armed.current) return;
    const timer = window.setTimeout(() => {
      if (!armed.current) {
        history.pushState({ dreamHomeLayer: true }, "");
        armed.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  });
}
