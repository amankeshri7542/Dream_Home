import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  House,
  Leaf,
  Sun,
  X,
} from "lucide-react";
import { recommendHomes } from "../domain/starters";
import type { HomeStyle, StarterRequest } from "../domain/starters";
import type { Project } from "../domain/types";
import { ROOM_META } from "../domain/types";
import {
  area,
  areaLabel,
  roadName,
  fromDisplay,
  length,
  toDisplay,
  unitLabel,
} from "../domain/display";
import type { Language, Unit } from "../domain/display";
import { projectStats } from "../domain/model";

export function MiniPlan({ project }: { project: Project }) {
  const f = project.floors[0];
  return (
    <svg
      viewBox={`0 0 ${project.plot.width} ${project.plot.depth}`}
      aria-hidden="true"
    >
      <rect
        width={project.plot.width}
        height={project.plot.depth}
        rx="20"
        fill="#dae6d5"
      />
      <rect
        x={f.footprint.x}
        y={f.footprint.z}
        width={f.footprint.w}
        height={f.footprint.d}
        fill="#fffdf5"
        stroke="#748c7b"
        strokeWidth="12"
      />
      {f.rooms.map((r) => (
        <rect
          key={r.id}
          x={r.bounds.x}
          y={r.bounds.z}
          width={r.bounds.w}
          height={r.bounds.d}
          fill={ROOM_META[r.kind].color}
          stroke="#fbfaf4"
          strokeWidth="10"
        />
      ))}
      {f.voids.map((v) => (
        <rect
          key={v.id}
          x={v.bounds.x}
          y={v.bounds.z}
          width={v.bounds.w}
          height={v.bounds.d}
          fill={v.kind === "courtyard" ? "#84a477" : "#d3d7ce"}
          stroke="#748c7b"
          strokeWidth="7"
        />
      ))}
    </svg>
  );
}

