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
import {
  BLUEPRINTS,
  recommendBlueprints,
  type BlueprintKind,
  type BlueprintRequest,
  type HomeFlavor,
} from "../domain/blueprints";
import "./GuidedStart.css";
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
      {f.unitAreas.length > 1 &&
        f.unitAreas.map((a) => (
          <rect
            key={a.unitId}
            x={a.bounds.x}
            y={a.bounds.z}
            width={a.bounds.w}
            height={a.bounds.d}
            fill="none"
            stroke="#56785c"
            strokeWidth="14"
          />
        ))}
      {project.verticalSpaces
        .filter((v) => v.floorIds.includes(f.id))
        .map((v) => (
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
  const [kind, setKind] = useState<BlueprintKind>("home");
  const [flavor, setFlavor] = useState<HomeFlavor>("bungalow");
  const [bedrooms, setBedrooms] = useState(
    Math.min(12, projectStats(project).bedrooms),
  );
  const [floors, setFloors] = useState(Math.min(8, project.floors.length));
  const [unitsPerFloor, setUnitsPerFloor] = useState(2);
  const [bedroomsPerUnit, setBedroomsPerUnit] = useState(2);
  const [shopsPerFloor, setShopsPerFloor] = useState(2);
  const [preferCourtyard, setPreferCourtyard] = useState(false);
  const [road, setRoad] = useState<Project["plot"]["road"]>(project.plot.road);
  const [north, setNorth] = useState(project.plot.north);
  const [chosen, setChosen] = useState<string | null>(null);
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
  const request: BlueprintRequest = useMemo(
    () => ({
      widthCm: w,
      depthCm: d,
      road,
      north,
      marginCm,
      kind,
      flavor,
      bedrooms,
      floors,
      unitsPerFloor,
      bedroomsPerUnit,
      shopsPerFloor,
      courtyard: preferCourtyard,
    }),
    [
      w,
      d,
      road,
      north,
      marginCm,
      kind,
      flavor,
      bedrooms,
      floors,
      unitsPerFloor,
      bedroomsPerUnit,
      shopsPerFloor,
      preferCourtyard,
    ],
  );
  const options = useMemo(
    () => (valid ? recommendBlueprints(request) : []),
    [request, valid],
  );
  const recommended = options.find((o) => o.project);
  const selected = options.find((o) => o.id === (chosen ?? recommended?.id));
  const countField = (
    label: string,
    value: number,
    min: number,
    max: number,
    set: (n: number) => void,
  ) => (
    <label className="blueprint-count">
      <span>{label}</span>
      <div>
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => set(value - 1)}
        >
          −
        </button>
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= min && n <= max) set(n);
          }}
        />
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          +
        </button>
      </div>
    </label>
  );
  function chooseKind(next: BlueprintKind) {
    setKind(next);
    setChosen(null);
    if (next === "mixed" && floors === 1) setFloors(2);
  }
  function switchUnit(next: Unit) {
    if (next === unit) return;
    setWidth(String(Number(toDisplay(w, next).toFixed(1))));
    setDepth(String(Number(toDisplay(d, next).toFixed(1))));
    setUnit(next);
  }
  return (
    <div className="guided-content blueprint-setup">
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
        {["Your plot", "Your building", "Your options"].map((s, i) => (
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
                North direction (degrees)
                <input
                  type="number"
                  aria-label="North direction"
                  value={north}
                  min="0"
                  max="359"
                  onChange={(e) => setNorth(Number(e.target.value))}
                />
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
            <div className="section-kicker">ONE PLOT. YOUR POSSIBILITIES.</div>
            <h2>What would you like to build?</h2>
            <p className="supporting">
              Choose a starting arrangement. Every floor and room stays
              editable.
            </p>
            <div className="blueprint-kinds" aria-label="Building type">
              {BLUEPRINTS.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={kind === item.id}
                  onClick={() => chooseKind(item.id)}
                >
                  <House size={23} />
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            {kind === "home" && (
              <div
                className="blueprint-flavors"
                aria-label="Home starting style"
              >
                {(["bungalow", "villa", "duplex"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={flavor === value}
                    onClick={() => {
                      setFlavor(value);
                      setFloors(value === "duplex" ? 2 : 1);
                    }}
                  >
                    <strong>
                      {value === "bungalow"
                        ? "Bungalow"
                        : value === "villa"
                          ? "Villa"
                          : "Duplex"}
                    </strong>
                    <small>
                      {value === "duplex"
                        ? "Start with two floors"
                        : value === "villa"
                          ? "Start with more open land"
                          : "Start on one floor"}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <div className="blueprint-program">
              {countField("Floors", floors, 1, 8, setFloors)}
              {kind === "home" &&
                countField(
                  "Bedrooms in the whole home",
                  bedrooms,
                  0,
                  12,
                  setBedrooms,
                )}
              {(kind === "apartments" || kind === "mixed") && (
                <>
                  {(kind !== "mixed" || floors > 1) &&
                    countField(
                      kind === "mixed"
                        ? "Flats on each upper floor"
                        : "Flats on each floor",
                      unitsPerFloor,
                      1,
                      4,
                      setUnitsPerFloor,
                    )}
                  {countField(
                    kind === "mixed" && floors === 1
                      ? "Bedrooms in the home"
                      : "Bedrooms in each flat",
                    bedroomsPerUnit,
                    1,
                    4,
                    setBedroomsPerUnit,
                  )}
                </>
              )}
              {(kind === "market" || kind === "mixed") &&
                countField(
                  kind === "mixed"
                    ? "Shops on the ground floor"
                    : "Shops on each floor",
                  shopsPerFloor,
                  1,
                  8,
                  setShopsPerFloor,
                )}
            </div>
            {kind === "home" && (
              <div className="blueprint-quick">
                <span>Quick choices</span>
                <div>
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      aria-pressed={bedrooms === n}
                      onClick={() => setBedrooms(n)}
                    >
                      {n} {n === 1 ? "bedroom" : "bedrooms"}
                    </button>
                  ))}
                </div>
                <div>
                  {[1, 2].map((n) => (
                    <button
                      key={n}
                      aria-pressed={floors === n}
                      onClick={() => setFloors(n)}
                    >
                      {n === 1 ? "Ground floor only" : "Ground + one"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="blueprint-stack" aria-label="Building arrangement">
              {Array.from({ length: floors }, (_, n) => floors - 1 - n).map(
                (n) => (
                  <div key={n}>
                    <span>{n === 0 ? "Ground" : `Floor ${n}`}</span>
                    <strong>
                      {kind === "blank"
                        ? "Open floor"
                        : kind === "market" || (kind === "mixed" && n === 0)
                          ? `${shopsPerFloor} shops${kind === "mixed" && floors === 1 ? " + 1 home" : ""}`
                          : kind === "apartments" || kind === "mixed"
                            ? `${unitsPerFloor} flats · ${bedroomsPerUnit} bedrooms each`
                            : "Your home"}
                    </strong>
                    {floors > 1 && <small>Shared stairs</small>}
                  </div>
                ),
              )}
            </div>
            <button
              className="wish-option"
              role="switch"
              aria-checked={preferCourtyard}
              onClick={() => setPreferCourtyard(!preferCourtyard)}
            >
              <Sun size={24} />
              <span>
                <strong>Include an open-to-sky courtyard</strong>
                <small>
                  One aligned opening through the building, if it fits.
                </small>
              </span>
              <i className={`toggle ${preferCourtyard ? "on" : ""}`} />
            </button>
            <div className="advice-note">
              <Leaf size={19} />
              <p>
                {kind === "blank"
                  ? "Begin with an outline. Multi-floor buildings include shared stairs so you can arrange the rest."
                  : "Requested counts stay exactly as chosen. If the arrangement cannot fit, we’ll explain what needs more space."}
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
              <span>·</span> {BLUEPRINTS.find((b) => b.id === kind)?.name}{" "}
              <span>·</span> {floors} {floors === 1 ? "floor" : "floors"}.{" "}
              {"Each available option fits these choices."}
            </p>
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
                    <h3>{o.name}</h3>
                    <p>{o.reason}</p>
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
