// The photo studio: choose a framing, a mood and a shape, then "Take photo".
// The live view follows the choices (light, roof, camera) so you see roughly
// what you'll get; the photo itself is rendered offline at full quality.
import { useEffect, useMemo, useRef, useState } from "react";
import { download } from "../domain/export";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { Switch } from "../components/Controls";
import { cropToJpeg } from "./encode";
import type { PhotoOutcome } from "./PhotoRenderer";
import {
  FRAMINGS,
  MOODS,
  MOOD_ORDER,
  SHAPES,
  SHAPE_ORDER,
  type Framing,
  type MoodId,
  type ShapeId,
} from "./settings";
import "./photo.css";

export type PhotoSettings = { framing: Framing; mood: MoodId; aspect: number; watermark: boolean };

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="dh-photo-row">
      <span id={`dh-photo-${label}`}>{label}</span>
      <div className="dh-photo-chips" role="radiogroup" aria-labelledby={`dh-photo-${label}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A circular progress ring with the percentage inside. */
function Ring({ fraction }: { fraction: number }) {
  const r = 34,
    c = 2 * Math.PI * r;
  return (
    <svg className="dh-photo-ring" viewBox="0 0 80 80" aria-hidden>
      <circle cx="40" cy="40" r={r} />
      <circle cx="40" cy="40" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} />
      <text x="40" y="46" textAnchor="middle">
        {Math.round(fraction * 100)}%
      </text>
    </svg>
  );
}

type Phase = { kind: "setup" } | { kind: "rendering" } | { kind: "done"; blob: Blob; quick: boolean };

export function PhotoStudio({
  onClose,
  onScene,
  render,
  progress,
  onCancel,
  snapshot,
}: {
  onClose: () => void;
  /** Show the framing and mood live while choosing. */
  onScene: (scene: { framing: Framing; hour: number } | null) => void;
  render: (settings: PhotoSettings) => Promise<PhotoOutcome>;
  progress: number;
  onCancel: () => void;
  /** The quick fallback: a picture of the live view. */
  snapshot: () => Promise<Blob | null>;
}) {
  const { state, dispatch, project, notify } = useEditor();
  const inRoom = !!state.focus;
  const [framing, setFraming] = useState<Framing>(inRoom ? "room" : "aerial");
  const [mood, setMood] = useState<MoodId>("golden");
  const [shape, setShape] = useState<ShapeId>("post");
  const [mark, setMark] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const url = useMemo(() => (phase.kind === "done" ? URL.createObjectURL(phase.blob) : ""), [phase]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;

  // The live view follows the choices; it goes back to normal when the studio closes.
  useEffect(() => onSceneRef.current({ framing, hour: MOODS[mood].hour }), [framing, mood]);
  useEffect(() => () => onSceneRef.current(null), []);
  // Frame the live view roughly like the photo.
  useEffect(() => {
    if (framing === "aerial") dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } });
    if (framing === "front") dispatch({ type: "camera", command: { type: "fit", subject: "home", view: "front" } });
    if (framing === "room" && state.focus)
      dispatch({
        type: "camera",
        command: { type: "fit", subject: "room", floorId: state.focus.floorId, roomId: state.focus.roomId, view: "room" },
      });
    // Only when the framing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing]);

  const take = async () => {
    setPhase({ kind: "rendering" });
    const outcome = await render({ framing, mood, aspect: SHAPES[shape].aspect, watermark: mark });
    if ("blob" in outcome) return setPhase({ kind: "done", blob: outcome.blob, quick: false });
    if (outcome.error === "cancelled") return setPhase({ kind: "setup" });
    // The careful render couldn't run here: a quick picture of the view instead.
    const live = await snapshot();
    const quick = live ? await cropToJpeg(live, SHAPES[shape].aspect, { mark }) : null;
    if (quick) setPhase({ kind: "done", blob: quick, quick: true });
    else {
      setPhase({ kind: "setup" });
      notify("Couldn’t take the photo on this device. Please try again.", "error");
    }
  };
  const fileName = `${project.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "dream-home"}-${mood}.jpg`;
  const share = async (blob: Blob) => {
    const file = new File([blob], fileName, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: project.name, text: "Our dream home 🏠" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    download(blob, fileName);
  };

  return (
    <div className="dh-photo-studio" role="dialog" aria-modal="false" aria-label="Photo studio">
      <div className="dh-photo-top">
        <IconButton icon={Icon.close} label="Close photo studio" onClick={onClose} />
        <strong>
          <Icon.photo size={18} aria-hidden /> Photo
        </strong>
      </div>
      <section className="dh-photo-panel" data-inset="bottom">
        {phase.kind === "setup" && (
          <>
            <Chips
              label="Framing"
              value={framing}
              options={(Object.keys(FRAMINGS) as Framing[]).map((f) => ({
                value: f,
                label: FRAMINGS[f],
                disabled: f === "room" && !inRoom,
              }))}
              onChange={setFraming}
            />
            <Chips label="Mood" value={mood} options={MOOD_ORDER.map((m) => ({ value: m, label: MOODS[m].label }))} onChange={setMood} />
            <Chips label="Shape" value={shape} options={SHAPE_ORDER.map((s) => ({ value: s, label: SHAPES[s].label }))} onChange={setShape} />
            <Switch label="Dream Home mark" checked={mark} onChange={() => setMark(!mark)} />
            <Button variant="primary" size="lg" full icon={Icon.photo} onClick={() => void take()}>
              Take photo
            </Button>
          </>
        )}
        {phase.kind === "rendering" && (
          <div className="dh-photo-progress" role="status" aria-live="polite">
            <Ring fraction={progress} />
            <p>Developing your photo…</p>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
        {phase.kind === "done" && (
          <div className="dh-photo-result">
            <img src={url} alt={`Photo of ${project.name}`} />
            {phase.quick && <p className="dh-photo-note">This device made a quick photo instead of a full render.</p>}
            <div className="dh-photo-actions">
              <Button variant="primary" size="lg" icon={Icon.share} onClick={() => void share(phase.blob)}>
                Share
              </Button>
              <Button variant="secondary" size="lg" icon={Icon.download} onClick={() => download(phase.blob, fileName)}>
                Save
              </Button>
            </div>
            <Button variant="ghost" full icon={Icon.sparkle} onClick={() => setPhase({ kind: "setup" })}>
              Try another mood
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
