import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "../editor/hooks";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { feedback } from "../ui/feedback";

const COLORS = ["#b5562f", "#4d7a53", "#f4bc55", "#c68a4e", "#7fb0c9", "#e58f6f"];

/**
 * "Ready to move in!" — a confetti burst and an invitation to explore. A badge
 * earned (Home score) gets the same confetti and sound in a small card at the
 * top that never takes focus or covers what you're doing, and leaves by itself.
 */
export function Celebration({
  onExplore,
  onClose,
  title = "Ready to move in!",
  body = "Your home has everything it needs. Take a walk inside, watch the sun set, or snap a photo.",
  badge = false,
}: {
  onExplore: () => void;
  onClose: () => void;
  title?: string;
  body?: string;
  badge?: boolean;
}) {
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
    if (!badge) return;
    const timer = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timer);
  }, [badge, onClose]);
  useEffect(() => {
    if (!badge) primary.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key, { capture: true });
    return () => window.removeEventListener("keydown", key, { capture: true });
  }, [onClose, badge]);
  return (
    <div className={`dh-celebrate${badge ? " is-badge" : ""}`} data-chrome="celebration">
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
      <div
        className="dh-celebrate-card"
        role={badge ? "status" : "dialog"}
        aria-modal={badge ? undefined : "false"}
        aria-labelledby="dh-celebrate-title"
      >
        <span className="dh-celebrate-badge" aria-hidden>
          {badge ? <Icon.badge size={28} /> : <Icon.sparkle size={28} />}
        </span>
        <h2 id="dh-celebrate-title">{title}</h2>
        <p>{body}</p>
        {badge ? (
          <div className="dh-celebrate-actions">
            <Button variant="ghost" onClick={onClose}>
              Nice!
            </Button>
          </div>
        ) : (
          <div className="dh-celebrate-actions">
            <Button ref={primary} variant="primary" icon={Icon.explore} onClick={onExplore}>
              Explore my home
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Keep building
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
