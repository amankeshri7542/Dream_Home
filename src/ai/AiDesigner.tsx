// "Design my home": four one-thumb steps, then a progress screen while the
// designer works, then the finished home. Every step has a sensible default,
// so four taps on "Next" is enough.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../domain/types";
import { useReducedMotion } from "../editor/hooks";
import { PLOT_SIZES } from "../onboarding/templates";
import { Icon, roomIcon, type LucideIcon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { FAMILY_BEDROOMS, NOTE_MAX, type Family, type HomeBrief, type Must, type Vibe } from "./brief";
import { bedroomsThatFit, buildHome } from "./buildHome";
import { designHome, fetchCredits, savedCredits, type Credits } from "./client";
import { radioKeys, useRovingRadios } from "./radioKeys";
import "./ai.css";

export type AiResult = {
  project: Project;
  notes: string[];
  source: "ai" | "planner";
  why: null | "limit" | "busy" | "offline";
  brief: HomeBrief;
  variant: number;
  credits: Credits;
};

const FAMILY_CARDS: { id: Family; label: string; hint: string }[] = [
  { id: "single", label: "Just me", hint: "1 bedroom" },
  { id: "couple", label: "A couple", hint: "2 bedrooms" },
  { id: "young-family", label: "Young family", hint: "Parents + kids" },
  { id: "big-family", label: "Big family", hint: "4+ people" },
  { id: "joint-family", label: "Joint family", hint: "With grandparents" },
];
const MUST_CHIPS: { id: Must; label: string; icon: LucideIcon }[] = [
  { id: "ensuite", label: "Attached bathroom", icon: roomIcon("bathroom") },
  { id: "pooja", label: "Pooja room", icon: roomIcon("utility", "pooja") },
  { id: "parking", label: "Car parking", icon: Icon.car },
  { id: "vastu", label: "Vastu-friendly", icon: Icon.explore },
  { id: "balcony", label: "Balcony", icon: Icon.day },
  { id: "garden", label: "Garden", icon: Icon.tree },
  { id: "office", label: "Home office", icon: roomIcon("utility", "office") },
  { id: "guest", label: "Guest room", icon: roomIcon("bedroom") },
];
const VIBE_CARDS: { id: Vibe; label: string; hint: string; colors: string[] }[] = [
  { id: "indian-modern", label: "Indian modern", hint: "Bright, clean, marble & wood", colors: ["#f3efe6", "#4b4845", "#c49a6c", "#8fa69c"] },
  { id: "indian-classic", label: "Indian classic", hint: "Warm, rich, carved wood", colors: ["#b5654a", "#cf9f45", "#7a5538", "#c0714f"] },
  { id: "minimal", label: "Calm minimal", hint: "Soft greys, light oak", colors: ["#f2ede4", "#c9c5bd", "#c49a6c", "#4b4845"] },
  { id: "colourful", label: "Colourful", hint: "Joyful colour pops", colors: ["#e2c07f", "#bfcfd9", "#dca9a1", "#a9bcab"] },
];
const FACINGS: HomeBrief["facing"][] = ["north", "east", "south", "west"];
const STAGES = ["Reading your brief…", "Planning the rooms…", "Furnishing every room…", "Choosing colours…", "Building it in 3D…"];
const STEP_TITLES = ["Your plot", "Who lives here?", "Must-haves", "Your style"];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function CreditsChip({ credits }: { credits: Credits }) {
  if (!credits.live) return <span className="dh-ai-chip">Dream Home’s free designer</span>;
  return (
    <span className="dh-ai-chip" data-empty={credits.home === 0 || undefined}>
      <Icon.sparkle size={14} aria-hidden />
      {credits.home > 0
        ? `${credits.home} free AI design${credits.home === 1 ? "" : "s"} left`
        : "Free AI designs used"}
    </span>
  );
}

export function AiDesigner({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (result: AiResult) => void;
}) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [plot, setPlot] = useState({ w: 30, d: 40 });
  const [facing, setFacing] = useState<HomeBrief["facing"]>("east");
  const [family, setFamily] = useState<Family>("young-family");
  const [bedrooms, setBedrooms] = useState(3);
  const [floors, setFloors] = useState<HomeBrief["floors"]>("auto");
  const [musts, setMusts] = useState<Must[]>(["ensuite", "pooja", "parking", "vastu"]);
  const [vibe, setVibe] = useState<Vibe>("indian-modern");
  const [note, setNote] = useState("");
  const [credits, setCredits] = useState<Credits>(savedCredits);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useRovingRadios(sheet);

  useEffect(() => {
    let live = true;
    fetchCredits().then((c) => live && setCredits(c));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => heading.current?.focus(), [step, working]);
  useEffect(() => {
    if (!working) return;
    setStage(0);
    const timer = window.setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 5500);
    return () => window.clearInterval(timer);
  }, [working]);

  const fits = useMemo(() => (step === 1 ? bedroomsThatFit(plot, floors) : 6), [step, plot, floors]);
  const brief: HomeBrief = { plot, facing, family, bedrooms, floors, musts, vibe, ...(note.trim() ? { note: note.trim() } : {}) };
  const toggle = (m: Must) => setMusts((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));

  const start = async () => {
    setError("");
    setWorking(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const designed = await designHome(brief, 0, controller.signal);
      setStage(STAGES.length - 1);
      // Let the browser paint the last stage before the heavy build.
      await new Promise((r) => setTimeout(r, 50));
      const built = buildHome(brief, designed.plan);
      if (!built) throw new Error("no-fit");
      onDone({
        project: built.project,
        notes: built.notes,
        source: designed.source,
        why: designed.why,
        brief,
        variant: 0,
        credits: designed.credits,
      });
    } catch {
      if (controller.signal.aborted) return;
      setWorking(false);
      setStep(1);
      setError("That many rooms won’t fit on this plot. Try fewer bedrooms or a bigger plot.");
    }
  };

  if (working)
    return (
      <div className="dh-ai" role="dialog" aria-modal="false" aria-labelledby="dh-ai-title" data-inset="auto">
        <div className="dh-ai-progress" aria-busy="true">
          <span className={`dh-ai-orb ${reduced ? "" : "is-moving"}`} aria-hidden>
            <Icon.sparkle size={34} />
          </span>
          <h2 id="dh-ai-title" ref={heading} tabIndex={-1}>
            Designing your home
          </h2>
          <ol className="dh-ai-stages" aria-live="polite">
            {STAGES.map((s, i) => (
              <li key={s} data-state={i < stage ? "done" : i === stage ? "now" : "next"}>
                {i < stage ? <Icon.check size={16} aria-hidden /> : <i aria-hidden />}
                {s}
              </li>
            ))}
          </ol>
          <p className="dh-ai-small">This takes about half a minute. You can tweak everything afterwards.</p>
          <Button
            variant="ghost"
            onClick={() => {
              abort.current?.abort();
              setWorking(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );

  const last = step === STEP_TITLES.length - 1;
  return (
    <div
      ref={sheet}
      className="dh-ai"
      role="dialog"
      aria-modal="false"
      aria-labelledby="dh-ai-title"
      data-inset="auto"
      onKeyDown={(e) => {
        if (radioKeys(e)) return;
        // Escape steps back, like the back arrow.
        if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement && e.target.value)) {
          e.preventDefault();
          e.stopPropagation();
          if (step) setStep(step - 1);
          else onBack();
        }
      }}
    >
      <div className="dh-ai-sheet">
        <header className="dh-ai-head">
          <IconButton
            icon={Icon.left}
            tone="plain"
            label={step ? "Previous step" : "Back"}
            onClick={() => (step ? setStep(step - 1) : onBack())}
          />
          <div>
            <span className="dh-kicker">
              <Icon.sparkle size={14} aria-hidden /> AI designer · Step {step + 1} of {STEP_TITLES.length}
            </span>
            <h2 id="dh-ai-title" ref={heading} tabIndex={-1}>
              {STEP_TITLES[step]}
            </h2>
          </div>
          <div className="dh-ai-dots" aria-hidden>
            {STEP_TITLES.map((t, i) => (
              <i key={t} data-on={i <= step || undefined} />
            ))}
          </div>
        </header>

        <div className="dh-ai-body">
          {error && (
            <p className="dh-ai-error" role="alert">
              {error}
            </p>
          )}
          {step === 0 && (
            <>
              <p className="dh-ai-lead">How big is your plot?</p>
              <div className="dh-ai-chips" role="radiogroup" aria-label="Plot size">
                {PLOT_SIZES.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    role="radio"
                    aria-checked={plot.w === p.w && plot.d === p.d}
                    onClick={() => setPlot({ w: p.w, d: p.d })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="dh-ai-lead">Which way does it face?</p>
              <div className="dh-ai-chips is-four" role="radiogroup" aria-label="Plot facing">
                {FACINGS.map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={facing === f} onClick={() => setFacing(f)}>
                    {cap(f)}
                  </button>
                ))}
              </div>
              <p className="dh-ai-small">The side with the road and your main gate.</p>
            </>
          )}

          {step === 1 && (
            <>
              <div className="dh-ai-cards" role="radiogroup" aria-label="Household">
                {FAMILY_CARDS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={family === c.id}
                    onClick={() => {
                      setFamily(c.id);
                      setBedrooms(FAMILY_BEDROOMS[c.id]);
                    }}
                  >
                    <strong>{c.label}</strong>
                    <small>{c.hint}</small>
                  </button>
                ))}
              </div>
              <div className="dh-ai-row">
                <span>Bedrooms</span>
                <div className="dh-ai-stepper">
                  <IconButton icon={Icon.minus} tone="plain" label="Fewer bedrooms" disabled={bedrooms <= 1} onClick={() => setBedrooms(bedrooms - 1)} />
                  <strong className="dh-num" aria-live="polite">
                    {bedrooms}
                  </strong>
                  <IconButton icon={Icon.add} tone="plain" label="More bedrooms" disabled={bedrooms >= 6} onClick={() => setBedrooms(bedrooms + 1)} />
                </div>
              </div>
              {bedrooms > fits && fits > 0 && (
                <p className="dh-ai-fit" role="status">
                  A {plot.w} × {plot.d} ft plot fits about {fits} bedroom{fits === 1 ? "" : "s"}
                  {floors === "auto" ? "" : ` on ${floors} floor${floors === 1 ? "" : "s"}`}. We’ll fit as many as we can.
                </p>
              )}
              <div className="dh-ai-row">
                <span>Floors</span>
                <div className="dh-ai-chips is-inline" role="radiogroup" aria-label="Floors">
                  {(["auto", 1, 2, 3] as const).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={floors === f} onClick={() => setFloors(f)}>
                      {f === "auto" ? "AI picks" : f}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="dh-ai-lead">Tap everything you’d love to have.</p>
              <div className="dh-ai-musts">
                {MUST_CHIPS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={musts.includes(m.id)} onClick={() => toggle(m.id)}>
                    <m.icon size={20} aria-hidden />
                    {m.label}
                    {musts.includes(m.id) && <Icon.check size={16} aria-hidden className="dh-ai-tick" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="dh-ai-vibes" role="radiogroup" aria-label="Style">
                {VIBE_CARDS.map((v) => (
                  <button key={v.id} type="button" role="radio" aria-checked={vibe === v.id} onClick={() => setVibe(v.id)}>
                    <span className="dh-ai-swatch" aria-hidden>
                      {v.colors.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <strong>{v.label}</strong>
                    <small>{v.hint}</small>
                  </button>
                ))}
              </div>
              <label className="dh-field dh-ai-note">
                <span>Anything else? (optional)</span>
                <textarea
                  rows={2}
                  maxLength={NOTE_MAX}
                  value={note}
                  placeholder="A big kitchen, a quiet study, room for Dadi’s swing…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <footer className="dh-ai-foot">
          {last && <CreditsChip credits={credits} />}
          {last ? (
            <Button variant="primary" size="lg" full onClick={start}>
              <Icon.sparkle size={20} aria-hidden />
              Design my home
            </Button>
          ) : (
            <Button variant="primary" size="lg" full onClick={() => setStep(step + 1)}>
              Next
              <Icon.right size={20} aria-hidden />
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
