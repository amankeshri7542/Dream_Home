// "Make it nice": one tap restyles a room — paint, floor, furniture colours
// and a few finishing pieces — as a single undoable step.
import { useEffect, useRef, useState } from "react";
import type { Project, Room } from "../domain/types";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { VIBES, type Vibe } from "./brief";
import { applyRoomPlan } from "./buildHome";
import { designRoom } from "./client";
import { radioKeys, useRovingRadios } from "./radioKeys";
import "./ai.css";

const VIBE_LABELS: Record<Vibe, string> = {
  "indian-modern": "Modern",
  "indian-classic": "Classic",
  minimal: "Minimal",
  colourful: "Colourful",
};
/** The home's own look, when it has one, picks the starting vibe. */
function homeVibe(project: Project): Vibe {
  const preset = (project.style as { preset?: string } | undefined)?.preset;
  return preset === "indian-classic" ? "indian-classic" : preset === "diorama" ? "minimal" : "indian-modern";
}

export function MakeItNice({ room, floorId, compact = false }: { room: Room; floorId: string; compact?: boolean }) {
  const editor = useEditor();
  // The design arrives later; apply it to the home as it is then.
  const latest = useRef(editor);
  latest.current = editor;
  const [vibe, setVibe] = useState<Vibe>(() => homeVibe(editor.project));
  const [busy, setBusy] = useState(false);
  /** What the last makeover did, kept in the panel (toasts get replaced). */
  const [done, setDone] = useState<{ roomId: string; text: string } | null>(null);
  const takes = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  useRovingRadios(box);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // A new room starts with the first take again.
  useEffect(() => {
    takes.current = 0;
  }, [room.id]);

  const go = async () => {
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const designed = await designRoom(
        {
          kind: room.kind,
          name: room.name,
          w: room.bounds.w,
          d: room.bounds.d,
          items: (room.furniture ?? []).map((i) => i.catalogId),
          vibe,
        },
        takes.current++,
        controller.signal,
      );
      const { project, commit, dispatch } = latest.current;
      const next = applyRoomPlan(project, floorId, room.id, designed.plan);
      if (next === project) {
        dispatch({ type: "notify", text: `${room.name} couldn’t be restyled. Try again.`, tone: "error" });
        return;
      }
      const note = designed.plan.notes[0] ?? `${room.name} has a fresh look.`;
      const by =
        designed.source === "ai"
          ? ""
          : designed.why === "limit"
            ? " Your free AI makeovers are used up, so Dream Home’s own designer chose this."
            : " Dream Home’s own designer chose this.";
      commit(next, `Make ${room.name} nice`, { notice: `${note} Undo brings the old look back.` });
      setDone({ roomId: room.id, text: `${note}${by}` });
    } catch {
      /* cancelled */
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const done_ = done?.roomId === room.id && (
    <p className="dh-ai-nice-done" role="status">
      <Icon.check size={16} aria-hidden />
      {done.text}
    </p>
  );
  // In the Room Studio: one row, the button and a style picker.
  if (compact)
    return (
      <div className="dh-ai-nice is-compact">
        <div className="dh-ai-nice-row">
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={go}>
            <Icon.sparkle size={18} aria-hidden />
            {busy ? "Making it nice…" : "Make it nice"}
          </Button>
          <select
            className="dh-ai-nice-style"
            aria-label="Makeover style"
            value={vibe}
            onChange={(e) => setVibe(e.target.value as Vibe)}
          >
            {VIBES.map((v) => (
              <option key={v} value={v}>
                {VIBE_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        {done_}
      </div>
    );
  return (
    <div className="dh-ai-nice" ref={box} onKeyDown={radioKeys}>
      <p className="dh-ai-nice-hint">New paint, floor, colours and a few finishing touches. Undo any time.</p>
      <div className="dh-ai-chips is-inline" role="radiogroup" aria-label="Makeover style">
        {VIBES.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={vibe === v} onClick={() => setVibe(v)}>
            {VIBE_LABELS[v]}
          </button>
        ))}
      </div>
      <Button variant="primary" full disabled={busy} aria-busy={busy} onClick={go}>
        <Icon.sparkle size={18} aria-hidden />
        {busy ? "Making it nice…" : "Make it nice"}
      </Button>
      {done?.roomId === room.id && (
        <p className="dh-ai-nice-done" role="status">
          <Icon.check size={16} aria-hidden />
          {done.text}
        </p>
      )}
    </div>
  );
}
