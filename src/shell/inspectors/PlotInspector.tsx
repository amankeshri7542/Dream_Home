import { Dimension, Switch } from "../../components/Controls";
import { lazy, Suspense } from "react";
import { resizeBuilding } from "../../domain/builder";
import { projectStats, updatePlot } from "../../domain/model";
import { area, areaLabel, roadName } from "../../domain/display";
import type { Project } from "../../domain/types";
import { useEditor } from "../../editor/EditorProvider";
import { Icon } from "../../ui/icons";
import { Button, Field, Section, Segmented } from "../../ui/primitives";

const PlaceSection = lazy(() => import("../../insights/PlaceSection"));

export function PlotInspector() {
  const editor = useEditor();
  const { project, unit, run, commit, activeFloor, dispatch, setPrefs } = editor;
  const stats = projectStats(project);
  const useAvailable = () => {
    const { plot } = project;
    const { x, z } = activeFloor.footprint;
    const southBalcony = Math.max(
      0,
      ...project.floors.map((f) =>
        Math.max(0, ...f.balconies.filter((b) => b.edge === "south").map((b) => b.depth)),
      ),
    );
    run(
      resizeBuilding(project, activeFloor.id, {
        w: Math.floor((plot.width - plot.setback - x) / 10) * 10,
        d: Math.floor((plot.depth - plot.setback - z - southBalcony) / 10) * 10,
      }),
      "Grow the house to fill the plot",
      { notice: "The house grew! There’s room for more rooms now." },
    );
  };
  return (
    <div className="dh-inspector-body">
      <div className="dh-room-stat">
        <strong className="dh-num">
          {area(stats.plotArea, unit)}
          <small>{areaLabel(unit)}</small>
        </strong>
        <span>Plot area</span>
        <Segmented
          label="Measurements"
          value={unit}
          options={[
            { value: "ft", label: "ft" },
            { value: "m", label: "m" },
          ]}
          onChange={(value) => setPrefs({ unit: value })}
        />
      </div>
      <div className="field-pair">
        <Dimension
          label="Plot width"
          cm={project.plot.width}
          unit={unit}
          language="en"
          min={400}
          onChange={(width) => run(updatePlot(project, { width }), "Change plot width")}
        />
        <Dimension
          label="Plot depth"
          cm={project.plot.depth}
          unit={unit}
          language="en"
          min={400}
          onChange={(depth) => run(updatePlot(project, { depth }), "Change plot depth")}
        />
      </div>
      <Field label="Which side is the road?">
        <select
          aria-label="Which side is the road?"
          value={project.plot.road}
          onChange={(e) =>
            run(
              updatePlot(project, { road: e.target.value as Project["plot"]["road"] }),
              "Move the road",
            )
          }
        >
          {["south", "east", "north", "west"].map((side) => (
            <option key={side} value={side}>
              {roadName(side)}
            </option>
          ))}
        </select>
      </Field>
      <Section title="Where is it?" description="For the real sun and true directions" open>
        <Suspense fallback={<p className="dh-note">Loading…</p>}>
          <PlaceSection />
        </Suspense>
      </Section>
      <Section title="House size" description="Make room for more rooms" open>
        <Button icon={Icon.fitHome} full onClick={useAvailable}>
          Grow the house to fill the plot
        </Button>
        <div className="field-pair">
          <Dimension
            label="House width"
            cm={activeFloor.footprint.w}
            unit={unit}
            language="en"
            min={300}
            max={project.plot.width}
            onChange={(w) =>
              run(
                resizeBuilding(project, activeFloor.id, { w, d: activeFloor.footprint.d }),
                "Resize the building",
              )
            }
          />
          <Dimension
            label="House depth"
            cm={activeFloor.footprint.d}
            unit={unit}
            language="en"
            min={300}
            max={project.plot.depth}
            onChange={(d) =>
              run(
                resizeBuilding(project, activeFloor.id, { w: activeFloor.footprint.w, d }),
                "Resize the building",
              )
            }
          />
        </div>
        <p className="dh-note">
          Every floor grows or shrinks together; rooms stay where they are.
        </p>
      </Section>
      <Section title="Space around the home" description="Garden, path and parking">
        <Dimension
          label="Gap around the house"
          cm={project.plot.setback}
          unit={unit}
          language="en"
          max={2000}
          onChange={(setback) => run(updatePlot(project, { setback }), "Change the margin")}
        />
        <p className="dh-note">
          Just for sketching — an architect checks the real rule for your street.
        </p>
        <Switch
          label="Garden & green space"
          checked={project.garden}
          onChange={() => commit({ ...project, garden: !project.garden }, "Toggle garden")}
        />
        <Switch
          label="Open parking"
          description="Shown only where a car fits outside the home"
          checked={project.parking}
          onChange={() => commit({ ...project, parking: !project.parking }, "Toggle parking")}
        />
      </Section>
      <Button
        icon={Icon.auto}
        full
        onClick={() => dispatch({ type: "overlay", overlay: "start" })}
      >
        Find layouts for this plot
      </Button>
      <p className="dh-note">
        Changing the plot keeps your rooms. A new layout rearranges the whole
        home — Undo always brings this one back.
      </p>
    </div>
  );
}
