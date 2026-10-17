// The card that greets an AI-designed home: what the designer did and why,
// plus "Try another" and "Keep it". Everything after that is normal editing.
import { withPlace } from "../domain/place";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import type { AiResult } from "./AiDesigner";
import { buildHome } from "./buildHome";
import { designHome } from "./client";
import "./ai.css";

const WHY: Record<"limit" | "busy" | "offline", string> = {
  limit:
    "You’ve used your free AI designs, so Dream Home’s own designer made this one. More AI designs are coming soon.",
  busy: "The AI designer was busy, so Dream Home’s own designer made this one. Try again in a little while.",
  offline:
    "The AI designer isn’t available right now, so Dream Home’s own designer made this one.",
};

export function DesignNotes({
  result,
  onReplace,
  onClose,
}: {
  result: AiResult;
  /** A new take on the same brief, committed as one undoable step. */
  onReplace: (result: AiResult) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  /** Phones show the first note; the rest open on request. */
  const [open, setOpen] = useState(
    () => window.matchMedia?.("(min-width: 1050px)").matches ?? true,
  );
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // Screen readers and keyboards land on the new design's notes.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const another = async () => {
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const variant = result.variant + 1;
      const designed = await designHome(
        result.brief,
        variant,
        controller.signal,
      );
      const built = buildHome(result.brief, designed.plan);
      if (built)
        onReplace({
          ...result,
          project: withPlace(built.project, result.location),
          notes: built.notes,
          source: designed.source,
          why: designed.why,
          variant,
          credits: designed.credits,
        });
    } catch {
      /* cancelled */
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <section
      className="dh-ai-notes"
      aria-labelledby="dh-ai-notes-title"
      data-open={open || undefined}
    >
      <header>
        <span className="dh-ai-notes-badge" aria-hidden>
          <Icon.sparkle size={18} />
        </span>
        <div>
          <h2 id="dh-ai-notes-title" ref={heading} tabIndex={-1}>Designed for you</h2>
          <small>
            {result.source === "ai"
              ? "By the AI designer"
              : "By Dream Home’s own designer"}
          </small>
        </div>
        <IconButton
          icon={open ? Icon.collapse : Icon.expand}
          tone="plain"
          label={open ? "Show fewer notes" : "Show all design notes"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      </header>
      <ul>
        {(open ? result.notes : result.notes.slice(0, 1)).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {open && result.why && <p className="dh-ai-why">{WHY[result.why]}</p>}
      <div className="dh-ai-notes-actions">
        <Button
          variant="secondary"
          icon={Icon.auto}
          disabled={busy}
          aria-busy={busy}
          onClick={another}
        >
          {busy ? "Designing…" : "Try another"}
        </Button>
        <Button variant="primary" icon={Icon.check} onClick={onClose}>
          Keep it
        </Button>
      </div>
    </section>
  );
}
