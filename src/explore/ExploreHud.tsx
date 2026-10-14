import { useEffect, useState } from "react";
import { useEditor } from "../editor/EditorProvider";
import type { QualitySetting } from "../editor/types";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";
import { Joystick } from "./Joystick";
import { requestFloor } from "./walkInput";
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
  walkAvailable,
  walkStatus,
  walkFloorId,
}: {
  onPhoto: () => void;
  walkAvailable: boolean;
  walkStatus?: string;
  /** The floor the visitor is on, for the up/down buttons. */
  walkFloorId?: string;
}) {
  const { state, dispatch, project } = useEditor();
  const walking = state.explore === "walk";
  const [quality, setQuality] = useState(false);
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
        <Button variant="secondary" icon={Icon.left} className="dh-hud-btn" onClick={back}>
          Back to building
        </Button>
        <div className="dh-explore-top-actions">
          <IconButton icon={Icon.photo} tone="hud" label="Take a photo" onClick={onPhoto} />
          <div className="dh-quality">
            <IconButton
              icon={Icon.quality}
              tone="hud"
              label="Picture quality"
              aria-expanded={quality}
              aria-haspopup="menu"
              onClick={() => setQuality(!quality)}
            />
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
      {walking && (
        <div className="dh-walk">
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
        </div>
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
