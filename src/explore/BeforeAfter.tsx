// Empty or furnished: the same home before it's lived in and after. A tap
// switches; pressing and holding peeks at the other one until you let go.
// It only flips what the scene shows (one flag, no second render).
import { useRef } from "react";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";

const HOLD_MS = 380;

export function BeforeAfter({ empty, onChange, className }: { empty: boolean; onChange: (empty: boolean) => void; className?: string }) {
  const hold = useRef<{ timer: number; from: boolean; peeking: boolean } | null>(null);
  const skipClick = useRef(false);
  const release = () => {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (!h.peeking) return;
    // A peek ends where it started, and the click that follows changes nothing.
    skipClick.current = true;
    onChange(h.from);
  };
  return (
    <Button
      variant="secondary"
      icon={Icon.beforeAfter}
      className={`dh-before-after ${className ?? ""}`}
      aria-label="Empty rooms"
      aria-pressed={empty}
      data-tip="Empty rooms: tap to switch, hold to peek"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        skipClick.current = false;
        const h = { from: empty, peeking: false, timer: 0 };
        h.timer = window.setTimeout(() => {
          h.peeking = true;
          onChange(!h.from);
        }, HOLD_MS);
        hold.current = h;
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        onChange(!empty);
      }}
    >
      <span>Empty rooms</span>
    </Button>
  );
}
