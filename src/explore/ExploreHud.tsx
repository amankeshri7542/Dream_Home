import { useEffect, useState } from "react";
import { useEditor } from "../editor/EditorProvider";
import type { QualitySetting } from "../editor/types";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { Joystick } from "./Joystick";
import { requestFloor, walkInput } from "./walkInput";
import { MiniPlan } from "./MiniPlan";
import { dayOfYear, shortDate, sunCalendar } from "../insights/solar";
import "./explore.css";

export const HOUR_PRESETS = [
  { label: "Morning", hour: 8.5, icon: Icon.day },
  { label: "Midday", hour: 12.5, icon: Icon.day },
  { label: "Golden hour", hour: 17.25, icon: Icon.golden },
  { label: "Night", hour: 21.5, icon: Icon.night },
] as const;

export function hourText(hour: number) {
  const h = Math.floor(hour) % 24,
    m = Math.round((hour - Math.floor(hour)) * 60);
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  const mood =
    hour < 6 || hour >= 20.5
      ? "Night"
      : hour < 8
        ? "Dawn"
        : hour < 11
          ? "Morning"
          : hour < 15.5
            ? "Midday"
            : hour < 19
              ? "Golden hour"
              : "Dusk";
  return `${mood}, ${label}`;
}

/** The dark, cinematic HUD for admiring the finished home. */
export function ExploreHud({
  onPhoto,
  onVideo,
  walkAvailable,
  walkStatus,
  walkFloorId,
}: {
  onPhoto: () => void;
  onVideo: () => void;
  walkAvailable: boolean;
  walkStatus?: string;
  /** The floor the visitor is on, for the up/down buttons. */
  walkFloorId?: string;
}) {
  const { state, dispatch, project } = useEditor();
  const walking = state.explore === "walk";
  const [quality, setQuality] = useState(false);
  // A quiet walk: the time panel folds to a sun chip, and the plan opens only when asked for.
  const [timeOpen, setTimeOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // Mouse look is for a desk: a mouse and a screen wide enough to have one.
  const finePointer = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine) and (min-width: 600px)").matches;
  useEffect(() => {
    if (!walking) {
      setTimeOpen(false);
      setPlanOpen(false);
    }
  }, [walking]);
  useEffect(() => {
    if (!quality) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(".dh-quality")) setQuality(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [quality]);
  const back = () => dispatch({ type: "set-mode", mode: state.lastEditMode });
  const walkIndex = Math.max(0, project.floors.findIndex((f) => f.id === walkFloorId));
  return (
    <div className="dh-explore" data-theme="hud" data-chrome="explore">
      <div className="dh-explore-top" data-inset="top">
        {/* "Home" with a house, like the room's and Outside's way back. */}
        <Button variant="secondary" icon={Icon.home} className="dh-hud-btn" aria-label="Back to home" onClick={back}>
          Home
        </Button>
        {/* Labelled where there's room (tablets and up); icons on phones. */}
        <div className="dh-explore-top-actions">
          <Button variant="secondary" icon={Icon.photo} className="dh-hud-btn dh-hud-labelled" aria-label="Take a photo" onClick={onPhoto}>
            <span>Photo</span>
          </Button>
          <Button variant="secondary" icon={Icon.video} className="dh-hud-btn dh-hud-labelled" aria-label="Make a video" onClick={onVideo}>
            <span>Video</span>
          </Button>
          <div className="dh-quality">
            <Button
              variant="secondary"
              icon={Icon.quality}
              className="dh-hud-btn dh-hud-labelled"
              aria-label="Picture quality"
              aria-expanded={quality}
              aria-haspopup="menu"
              onClick={() => setQuality(!quality)}
            >
              <span>Quality</span>
            </Button>
            {quality && (
              <div className="dh-hud-menu" role="menu" aria-label="Picture quality">
                {(
                  [
                    ["auto", "Automatic", "Best for this device"],
                    ["battery", "Battery saver", "Simple and smooth"],
                    ["balanced", "Balanced", "Soft shadows and depth"],
                    ["beautiful", "Beautiful", "Every last detail"],
                  ] as [QualitySetting, string, string][]
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={state.quality === value}
                    onClick={() => {
                      dispatch({ type: "quality", quality: value });
                      setQuality(false);
                    }}
                  >
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {walking && planOpen && (
        <MiniPlan project={project} floorId={walkFloorId} onChosen={() => setPlanOpen(false)} />
      )}
      {walking && (
        <div className="dh-walk">
          <div className="dh-walk-tools">
            <Button
              variant="secondary"
              className="dh-hud-btn"
              icon={Icon.floorPlan}
              aria-expanded={planOpen}
              onClick={() => setPlanOpen(!planOpen)}
            >
              Plan
            </Button>
            {finePointer && (
              <Button variant="secondary" className="dh-hud-btn" icon={Icon.orbitView} onClick={() => walkInput.lockPointer?.()}>
                Look with the mouse
              </Button>
            )}
          </div>
          <Joystick />
          <p className="dh-walk-hint">
            {walkStatus ? <strong aria-live="polite">{walkStatus}</strong> : null}
            <span className="dh-walk-tip-long">
              Drag to look around · tap the floor to walk there · W A S D on a keyboard
            </span>
            <span className="dh-walk-tip-short">Drag to look · tap the floor to walk</span>
          </p>
          {project.floors.length > 1 && (
            <div className="dh-walk-floors">
              <Button
                variant="secondary"
                className="dh-hud-btn"
                icon={Icon.floorUp}
                disabled={walkIndex >= project.floors.length - 1}
                onClick={() => requestFloor(1)}
              >
                <span className="dh-walk-floor-text">Up a floor</span>
              </Button>
              <Button
                variant="secondary"
                className="dh-hud-btn"
                icon={Icon.floorDown}
                disabled={walkIndex <= 0}
                onClick={() => requestFloor(-1)}
              >
                <span className="dh-walk-floor-text">Down a floor</span>
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="dh-explore-bottom" data-inset="bottom">
        {walking && !timeOpen ? (
          <button type="button" className="dh-sun-chip" aria-expanded={false} aria-label={`Time of day: ${hourText(state.hour)}. Change it`} onClick={() => setTimeOpen(true)}>
            <Icon.day size={18} aria-hidden />
            <span className="dh-num">{hourText(state.hour)}</span>
          </button>
        ) : (
        <div className="dh-time">
          <div className="dh-time-row">
            <Icon.day size={18} aria-hidden />
            <input
              type="range"
              aria-label="Time of day"
              aria-valuetext={hourText(state.hour)}
              min={5}
              max={23}
              step={0.25}
              value={state.hour}
              onChange={(e) => dispatch({ type: "hour", hour: Number(e.target.value) })}
            />
            <Icon.night size={18} aria-hidden />
            <output className="dh-num">{hourText(state.hour)}</output>
          </div>
          <div className="dh-time-row">
            <Icon.sunlight size={18} aria-hidden />
            <input
              type="range"
              aria-label="Day of the year"
              aria-valuetext={shortDate(sunCalendar(state.season, state.sunDay))}
              min={1}
              max={365}
              step={1}
              value={dayOfYear(sunCalendar(state.season, state.sunDay))}
              onChange={(e) => dispatch({ type: "sun-day", day: Number(e.target.value) })}
            />
            <output className="dh-num">{shortDate(sunCalendar(state.season, state.sunDay))}</output>
          </div>
          <div className="dh-time-presets" role="group" aria-label="Time of day presets">
            {HOUR_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={Math.abs(state.hour - p.hour) < 0.3}
                onClick={() => dispatch({ type: "hour", hour: p.hour })}
              >
                <p.icon size={16} aria-hidden />
                {p.label}
              </button>
            ))}
          </div>
          {walking && (
            <button type="button" className="dh-sun-fold" onClick={() => setTimeOpen(false)}>
              Done
            </button>
          )}
        </div>
        )}
        <div className="dh-explore-views" role="radiogroup" aria-label="How to explore">
          <button
            type="button"
            role="radio"
            aria-checked={state.explore === "orbit"}
            onClick={() => dispatch({ type: "explore", view: "orbit" })}
          >
            <Icon.orbitView size={20} aria-hidden />
            Look around
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={state.explore === "showcase"}
            onClick={() => dispatch({ type: "explore", view: "showcase" })}
          >
            <Icon.turntable size={20} aria-hidden />
            Turntable
          </button>
          {walkAvailable && (
            <button
              type="button"
              role="radio"
              aria-checked={state.explore === "walk"}
              onClick={() => dispatch({ type: "explore", view: "walk" })}
            >
              <Icon.walk size={20} aria-hidden />
              Walk inside
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
