import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "../editor/hooks";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { feedback } from "../ui/feedback";

const COLORS = ["#b5562f", "#4d7a53", "#f4bc55", "#c68a4e", "#7fb0c9", "#e58f6f"];

/** "Ready to move in!" — a confetti burst and an invitation to explore. */
export function Celebration({ onExplore, onClose }: { onExplore: () => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const primary = useRef<HTMLButtonElement>(null);
  // Deterministic pieces: spread across the width, varied fall and spin.
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.07,
        duration: 1.6 + ((i * 13) % 10) / 10,
        drift: ((i * 29) % 60) - 30,
        spin: ((i * 53) % 720) - 360,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    [],
  );
  // Once per celebration (the effect below re-runs whenever onClose changes).
  useEffect(() => feedback.success(), []);
  useEffect(() => {
    primary.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key, { capture: true });
    return () => window.removeEventListener("keydown", key, { capture: true });
  }, [onClose]);
  return (
    <div className="dh-celebrate" data-chrome="celebration">
      {!reduced && (
        <div className="dh-confetti" aria-hidden>
          {pieces.map((p, i) => (
            <i
              key={i}
              className={p.round ? "is-round" : undefined}
              style={
                {
                  left: `${p.left}%`,
                  background: p.color,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  "--drift": `${p.drift}vw`,
                  "--spin": `${p.spin}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="dh-celebrate-card" role="dialog" aria-modal="false" aria-labelledby="dh-celebrate-title">
        <span className="dh-celebrate-badge" aria-hidden>
          <Icon.sparkle size={28} />
        </span>
        <h2 id="dh-celebrate-title">Ready to move in!</h2>
        <p>Your home has everything it needs. Take a walk inside, watch the sun set, or snap a photo.</p>
        <div className="dh-celebrate-actions">
          <Button ref={primary} variant="primary" icon={Icon.explore} onClick={onExplore}>
            Explore my home
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep building
          </Button>
        </div>
      </div>
    </div>
  );
}
