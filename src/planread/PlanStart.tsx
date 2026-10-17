// "Start from my builder's plan": a photo or screenshot of the plan, the plot
// size and which side of the drawing the road is on, then the AI reads it
// (one free reading per device). Offline, out of readings or unread, "Draw it
// yourself" starts the same check screen with the photo under an empty house.
// Lazy (its own chunk).
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../editor/hooks";
import { PLOT_SIZES } from "../onboarding/templates";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { readPlan, readingsLeft } from "./api";
import { planFromReading, type PlanFromReading } from "./fromReading";
import { PhotoProblem, preparePhoto, type PlanPhoto } from "./image";
import type { PlanReading } from "./reading";
import "../ai/ai.css";
import "./planread.css";

export type PlanStartResult = { plan: PlanFromReading; photo: PlanPhoto; read: boolean };
type Road = "bottom" | "top" | "left" | "right";
const ROADS: { id: Road; label: string; side: "south" | "north" | "west" | "east" }[] = [
  { id: "bottom", label: "Bottom", side: "south" },
  { id: "top", label: "Top", side: "north" },
  { id: "left", label: "Left", side: "west" },
  { id: "right", label: "Right", side: "east" },
];
const FT = 30.48;
const STAGES = ["Finding the walls", "Reading the room names", "Measuring the rooms"];
const EMPTY: PlanReading = { units: "unknown", outline: { w: 0, h: 0 }, outlineBox: { x: 0, y: 0, w: 1, h: 1 }, rooms: [], doors: [], stairs: [], notes: "" };

