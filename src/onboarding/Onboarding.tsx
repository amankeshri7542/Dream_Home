import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MiniPlan } from "../components/GuidedStart";
import { download } from "../domain/export";
import { projectStats } from "../domain/model";
import type { Project } from "../domain/types";
import { friendlyError, useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { BrandMark } from "../shell/TopBar";
import { PLOT_SIZES, TEMPLATES, buildTemplate, type Template } from "./templates";
import "./onboarding.css";
import "../ai/ai.css";

/** The big "Design it for me" button: the AI designer (title screen and gallery). */
function AiEntry({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dh-ai-entry" onClick={onClick}>
      <Icon.sparkle size={26} aria-hidden />
      <span>
        <strong>Design it for me</strong>
        <small>Answer 4 quick questions. Get a furnished home.</small>
      </span>
      <Icon.right size={20} aria-hidden />
    </button>
  );
}

/** The other big choice: start from one of the ready-made homes. */
function ReadyHomeEntry({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dh-ai-entry dh-ready-entry" onClick={onClick}>
      <Icon.home size={26} aria-hidden />
      <span>
        <strong>Pick a ready home</strong>
        <small>Choose from 8 homes, then make it yours.</small>
      </span>
      <Icon.right size={20} aria-hidden />
    </button>
  );
}

export function TitleScreen({
  onContinue,
  onNew,
  onSample,
  onOpen,
  onAi,
  onHomes,
}: {
  onContinue: () => void;
  onNew: () => void;
  onSample: () => void;
  onOpen: () => void;
  onAi: () => void;
  onHomes: () => void;
}) {
  const editor = useEditor();
  const { project, hasSavedProject, error, recovery, homes } = editor;
  const stats = projectStats(project);
  const primary = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // Keyboard users start on the main choice: Continue, or the first big card.
  useEffect(() => (primary.current ?? card.current?.querySelector<HTMLElement>(".dh-ai-entry"))?.focus(), []);
  const returning = hasSavedProject && error !== "saved-file-unreadable";
  return (
    <div className="dh-title-screen" role="dialog" aria-modal="false" aria-labelledby="dh-title-heading">
      <div className="dh-title-card" data-inset="auto" ref={card}>
        <div className="dh-title-brand">
          <BrandMark size={52} />
          <span>Dream Home</span>
        </div>
        {error === "saved-file-unreadable" && (
          <div className="dh-title-alert" role="alert">
            <Icon.warning size={20} aria-hidden />
            <p>{friendlyError(error)}</p>
            {recovery && (
              <Button
                variant="secondary"
                icon={Icon.download}
                onClick={() =>
                  download(
                    new Blob([recovery], { type: "application/json" }),
                    "dream-home-recovery.json",
                  )
                }
              >
                Recover saved file
              </Button>
            )}
          </div>
        )}
        {returning ? (
          <>
            <h2 id="dh-title-heading" className="dh-title-heading">
              Welcome back
            </h2>
            <div className="dh-title-project">
              <MiniPlan project={project} />
              <div>
                <strong>{project.name}</strong>
                <span>
                  {stats.bedrooms} bedroom{stats.bedrooms === 1 ? "" : "s"} ·{" "}
                  {project.floors.length} floor{project.floors.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <Button ref={primary} variant="primary" size="lg" full onClick={onContinue}>
              Continue my home
              <Icon.right size={20} aria-hidden />
            </Button>
            {homes.list.length > 1 && (
              <Button variant="secondary" size="lg" full icon={Icon.homes} onClick={onHomes}>
                My homes ({homes.list.length})
              </Button>
            )}
            <p className="dh-title-question">Or start another home:</p>
            <AiEntry onClick={onAi} />
            <ReadyHomeEntry onClick={onNew} />
          </>
        ) : (
          <>
            <h2 id="dh-title-heading" className="dh-title-heading">
              Build the home you keep imagining.
            </h2>
            <p className="dh-title-question">How would you like to start?</p>
            <AiEntry onClick={onAi} />
            <ReadyHomeEntry onClick={onNew} />
            <button type="button" className="dh-title-link" onClick={onSample}>
              <Icon.home size={18} aria-hidden />
              Just show me a sample home
            </button>
          </>
        )}
        <button type="button" className="dh-title-link" onClick={onOpen}>
          <Icon.upload size={18} aria-hidden />
          Open a saved file
        </button>
        <p className="dh-title-foot">
          <Icon.check size={16} aria-hidden /> No account. Saved on this device.
        </p>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="dh-gallery-stepper" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        <IconButton
          icon={Icon.minus}
          tone="plain"
          label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        />
        <strong className="dh-num" aria-live="polite">
          {value}
        </strong>
        <IconButton
          icon={Icon.add}
          tone="plain"
          label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        />
      </div>
    </div>
  );
}

export function TemplateGallery({
  onBack,
  onPreview,
  onBuild,
  onCustom,
  onAi,
}: {
  onBack: () => void;
  onPreview: (project: Project | null) => void;
  onBuild: (project: Project, template: Template) => void;
  onCustom: () => void;
  onAi: () => void;
}) {
  const [picked, setPicked] = useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === picked)!;
  const [plot, setPlot] = useState(template.plot);
  const [bedrooms, setBedrooms] = useState(template.request.bedrooms);
  const [floors, setFloors] = useState(template.request.floors);
  const choose = (t: Template) => {
    setPicked(t.id);
    setPlot(t.plot);
    setBedrooms(t.request.bedrooms);
    setFloors(t.request.floors);
  };
  const result = useMemo(
    () =>
      buildTemplate(template, {
        plot,
        bedrooms: template.tweak.bedrooms ? bedrooms : undefined,
        floors,
      }),
    [template, plot, bedrooms, floors],
  );
  const thumbnails = useMemo(
    () =>
      Object.fromEntries(
        TEMPLATES.map((t) => {
          const r = buildTemplate(t);
          return [t.id, r.ok ? r.project : null];
        }),
      ),
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => onPreview(result.ok ? result.project : null),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [result, onPreview]);
  return (
    <div
      className="dh-gallery"
      role="dialog"
      aria-modal="false"
      aria-label="Choose a starting home"
      data-inset="auto"
    >
      <div className="dh-gallery-head">
        <IconButton icon={Icon.left} tone="plain" label="Back" onClick={onBack} />
        <h2>Choose a starting home</h2>
        <span className="dh-gallery-count" aria-hidden>
          {TEMPLATES.length} homes ›
        </span>
      </div>
      <AiEntry onClick={onAi} />
      <div className="dh-gallery-cards" role="radiogroup" aria-label="Starting homes">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={picked === t.id}
            className="dh-template"
            onClick={() => choose(t)}
          >
            <span className="dh-template-art">
              {thumbnails[t.id] && <MiniPlan project={thumbnails[t.id]!} />}
            </span>
            <strong>{t.name}</strong>
            <small>{t.tagline}</small>
          </button>
        ))}
      </div>
      <div className="dh-gallery-tweaks">
        <label className="dh-field">
          <span>Plot size</span>
          <select
            aria-label="Plot size"
            value={`${plot.w}x${plot.d}`}
            onChange={(e) => {
              const [w, d] = e.target.value.split("x").map(Number);
              setPlot({ w, d });
            }}
          >
            {[...PLOT_SIZES, ...(PLOT_SIZES.some((p) => p.w === plot.w && p.d === plot.d) ? [] : [{ label: `${plot.w} × ${plot.d} ft`, ...plot }])].map((p) => (
              <option key={p.label} value={`${p.w}x${p.d}`}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {template.tweak.bedrooms && (
          <Stepper
            label="Bedrooms"
            value={bedrooms}
            min={template.tweak.bedrooms[0]}
            max={template.tweak.bedrooms[1]}
            onChange={setBedrooms}
          />
        )}
        {template.tweak.floors && template.tweak.floors[1] > template.tweak.floors[0] && (
          <Stepper
            label="Floors"
            value={floors}
            min={template.tweak.floors[0]}
            max={template.tweak.floors[1]}
            onChange={setFloors}
          />
        )}
      </div>
      {!result.ok && (
        <p className="dh-gallery-error" role="alert">
          {result.error.replace(/ Your counts have not been reduced\.?/, "")}
        </p>
      )}
      <div className="dh-gallery-actions">
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!result.ok}
          onClick={() => result.ok && onBuild(result.project, template)}
        >
          Build this home
          <Icon.sparkle size={20} aria-hidden />
        </Button>
        <button type="button" className="dh-title-link" onClick={onCustom}>
          <Icon.measure size={18} aria-hidden />
          Know your exact plot? Start with my plot
        </button>
      </div>
    </div>
  );
}