export default function GuidedStart({
  project,
  unit: initialUnit,
  onClose,
  onUse,
}: {
  project: Project;
  language: Language;
  unit: Unit;
  onClose: () => void;
  onUse: (project: Project, unit: Unit) => void;
}) {
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [width, setWidth] = useState(
    String(Number(toDisplay(project.plot.width, initialUnit).toFixed(1))),
  );
  const [depth, setDepth] = useState(
    String(Number(toDisplay(project.plot.depth, initialUnit).toFixed(1))),
  );
  const [margin, setMargin] = useState(
    String(Number(toDisplay(project.plot.setback, "ft").toFixed(1))),
  );
  const [bedrooms, setBedrooms] = useState<1 | 2 | 3>(
    Math.min(3, Math.max(1, projectStats(project).bedrooms)) as 1 | 2 | 3,
  );
  const [floors, setFloors] = useState<1 | 2>(
    project.floors.length > 1 ? 2 : 1,
  );
  const [preferCourtyard, setPreferCourtyard] = useState(false);
  const [road, setRoad] = useState<Project["plot"]["road"]>("south");
  const [chosen, setChosen] = useState<HomeStyle | null>(null);
  const w = fromDisplay(Number(width), unit),
    d = fromDisplay(Number(depth), unit);
  const marginCm = Math.round(fromDisplay(Number(margin), "ft") / 10) * 10;
  const valid =
    width !== "" &&
    depth !== "" &&
    Number.isFinite(w) &&
    Number.isFinite(d) &&
    w >= 400 &&
    d >= 400 &&
    w <= 10000 &&
    d <= 10000 &&
    margin !== "" &&
    Number.isFinite(marginCm) &&
    marginCm >= 0 &&
    marginCm <= 500;
  const request: StarterRequest = useMemo(
    () => ({ widthCm: w, depthCm: d, road, marginCm, bedrooms, floors }),
    [w, d, road, marginCm, bedrooms, floors],
  );
  const options = useMemo(
    () => (valid ? recommendHomes(request) : []),
    [request, valid],
  );
  const preferred = preferCourtyard ? "courtyard" : "family";
  const recommended =
    options.find((o) => o.id === preferred && o.project) ??
    options.find((o) => o.project);
  const selected = options.find((o) => o.id === (chosen ?? recommended?.id));
  const styleName = (id: HomeStyle) =>
    id === "family"
      ? "Everyday family home"
      : id === "courtyard"
        ? "A home with an aangan"
        : "A little more open space";
  function switchUnit(next: Unit) {
    if (next === unit) return;
    setWidth(String(Number(toDisplay(w, next).toFixed(1))));
    setDepth(String(Number(toDisplay(d, next).toFixed(1))));
    setUnit(next);
  }
  return (
    <div className="guided-content">
      <div className="sheet-heading">
        <button
          className="round-button"
          aria-label={"Go back"}
          onClick={() => (step ? setStep(step - 1) : onClose())}
        >
          <ArrowLeft size={21} />
        </button>
        <span className="step-caption">{"A home that starts with you"}</span>
        <button
          className="round-button"
          aria-label={"Close setup"}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="step-progress" aria-label={`Step ${step + 1} of 3`}>
        {["Your plot", "Your needs", "Your options"].map((s, i) => (
          <span key={i} className={step >= i ? "done" : ""}>
            <i>{step > i ? <Check size={12} /> : i + 1}</i>
            {s}
          </span>
        ))}
      </div>
      <div className="guided-body">
        {step === 0 && (
          <>
            <div className="section-kicker">{"LET’S START WITH THE LAND"}</div>
            <h2>{"How big is your plot?"}</h2>
            <p className="supporting">
              {"Use the side measurements from your plot papers."}
            </p>
            <div className="plot-entry">
              <div className="plot-sketch">
                <span className="sketch-width">
                  {width || "—"} {unitLabel(unit)}
                </span>
                <div className="sketch-land">
                  <House size={30} strokeWidth={1} />
                  <small>
                    {width && depth
                      ? `${area((w * d) / 10000, unit)} ${areaLabel(unit)}`
                      : "—"}
                  </small>
                </div>
                <span className="sketch-depth">
                  {depth || "—"} {unitLabel(unit)}
                </span>
                <span className={`sketch-road road-${road}`}>
                  {roadName(road)}
                </span>
              </div>
              <div className="plot-fields">
                <div className="unit-switch" aria-label={"Measurement unit"}>
                  <button
                    aria-pressed={unit === "ft"}
                    onClick={() => switchUnit("ft")}
                  >
                    {"Feet"}
                  </button>
                  <button
                    aria-pressed={unit === "m"}
                    onClick={() => switchUnit("m")}
                  >
                    {"Metres"}
                  </button>
                </div>
                <label className="big-field">
                  {"Plot width"}
                  <div>
                    <input
                      aria-label={"Plot width"}
                      type="number"
                      inputMode="decimal"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                    />
                    <span>{unitLabel(unit)}</span>
                  </div>
                </label>
                <label className="big-field">
                  {"Plot depth"}
                  <div>
                    <input
                      aria-label={"Plot depth"}
                      type="number"
                      inputMode="decimal"
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                    />
                    <span>{unitLabel(unit)}</span>
                  </div>
                </label>
              </div>
            </div>
            <span className="field-caption">{"Or try an example size"}</span>
            <div className="size-chips">
              {[
                [20, 40],
                [30, 40],
                [30, 50],
                [40, 60],
              ].map(([a, b]) => (
                <button
                  key={a + "-" + b}
                  onClick={() => {
                    setWidth(
                      String(
                        Number(
                          toDisplay(fromDisplay(a, "ft"), unit).toFixed(1),
                        ),
                      ),
                    );
                    setDepth(
                      String(
                        Number(
                          toDisplay(fromDisplay(b, "ft"), unit).toFixed(1),
                        ),
                      ),
                    );
                  }}
                >
                  {a} × {b}
                  <small> ft</small>
                </button>
              ))}
            </div>
            <details className="plain-details">
              <summary>
                {"Road side & open margin"}
                <ChevronDown size={16} />
              </summary>
              <label className="select-label">
                {"Road along the plot"}
                <select
                  value={road}
                  onChange={(e) =>
                    setRoad(e.target.value as Project["plot"]["road"])
                  }
                >
                  <option value="south">{"Front / bottom of plan"}</option>
                  <option value="east">{"Right"}</option>
                  <option value="north">{"Back / top of plan"}</option>
                  <option value="west">{"Left"}</option>
                </select>
              </label>
              <label className="big-field">
                {"Open margin on each side (ft)"}
                <input
                  type="number"
                  aria-label={"Open margin in feet"}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                />
              </label>
              <p className="field-note">
                {
                  "This margin is a sketch assumption, not a local setback requirement. Confirm the required space with your local architect."
                }
              </p>
            </details>
            <p className="local-note">
              {
                "Know the area in katha or dhur? Use measured sides here—local conversions vary."
              }
            </p>
            {!valid && (
              <p className="inline-error" role="status">
                {
                  "Enter both sides between 4 and 100 metres and a valid open margin."
                }
              </p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <div className="section-kicker">{"ROOM FOR YOUR EVERYDAY"}</div>
            <h2>{"What feels like home?"}</h2>
            <p className="supporting">
              {"Just the essentials for now. You can change things later."}
            </p>
            <div className="choice-section">
              <h3>{"Bedrooms in the whole home"}</h3>
              <div className="number-options">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    aria-pressed={bedrooms === n}
                    onClick={() => setBedrooms(n)}
                  >
                    <strong>{n}</strong>
                    <span>{n === 1 ? "bedroom" : "bedrooms"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="choice-section">
              <h3>{"How many floors?"}</h3>
              <div className="floor-options">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    aria-pressed={floors === n}
                    onClick={() => setFloors(n)}
                  >
                    <span className={`floor-picture floor-picture-${n}`}>
                      <i />
                      {n === 2 && <i />}
                    </span>
                    <strong>
                      {n === 1 ? "Ground floor only" : "Ground + one"}
                    </strong>
                    <small>
                      {n === 1
                        ? "Everything on one level"
                        : "More room upstairs"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="wish-option"
              role="switch"
              aria-checked={preferCourtyard}
              onClick={() => setPreferCourtyard(!preferCourtyard)}
            >
              <Sun size={24} />
              <span>
                <strong>{"I’d love a small aangan"}</strong>
                <small>{"An open-to-sky space, if it fits"}</small>
              </span>
              <i className={`toggle ${preferCourtyard ? "on" : ""}`} />
            </button>
            <div className="advice-note">
              <Leaf size={19} />
              <p>
                {
                  "Every option keeps a bedroom on the ground floor. A helpful starting point for family members who prefer fewer stairs."
                }
              </p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="section-kicker">
              {"A FEW WAYS TO MAKE IT YOURS"}
            </div>
            <h2>{"Start with a possibility."}</h2>
            <p className="supporting">
              {length(w, unit)} × {length(d, unit)} {unitLabel(unit)}{" "}
              <span>·</span> {bedrooms} {"bedrooms"} <span>·</span> {floors}{" "}
              {floors === 1 ? "floor" : "floors"}.{" "}
              {"Each available option fits these choices."}
            </p>
            {preferCourtyard &&
              !options.find((o) => o.id === "courtyard")?.project && (
                <p className="inline-error">
                  {
                    "An aangan does not fit this starter arrangement. Other options keep your bedroom and floor choices."
                  }
                </p>
              )}
            <div className="recommendations">
              {options.map((o) => (
                <button
                  key={o.id}
                  disabled={!o.project}
                  aria-pressed={selected?.id === o.id}
                  onClick={() => setChosen(o.id)}
                  className={`recommendation ${selected?.id === o.id ? "selected" : ""}`}
                >
                  <div className="recommendation-art">
                    {o.project ? (
                      <MiniPlan project={o.project} />
                    ) : (
                      <House size={34} strokeWidth={1} />
                    )}
                  </div>
                  <div className="recommendation-copy">
                    {recommended?.id === o.id && (
                      <span className="recommended-tag">{"A GOOD START"}</span>
                    )}
                    <h3>{styleName(o.id)}</h3>
                    <p>
                      {!o.project
                        ? "This arrangement needs more space. Try fewer bedrooms, another floor or a larger plot."
                        : o.id === "family"
                          ? "A simple layout for everyday family life."
                          : o.id === "courtyard"
                            ? "Rooms beside a small open-to-sky courtyard."
                            : "A deeper open strip beside the house."}
                    </p>
                    {o.project && (
                      <small>
                        {area(projectStats(o.project).builtArea, unit)}{" "}
                        {areaLabel(unit)} {"floor area"}
                      </small>
                    )}
                  </div>
                  {o.project && (
                    <span className="option-check">
                      {selected?.id === o.id && <Check size={15} />}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="field-note">
              {
                "These are editable concept layouts, not approved building plans. Light, ventilation, access and local rules still need professional review."
              }
            </p>
          </>
        )}
      </div>
      <div className="guided-footer">
        <span>
          {step === 2
            ? "Your current home stays in Undo."
            : "No sign-up. No payment."}
        </span>
        <button
          className="primary-button"
          disabled={
            step === 0 ? !valid : step === 2 ? !selected?.project : false
          }
          onClick={() => {
            if (step < 2) {
              setChosen(null);
              setStep(step + 1);
            } else if (selected?.project) onUse(selected.project, unit);
          }}
        >
          {step === 0
            ? "Next: my needs"
            : step === 1
              ? "See my options"
              : "Make this my starting home"}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
