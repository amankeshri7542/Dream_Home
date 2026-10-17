// The page a share link opens (/h/:id): the home turning slowly in golden
// light, a walk inside, and two ways in — remix this home, or design your own.
// It never mounts the editor, so it can't touch the visitor's own homes until
// they choose Remix.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../domain/types";
import { BADGES, homeScore } from "../insights/score";
import { useVastuScore } from "../insights/useVastu";
import { isoDate, today } from "../insights/solar";
import "../insights/insights.css";
import { DEFAULT_VIEW, GOLDEN_HOUR } from "../editor/state";
import { useChromeInsets, useReducedMotion } from "../editor/hooks";
import { Joystick } from "../explore/Joystick";
import { requestFloor } from "../explore/walkInput";
import { deviceHomeStore } from "../homes/store";
import { BrandMark } from "../ui/BrandMark";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { countRemix, countView, fetchShare, reportShare, type SharedMeta } from "./api";
import { parseShared } from "./parse";
import { REMIX_PROBLEMS, inAppBrowser, remixIntoMyHomes, remixOf, type RemixOutcome } from "./remix";
import "../shell/shell.css";
import "../explore/explore.css";
import "./share.css";

const Scene = lazy(() => import("../scene/Scene"));
const Walkthrough = lazy(() => import("../explore/Walkthrough"));


type Loaded = { project: Project; meta: SharedMeta; simplified: boolean };
type State = { kind: "loading" } | { kind: "missing" } | { kind: "offline"; message: string } | ({ kind: "ready" } & Loaded);

