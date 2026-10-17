import { useEffect, useRef } from "react";
import { Switch } from "../components/Controls";
import { updatePlot } from "../domain/model";
import { STAGES } from "../domain/types";
import { floorName } from "../domain/display";
import { useEditor } from "../editor/EditorProvider";
import { Icon } from "../ui/icons";
import { Button, IconButton } from "../ui/primitives";

export function CameraHud() {
  const { state, dispatch } = useEditor();
  const camera = (command: Parameters<typeof dispatch>[0]) => dispatch(command);
  return (
    <div className="dh-camera-hud" role="toolbar" aria-label="View controls" data-chrome="camera">
      {state.mode !== "explore" && (
        <IconButton
          icon={Icon.floorPlan}
          label="Floor plan"
          pressed={state.lens}
          onClick={() => dispatch({ type: "lens", open: !state.lens })}
        />
      )}
      <IconButton
        icon={Icon.viewOptions}
        label="View options"
        aria-expanded={state.viewOptions}
        aria-haspopup="dialog"
        pressed={state.viewOptions}
        onClick={() => dispatch({ type: "view-options", open: !state.viewOptions })}
      />
      <IconButton
        icon={Icon.zoomIn}
        className="dh-zoom"
        label="Zoom in on home"
        onClick={() => camera({ type: "camera", command: { type: "dolly", factor: 0.8 } })}
      />
      <IconButton
        icon={Icon.zoomOut}
        className="dh-zoom"
        label="Zoom out of home"
        onClick={() => camera({ type: "camera", command: { type: "dolly", factor: 1.25 } })}
      />
      <IconButton
        icon={Icon.fitHome}
        label="Fit home"
        onClick={() =>
          camera({ type: "camera", command: { type: "fit", subject: "home", view: "hero" } })
        }
      />
    </div>
  );
}