export default function PlanStart({ onBack, onDone }: { onBack: () => void; onDone: (result: PlanStartResult) => void }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<0 | 1>(0);
  const [photo, setPhoto] = useState<PlanPhoto | null>(null);
  const [plot, setPlot] = useState({ w: 30, d: 40 });
  const [road, setRoad] = useState<Road>("bottom");
  const [credits, setCredits] = useState<{ live: boolean; left: number | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState(0);
  const [problem, setProblem] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const handedOver = useRef(false);

  useEffect(() => {
    let live = true;
    void readingsLeft().then((c) => live && setCredits(c));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);
  // The photo's object URL lives on in the check screen once handed over.
  useEffect(() => () => void (photo && !handedOver.current && URL.revokeObjectURL(photo.url)), [photo]);
  useEffect(() => heading.current?.focus(), [step, reading]);
  useEffect(() => {
    if (!reading) return;
    setStage(0);
    const timer = window.setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 4000);
    return () => window.clearInterval(timer);
  }, [reading]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem("");
    try {
      setPhoto(await preparePhoto(file));
    } catch (error) {
      setProblem(error instanceof PhotoProblem ? error.message : "That picture couldn't be opened. Try another.");
    }
  };
  /** The plot in the plan's own terms: width along the road, depth away from it. */
  const plotChoice = () => {
    const side = ROADS.find((r) => r.id === road)!.side;
    const across = Math.round(plot.w * FT),
      along = Math.round(plot.d * FT);
    return side === "east" || side === "west" ? { widthCm: along, depthCm: across, road: side } : { widthCm: across, depthCm: along, road: side };
  };
  const finish = (result: PlanFromReading | null, read: boolean) => {
    if (!result || !photo) return setProblem(`This plan doesn’t fit a ${plot.w} × ${plot.d} ft plot. Check the plot size.`);
    handedOver.current = true;
    onDone({ plan: result, photo, read });
  };
  const drawIt = () => photo && finish(planFromReading(EMPTY, plotChoice(), photo.width / photo.height), false);
  const read = async () => {
    if (!photo) return;
    setProblem("");
    setReading(true);
    const controller = new AbortController();
    abort.current = controller;
    const answer = await readPlan(photo.blob, { plot: `${plot.w}x${plot.d}ft`, road }, controller.signal);
    if (controller.signal.aborted) return;
    setReading(false);
    if (!answer.ok) {
      setCredits((c) => (answer.reason === "limit" ? { live: c?.live ?? true, left: 0 } : c));
      return setProblem(`${answer.message} You can draw it yourself on the photo.`);
    }
    const result = planFromReading(answer.reading, plotChoice(), photo.width / photo.height);
    if (result && !answer.reading.rooms.length) result.notes.unshift(answer.reading.notes || "No rooms could be read from this photo. Trace them over it instead.");
    finish(result, true);
  };
  const canRead = !!credits?.live && credits.left !== 0;

  if (reading)
    return (
      <div className="dh-ai" role="dialog" aria-modal="false" aria-labelledby="dh-plan-title" data-inset="auto">
        <div className="dh-ai-progress" aria-busy="true">
          <span className={`dh-ai-orb ${reduced ? "" : "is-moving"}`} aria-hidden>
            <Icon.floorPlan size={34} />
          </span>
          <h2 id="dh-plan-title" ref={heading} tabIndex={-1}>
            Reading your plan…
          </h2>
          <ol className="dh-ai-stages" aria-live="polite">
            {STAGES.map((s, i) => (
              <li key={s} data-state={i < stage ? "done" : i === stage ? "now" : "next"}>
                {i < stage ? <Icon.check size={16} aria-hidden /> : <i aria-hidden />}
                {s}
              </li>
            ))}
          </ol>
          <p className="dh-ai-small">This takes 5 to 20 seconds. You check every room afterwards.</p>
          <Button
            variant="ghost"
            onClick={() => {
              abort.current?.abort();
              setReading(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );

  return (
    <div className="dh-ai" role="dialog" aria-modal="false" aria-labelledby="dh-plan-title" data-inset="auto">
      <div className="dh-ai-sheet">
        <header className="dh-ai-head">
          <IconButton icon={Icon.left} tone="plain" label={step ? "Previous step" : "Back"} onClick={() => (step ? setStep(0) : onBack())} />
          <div>
            <span className="dh-kicker">
              <Icon.floorPlan size={14} aria-hidden /> Your builder’s plan · Step {step + 1} of 2
            </span>
            <h2 id="dh-plan-title" ref={heading} tabIndex={-1}>
              {step === 0 ? "A photo of your plan" : "Your plot"}
            </h2>
          </div>
        </header>
        <div className="dh-ai-body">
          {problem && (
            <p className="dh-ai-error" role="alert">
              {problem}
            </p>
          )}
          {step === 0 && (
            <>
              {photo ? (
                <img className="dh-plan-preview" src={photo.url} alt="Your plan photo" />
              ) : (
                <ul className="dh-plan-tips">
                  <li>Flat and bright, with the whole plan in the frame.</li>
                  <li>Straight from above, not at an angle.</li>
                  <li>For a PDF, take a screenshot of the page.</li>
                </ul>
              )}
              <div className="dh-plan-pick">
                <Button variant={photo ? "secondary" : "primary"} size="lg" icon={Icon.photo} onClick={() => camera.current?.click()}>
                  Take a photo
                </Button>
                <Button variant="secondary" size="lg" icon={Icon.upload} onClick={() => files.current?.click()}>
                  {photo ? "Choose another" : "Choose a picture"}
                </Button>
              </div>
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void choose(e.target.files?.[0])}
              />
              <input
                ref={files}
                type="file"
                accept="image/*"
                hidden
                aria-label="Choose a picture of your plan"
                onChange={(e) => void choose(e.target.files?.[0])}
              />
              <p className="dh-ai-small">If the AI reads your plan, the photo is sent once for that and isn’t kept. Drawing it yourself keeps it on this phone.</p>
            </>
          )}
          {step === 1 && (
            <>
              <p className="dh-ai-lead">How big is the plot?</p>
              <div className="dh-ai-chips" role="radiogroup" aria-label="Plot size">
                {PLOT_SIZES.map((p) => (
                  <button key={p.label} type="button" role="radio" aria-checked={plot.w === p.w && plot.d === p.d} onClick={() => setPlot({ w: p.w, d: p.d })}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="dh-ai-lead">Where is the road on the drawing?</p>
              <div className="dh-ai-chips is-four" role="radiogroup" aria-label="Road on the drawing">
                {ROADS.map((r) => (
                  <button key={r.id} type="button" role="radio" aria-checked={road === r.id} onClick={() => setRoad(r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="dh-ai-small">
                {canRead
                  ? "The AI reads your plan once, free. You check and fix every room before it becomes 3D."
                  : credits?.live && credits.left === 0
                    ? "Your free plan reading is used. Trace the rooms over your photo instead: it only takes a few minutes."
                    : "Plan reading isn’t available right now. Trace the rooms over your photo instead."}
              </p>
            </>
          )}
        </div>
        <footer className="dh-ai-foot">
          {step === 0 ? (
            <Button variant="primary" size="lg" full disabled={!photo} onClick={() => setStep(1)}>
              Next: my plot
            </Button>
          ) : (
            <>
              {canRead && (
                <Button variant="primary" size="lg" full icon={Icon.sparkle} onClick={() => void read()}>
                  Read my plan
                </Button>
              )}
              <Button variant={canRead ? "ghost" : "primary"} size="lg" full icon={Icon.floorPlan} onClick={drawIt}>
                Draw it yourself
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