export default function ViewerApp({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const insets = useChromeInsets(root);
  const reduced = useReducedMotion();
  const [walking, setWalking] = useState(false);
  const [place, setPlace] = useState("");
  const [walkFloor, setWalkFloor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "in-app" | "replace" | "problem" | "report" | "reported">(null);
  // Escape closes the open sheet, as everywhere else.
  useEffect(() => {
    if (!sheet) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sheet]);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const desktop = useMemo(() => window.matchMedia?.("(min-width: 900px)").matches ?? false, []);

  useEffect(() => {
    if (!/^[A-Za-z0-9]{10}$/.test(id)) return setState({ kind: "missing" });
    let live = true;
    void fetchShare(id).then((res) => {
      if (!live) return;
      if (!res.ok) {
        setState(res.reason === "missing" || res.reason === "invalid" ? { kind: "missing" } : { kind: "offline", message: res.message });
        return;
      }
      try {
        const { project, simplified } = parseShared(res.project);
        setState({ kind: "ready", project, meta: res.meta, simplified });
        document.title = `${project.name} — Dream Home`;
        void countView(id);
      } catch {
        setState({ kind: "missing" });
      }
    });
    return () => {
      live = false;
    };
  }, [id]);

  const remix = useCallback(
    async (replaceIfNeeded = false) => {
      if (state.kind !== "ready" || busy) return;
      setBusy(true);
      const outcome: RemixOutcome = await remixIntoMyHomes(remixOf(state.project, { id, name: state.meta.name }), {
        store: deviceHomeStore(),
        replaceIfNeeded,
      });
      if (outcome === "ok") {
        await Promise.race([countRemix(id), new Promise((r) => setTimeout(r, 1500))]);
        window.location.assign("/");
        return;
      }
      setBusy(false);
      if (outcome === "unsupported") return setSheet("replace");
      setProblem(REMIX_PROBLEMS[outcome]);
      setSheet("problem");
    },
    [busy, id, state],
  );
  const startRemix = () => (inAppBrowser() ? setSheet("in-app") : void remix());

  const firstFloor = state.kind === "ready" ? state.project.floors[0].id : "";
  const view = walking
    ? {
        ...DEFAULT_VIEW,
        floor: "all" as const,
        stage: 5,
        roof: true,
        cutaway: false,
        labels: false,
        walls: true,
        furnishings: true,
        // The floor the visitor is on shows its furniture under the roof.
        walkFloorId: walkFloor ?? firstFloor,
      }
    : { ...DEFAULT_VIEW, stage: 5, roof: true, cutaway: false, labels: false };

  return (
    <div ref={setRoot} className={`dh-app dh-viewer ${desktop ? "is-desktop" : "is-compact"}`}>
      <header className="dh-viewer-top" data-inset="top">
        <a className="dh-viewer-brand" href="/" aria-label="Dream Home — design your own home">
          <BrandMark size={36} />
          <span>Dream Home</span>
        </a>
        {state.kind === "ready" && (
          <IconButton icon={Icon.warning} tone="plain" label="Report this home" onClick={() => setSheet("report")} />
        )}
      </header>

      {state.kind === "ready" && (
        <div className="dh-scene-host model-canvas mode-3d">
          <div className="scene-pane">
            <Suspense fallback={<Poster id={id} meta={state.meta} />}>
              <Scene
                project={state.project}
                view={view}
                mode="explore"
                selection={null}
                onSelect={() => undefined}
                insets={insets}
                hour={GOLDEN_HOUR}
                sunDate={isoDate(today())}
                quality="auto"
                explore={walking ? "walk" : "showcase"}
                areaUnit="ft"
              >
                {walking && (
                  <Suspense fallback={null}>
                    <Walkthrough
                      project={state.project}
                      startFloorId={state.project.floors[0].id}
                      reducedMotion={reduced}
                      onStatus={({ floorId, roomId }) => {
                        setWalkFloor(floorId);
                        const floor = state.project.floors.find((f) => f.id === floorId);
                        setPlace(floor?.rooms.find((r) => r.id === roomId)?.name ?? "Hallway");
                      }}
                    />
                  </Suspense>
                )}
              </Scene>
            </Suspense>
          </div>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="dh-viewer-loading" role="status">
          <BrandMark size={44} />
          <span>Opening the home…</span>
        </div>
      )}

      {(state.kind === "missing" || state.kind === "offline") && (
        <div className="dh-viewer-card is-message" data-inset="bottom" role="alert">
          <h1>{state.kind === "missing" ? "This home isn’t available" : "Couldn’t open this home"}</h1>
          <p>
            {state.kind === "missing"
              ? "The link may have been turned off by the person who shared it."
              : state.message}
          </p>
          <Button variant="primary" size="lg" full icon={Icon.home} onClick={() => window.location.assign("/")}>
            Design your own home
          </Button>
        </div>
      )}

      {state.kind === "ready" && !walking && (
        <section className="dh-viewer-card" data-inset="bottom" aria-label={state.project.name}>
          <h1>{state.project.name}</h1>
          <p className="dh-viewer-meta">
            {state.project.floors.length} floor{state.project.floors.length === 1 ? "" : "s"} · designed on Dream Home
            {state.meta.remixOf && (
              <>
                {" "}
                · remixed from <a href={`/h/${state.meta.remixOf.id}`}>{state.meta.remixOf.name}</a>
              </>
            )}
          </p>
          {state.project.plot.location && (
            <p className="dh-viewer-meta">
              <Icon.location size={15} aria-hidden /> {state.project.plot.location.city}
            </p>
          )}
          <ViewerScore project={state.project} />
          {state.simplified && <p className="dh-viewer-note">Some newer details look simpler here.</p>}
          <div className="dh-viewer-actions">
            <Button variant="primary" size="lg" icon={Icon.sparkle} disabled={busy} onClick={startRemix}>
              Remix this home
            </Button>
            <Button variant="secondary" size="lg" icon={Icon.walk} onClick={() => setWalking(true)}>
              Walk inside
            </Button>
          </div>
          <button type="button" className="dh-viewer-link" onClick={() => window.location.assign("/")}>
            <Icon.home size={18} aria-hidden />
            Design my own home
          </button>
        </section>
      )}

      {state.kind === "ready" && walking && (
        <div className="dh-viewer-walk" data-inset="bottom">
          <div className="dh-walk">
            <Joystick />
            <div className="dh-walk-hint" aria-live="polite">
              <strong>{place || "Inside the home"}</strong>
              <span>Drag to look · joystick to walk</span>
            </div>
            {state.project.floors.length > 1 && (
              <div className="dh-walk-floors">
                <IconButton icon={Icon.up} label="Go up a floor" onClick={() => requestFloor(1)} />
                <IconButton icon={Icon.down} label="Go down a floor" onClick={() => requestFloor(-1)} />
              </div>
            )}
          </div>
          <Button variant="secondary" size="lg" full icon={Icon.left} onClick={() => setWalking(false)}>
            Back outside
          </Button>
        </div>
      )}

      {sheet && state.kind === "ready" && (
        <div className="dh-viewer-sheet" role="dialog" aria-modal="true" aria-labelledby="dh-viewer-sheet-title">
          <div className="dh-viewer-card">
            {sheet === "in-app" && (
              <>
                <h2 id="dh-viewer-sheet-title">Open in your browser to keep it</h2>
                <p>Apps like Instagram open links in their own browser, which can forget your home. Open this link in Chrome or Safari first.</p>
                <Button variant="primary" size="lg" full onClick={() => void navigator.clipboard?.writeText(window.location.href)}>
                  Copy the link
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => (setSheet(null), void remix())}>
                  Remix here anyway
                </Button>
              </>
            )}
            {sheet === "replace" && (
              <>
                <h2 id="dh-viewer-sheet-title">Replace your home here?</h2>
                <p>{REMIX_PROBLEMS.unsupported} Save a backup of it first if you want to keep it.</p>
                <Button variant="primary" size="lg" full onClick={() => (setSheet(null), void remix(true))}>
                  Replace with the remix
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => setSheet(null)}>
                  Not now
                </Button>
              </>
            )}
            {sheet === "problem" && (
              <>
                <h2 id="dh-viewer-sheet-title">Couldn’t remix yet</h2>
                <p>{problem}</p>
                <Button variant="primary" size="lg" full onClick={() => window.location.assign("/")}>
                  Open Dream Home
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => setSheet(null)}>
                  Close
                </Button>
              </>
            )}
            {sheet === "report" && (
              <>
                <h2 id="dh-viewer-sheet-title">Is something wrong with this home?</h2>
                <p>If its name or contents are offensive or a scam, tell us and we’ll take a look.</p>
                <Button
                  variant="danger"
                  size="lg"
                  full
                  onClick={async () => {
                    await reportShare(id);
                    setSheet("reported");
                  }}
                >
                  Report this home
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => setSheet(null)}>
                  Close
                </Button>
              </>
            )}
            {sheet === "reported" && (
              <>
                <h2 id="dh-viewer-sheet-title">Thank you</h2>
                <p>We’ll take a look. Homes reported by several people are hidden.</p>
                <Button variant="secondary" size="lg" full onClick={() => setSheet(null)}>
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The home's score and badges: something to be proud of when it's shared. */
function ViewerScore({ project }: { project: Project }) {
  const vastu = useVastuScore(project);
  const score = useMemo(() => homeScore(project, { shared: true, vastu }), [project, vastu]);
  return (
    <div className="dh-viewer-score" aria-label={`Home score ${score.score} out of 100`}>
      <strong className="dh-num">Home score {score.score}</strong>
      <ul className="dh-badges">
        {score.badges.map((id) => (
          <li key={id} className="is-earned">
            <Icon.badge size={15} aria-hidden />
            {BADGES[id].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The share's picture, shown at once while the 3D home loads. */
function Poster({ id, meta }: { id: string; meta: SharedMeta }) {
  return (
    <div className="dh-viewer-poster" role="status">
      {meta.image && <img src={`/api/share/${id}/image?v=${meta.updatedAt}`} alt="" />}
      <span>Opening {meta.name} in 3D…</span>
    </div>
  );
}