export function ViewOptions() {
  const { state, dispatch, project, run, commit, setPrefs } = useEditor();
  const { view } = state;
  const ref = useRef<HTMLDivElement>(null);
  const setView = (patch: Partial<typeof view>) => dispatch({ type: "view", patch });
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const close = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest?.("[aria-label='View options'], [aria-label='Plan view options']"))
        dispatch({ type: "view-options", open: false });
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [dispatch]);
  const fit = (view: "hero" | "top" | "front", subject: "home" | "plot" = "home") =>
    dispatch({ type: "camera", command: { type: "fit", subject, view } });
  return (
    <div
      ref={ref}
      className="dh-popover dh-view-options"
      role="dialog"
      aria-label="View options"
    >
      <div className="dh-popover-head">
        <h2>See your home</h2>
        <IconButton
          icon={Icon.close}
          tone="plain"
          label="Close view options"
          onClick={() => dispatch({ type: "view-options", open: false })}
        />
      </div>
      <div className="dh-view-presets">
        <button
          type="button"
          onClick={() => {
            setView({ stage: 4, roof: false, cutaway: true, walls: true });
            fit("hero");
          }}
        >
          <Icon.showInside size={22} aria-hidden />
          See inside
        </button>
        <button
          type="button"
          onClick={() => {
            setView({ stage: 5, roof: true, cutaway: false, walls: true, floor: "all" });
            fit("hero");
          }}
        >
          <Icon.home size={22} aria-hidden />
          See outside
        </button>
        <button
          type="button"
          onClick={() => {
            setView({ stage: 4, roof: false, cutaway: true });
            fit("top");
          }}
          aria-label="Top view of home"
        >
          <Icon.topView size={22} aria-hidden />
          Top view
        </button>
        <button
          type="button"
          onClick={() => {
            setView({ stage: 5, roof: true, cutaway: false, floor: "all", walls: true });
            fit("front");
          }}
        >
          <Icon.building size={22} aria-hidden />
          Front view
        </button>
      </div>
      <Button
        icon={Icon.photo}
        variant="primary"
        full
        onClick={() => dispatch({ type: "overlay", overlay: "photo" })}
      >
        Take a photo
      </Button>
      <Button icon={Icon.video} full onClick={() => dispatch({ type: "overlay", overlay: "reel" })}>
        Make a video
      </Button>
      <Button
        icon={Icon.fitHome}
        full
        onClick={() => fit("hero", "plot")}
      >
        Fit entire plot
      </Button>
      <Button
        icon={Icon.hideControls}
        variant="ghost"
        full
        onClick={() => {
          dispatch({ type: "view-options", open: false });
          dispatch({ type: "chrome", hidden: true });
        }}
      >
        Hide controls
      </Button>
      <div className="dh-switches">
        <Switch
          label="Room names"
          checked={view.labels}
          onChange={() => setView({ labels: !view.labels })}
        />
        <Switch
          label="Furniture"
          description="Beds, sofas, counters and everyday objects"
          checked={view.furnishings !== false}
          onChange={() => setView({ furnishings: view.furnishings === false })}
        />
        <Switch
          label="Show inside"
          description="Cut the walls so you can look in"
          checked={view.cutaway && !view.roof}
          onChange={() =>
            setView({ cutaway: !(view.cutaway && !view.roof), roof: false, stage: 4 })
          }
        />
        <Switch
          label="Show the roof"
          checked={view.roof}
          onChange={() => setView({ roof: !view.roof, stage: !view.roof ? 5 : 4 })}
        />
        <Switch
          label="Street life"
          description="People, a cow and traffic on the road while you explore"
          checked={view.streetLife !== false}
          onChange={() => {
            const on = view.streetLife === false;
            setView({ streetLife: on });
            setPrefs({ streetLife: on });
          }}
        />
        <Switch
          label="Lived-in details"
          description="Shoes at the door, chai on the table, a sleeping cat while you explore"
          checked={view.livedIn !== false}
          onChange={() => {
            const on = view.livedIn === false;
            setView({ livedIn: on });
            setPrefs({ livedIn: on ? "lived-in" : "tidy" });
          }}
        />
      </div>
      <fieldset className="dh-finish-choices">
        <legend>Exterior finish</legend>
        {(
          [
            ["ivory", "Ivory plaster", "#ede5d3"],
            ["brick", "Warm brick", "#b5654a"],
            ["sand", "Sandstone", "#d8be95"],
          ] as const
        ).map(([finish, label, color]) => (
          <button
            key={finish}
            type="button"
            aria-pressed={(project.finish ?? "ivory") === finish && !project.style?.exterior}
            onClick={() => {
              const { exterior: _exterior, ...style } = project.style ?? {};
              void _exterior;
              commit(
                {
                  ...project,
                  finish,
                  ...(Object.keys(style).length ? { style } : {}),
                },
                `Use ${label.toLowerCase()} outside`,
              );
              setView({ stage: 5, roof: true, cutaway: false, walls: true, floor: "all" });
              fit("hero");
            }}
          >
            <i style={{ background: color }} />
            {label}
          </button>
        ))}
      </fieldset>
      <details className="dh-section">
        <summary>
          <span>
            <strong>How a home takes shape</strong>
          </span>
        </summary>
        <div className="dh-section-body">
          <div className="dh-stage-grid" role="group" aria-label="Construction stage">
            {STAGES.map((stage, i) => (
              <button
                key={stage}
                type="button"
                aria-pressed={view.stage === i}
                onClick={() => setView({ stage: i, roof: i === 5 })}
              >
                <i>{i + 1}</i>
                {stage === "Slabs" ? "Floors" : stage}
              </button>
            ))}
          </div>
          <p className="dh-note">
            An illustrative sequence. It does not check strength, materials or
            construction methods.
          </p>
        </div>
      </details>
      <details className="dh-section">
        <summary>
          <span>
            <strong>More view controls</strong>
          </span>
        </summary>
        <div className="dh-section-body">
          <Switch label="Walls" checked={view.walls} onChange={() => setView({ walls: !view.walls })} />
          <Switch
            label="Doors & windows"
            checked={view.openings}
            onChange={() => setView({ openings: !view.openings })}
          />
          <Switch
            label="Landscape"
            checked={view.landscape}
            onChange={() => setView({ landscape: !view.landscape })}
          />
          <label className="dh-field">
            <span>North direction</span>
            <select
              value={project.plot.north}
              onChange={(e) =>
                run(updatePlot(project, { north: Number(e.target.value) }), "Change north direction")
              }
            >
              {[...new Set([project.plot.north, 0, 90, 180, 270])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}°
                  </option>
                ))}
            </select>
            <small>Turns the sun’s path. Orientation reference only.</small>
          </label>
        </div>
      </details>
    </div>
  );
}

export function FloorSwitcher() {
  const { project, state, dispatch } = useEditor();
  if (project.floors.length < 2 || state.mode === "explore") return null;
  const floors = [...project.floors].reverse();
  const index = project.floors.findIndex((f) => f.id === state.view.floor);
  const go = (delta: number) => {
    const next =
      index < 0 ? (delta > 0 ? 0 : project.floors.length - 1) : index + delta;
    const floor = project.floors[next];
    if (floor) dispatch({ type: "choose-floor", floor: floor.id });
  };
  return (
    <div className="dh-floors" data-chrome="floors">
      <IconButton
        icon={Icon.floorUp}
        tone="plain"
        label="Go up a floor"
        disabled={index === project.floors.length - 1}
        onClick={() => go(1)}
      />
      <div className="dh-floor-list" role="radiogroup" aria-label="Visible floor">
        {floors.map((floor) => {
          const i = project.floors.indexOf(floor);
          return (
            <button
              key={floor.id}
              type="button"
              role="radio"
              aria-checked={state.view.floor === floor.id}
              aria-label={floorName(i)}
              title={floorName(i)}
              onClick={() => dispatch({ type: "choose-floor", floor: floor.id })}
            >
              {i === 0 ? "G" : i}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={state.view.floor === "all"}
          aria-label="Whole home"
          title="Whole home"
          className="dh-floor-all"
          onClick={() => dispatch({ type: "choose-floor", floor: "all" })}
        >
          All
        </button>
      </div>
      <IconButton
        icon={Icon.floorDown}
        tone="plain"
        label="Go down a floor"
        disabled={index === 0}
        onClick={() => go(-1)}
      />
    </div>
  );
}