const TOUR = [
  {
    target: ".dh-scene-host",
    title: "This is your home!",
    body: "Tap any room to step inside and make it yours. Drag to spin the view; pinch or scroll to zoom.",
  },
  {
    target: "[data-chrome='palette']",
    title: "Four big buttons",
    body: "Add a room, style the outside, explore your home, or let AI design one for you.",
  },
  {
    target: "[data-chrome='topbar'] [role='toolbar']",
    title: "Nothing is ever lost",
    body: "Undo is always up here. Try anything — you can always go back.",
  },
];

export function CoachMarks({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const current = TOUR[step];
  useLayoutEffect(() => {
    const el = document.querySelector(current.target);
    setRect(el ? el.getBoundingClientRect() : null);
    card.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
  }, [current]);
  const last = step === TOUR.length - 1;
  const spotlight =
    rect && current.target !== ".dh-scene-host"
      ? {
          left: rect.left - 6,
          top: rect.top - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }
      : null;
  const below = !spotlight || spotlight.top < window.innerHeight / 2;
  return (
    <div className="dh-coach" role="dialog" aria-modal="false" aria-label="Quick tour">
      {spotlight && <div className="dh-coach-spot" style={spotlight} />}
      <div
        ref={card}
        className="dh-coach-card"
        style={
          spotlight
            ? below
              ? { top: Math.min(window.innerHeight - 220, spotlight.top + spotlight.height + 12) }
              : { bottom: window.innerHeight - spotlight.top + 12 }
            : { bottom: "calc(var(--dh-inset-bottom, 140px) + 16px)" }
        }
      >
        <span className="dh-kicker">
          Step {step + 1} of {TOUR.length}
        </span>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="dh-coach-actions">
          <Button variant="ghost" onClick={onDone}>
            Skip tour
          </Button>
          <Button data-primary variant="primary" onClick={() => (last ? onDone() : setStep(step + 1))}>
            {last ? "Start building" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
