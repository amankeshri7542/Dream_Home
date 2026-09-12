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
  text,
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
  language,
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
  const t = (en: string, hi: string) => text(language, en, hi);
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
      ? t("Everyday family home", "परिवार का घर")
      : id === "courtyard"
        ? t("A home with an aangan", "आँगन वाला घर")
        : t("A little more open space", "थोड़ी ज़्यादा खुली जगह");
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
          aria-label={t("Go back", "पीछे जाएँ")}
          onClick={() => (step ? setStep(step - 1) : onClose())}
        >
          <ArrowLeft size={21} />
        </button>
        <span className="step-caption">
          {t("A home that starts with you", "आपसे शुरू होता है आपका घर")}
        </span>
        <button
          className="round-button"
          aria-label={t("Close setup", "सेटअप बंद करें")}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div
        className="step-progress"
        aria-label={t(`Step ${step + 1} of 3`, `चरण ${step + 1} / 3`)}
      >
        {[
          t("Your plot", "आपका प्लॉट"),
          t("Your needs", "आपकी ज़रूरतें"),
          t("Your options", "आपके विकल्प"),
        ].map((s, i) => (
          <span key={i} className={step >= i ? "done" : ""}>
            <i>{step > i ? <Check size={12} /> : i + 1}</i>
            {s}
          </span>
        ))}
      </div>
      <div className="guided-body">
        {step === 0 && (
          <>
            <div className="section-kicker">
              {t("LET’S START WITH THE LAND", "ज़मीन से शुरुआत करें")}
            </div>
            <h2>{t("How big is your plot?", "आपका प्लॉट कितना बड़ा है?")}</h2>
            <p className="supporting">
              {t(
                "Use the side measurements from your plot papers.",
                "प्लॉट के कागज़ों में लिखी लंबाई और चौड़ाई भरें।",
              )}
            </p>
            <div className="plot-entry">
              <div className="plot-sketch">
                <span className="sketch-width">
                  {width || "—"} {unitLabel(unit, language)}
                </span>
                <div className="sketch-land">
                  <House size={30} strokeWidth={1} />
                  <small>
                    {width && depth
                      ? `${area((w * d) / 10000, unit)} ${areaLabel(unit, language)}`
                      : "—"}
                  </small>
                </div>
                <span className="sketch-depth">
                  {depth || "—"} {unitLabel(unit, language)}
                </span>
                <span className={`sketch-road road-${road}`}>
                  {roadName(road, language)}
                </span>
              </div>
              <div className="plot-fields">
                <div
                  className="unit-switch"
                  aria-label={t("Measurement unit", "माप की इकाई")}
                >
                  <button
                    aria-pressed={unit === "ft"}
                    onClick={() => switchUnit("ft")}
                  >
                    {t("Feet", "फ़ीट")}
                  </button>
                  <button
                    aria-pressed={unit === "m"}
                    onClick={() => switchUnit("m")}
                  >
                    {t("Metres", "मीटर")}
                  </button>
                </div>
                <label className="big-field">
                  {t("Plot width", "प्लॉट की चौड़ाई")}
                  <div>
                    <input
                      aria-label={t("Plot width", "प्लॉट की चौड़ाई")}
                      type="number"
                      inputMode="decimal"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                    />
                    <span>{unitLabel(unit, language)}</span>
                  </div>
                </label>
                <label className="big-field">
                  {t("Plot depth", "प्लॉट की लंबाई")}
                  <div>
                    <input
                      aria-label={t("Plot depth", "प्लॉट की लंबाई")}
                      type="number"
                      inputMode="decimal"
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                    />
                    <span>{unitLabel(unit, language)}</span>
                  </div>
                </label>
              </div>
            </div>
            <span className="field-caption">
              {t("Or try an example size", "या एक उदाहरण चुनें")}
            </span>
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
                {t("Road side & open margin", "रास्ते की दिशा और खुला हिस्सा")}
                <ChevronDown size={16} />
              </summary>
              <label className="select-label">
                {t("Road along the plot", "प्लॉट के किस तरफ रास्ता है?")}
                <select
                  value={road}
                  onChange={(e) =>
                    setRoad(e.target.value as Project["plot"]["road"])
                  }
                >
                  <option value="south">
                    {t("Front / bottom of plan", "सामने / नक्शे में नीचे")}
                  </option>
                  <option value="east">{t("Right", "दाईं तरफ")}</option>
                  <option value="north">
                    {t("Back / top of plan", "पीछे / नक्शे में ऊपर")}
                  </option>
                  <option value="west">{t("Left", "बाईं तरफ")}</option>
                </select>
              </label>
              <label className="big-field">
                {t(
                  "Open margin on each side (ft)",
                  "हर तरफ खुला हिस्सा (फ़ीट)",
                )}
                <input
                  type="number"
                  aria-label={t("Open margin in feet", "खुला हिस्सा फ़ीट में")}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                />
              </label>
              <p className="field-note">
                {t(
                  "This margin is a sketch assumption, not a local setback requirement. Confirm the required space with your local architect.",
                  "यह सिर्फ़ शुरुआती नक्शे का अनुमान है, स्थानीय नियम नहीं। ज़रूरी खुली जगह अपने आर्किटेक्ट से जाँचें।",
                )}
              </p>
            </details>
            <p className="local-note">
              {t(
                "Know the area in katha or dhur? Use measured sides here—local conversions vary.",
                "क्षेत्रफल कट्ठा या धुर में पता है? यहाँ नापी हुई लंबाई–चौड़ाई भरें। स्थानीय माप अलग हो सकते हैं।",
              )}
            </p>
            {!valid && (
              <p className="inline-error" role="status">
                {t(
                  "Enter both sides between 4 and 100 metres and a valid open margin.",
                  "दोनों तरफ का माप 4 से 100 मीटर के बीच और सही खुला हिस्सा भरें।",
                )}
              </p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <div className="section-kicker">
              {t("ROOM FOR YOUR EVERYDAY", "रोज़मर्रा की ज़रूरतें")}
            </div>
            <h2>
              {t("What feels like home?", "आपके घर में क्या होना चाहिए?")}
            </h2>
            <p className="supporting">
              {t(
                "Just the essentials for now. You can change things later.",
                "अभी ज़रूरी बातें चुनें। बाद में बदलाव कर सकते हैं।",
              )}
            </p>
            <div className="choice-section">
              <h3>{t("Bedrooms in the whole home", "पूरे घर में बेडरूम")}</h3>
              <div className="number-options">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    aria-pressed={bedrooms === n}
                    onClick={() => setBedrooms(n)}
                  >
                    <strong>{n}</strong>
                    <span>{t(n === 1 ? "bedroom" : "bedrooms", "बेडरूम")}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="choice-section">
              <h3>{t("How many floors?", "कितनी मंज़िलें?")}</h3>
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
                      {n === 1
                        ? t("Ground floor only", "सिर्फ़ भूतल")
                        : t("Ground + one", "भूतल + एक मंज़िल")}
                    </strong>
                    <small>
                      {n === 1
                        ? t("Everything on one level", "सब कुछ एक ही तल पर")
                        : t("More room upstairs", "ऊपर और जगह")}
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
                <strong>
                  {t("I’d love a small aangan", "मुझे एक छोटा आँगन चाहिए")}
                </strong>
                <small>
                  {t("An open-to-sky space, if it fits", "जगह हो तो खुला आँगन")}
                </small>
              </span>
              <i className={`toggle ${preferCourtyard ? "on" : ""}`} />
            </button>
            <div className="advice-note">
              <Leaf size={19} />
              <p>
                {t(
                  "Every option keeps a bedroom on the ground floor. A helpful starting point for family members who prefer fewer stairs.",
                  "हर विकल्प में भूतल पर एक बेडरूम रहेगा। सीढ़ियों से बचना चाहने वाले परिवारजनों के लिए यह मददगार शुरुआत है।",
                )}
              </p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="section-kicker">
              {t("A FEW WAYS TO MAKE IT YOURS", "आपके घर के कुछ विकल्प")}
            </div>
            <h2>{t("Start with a possibility.", "एक पसंद से शुरुआत करें।")}</h2>
            <p className="supporting">
              {length(w, unit)} × {length(d, unit)} {unitLabel(unit, language)}{" "}
              <span>·</span> {bedrooms} {t("bedrooms", "बेडरूम")} <span>·</span>{" "}
              {floors} {t(floors === 1 ? "floor" : "floors", "मंज़िल")}.{" "}
              {t(
                "Each available option fits these choices.",
                "हर उपलब्ध विकल्प इन पसंदों के अनुसार बनाया गया है।",
              )}
            </p>
            {preferCourtyard &&
              !options.find((o) => o.id === "courtyard")?.project && (
                <p className="inline-error">
                  {t(
                    "An aangan does not fit this starter arrangement. Other options keep your bedroom and floor choices.",
                    "इस शुरुआती नक्शे में आँगन नहीं समा रहा। दूसरे विकल्पों में आपके चुने बेडरूम और मंज़िलें बरकरार हैं।",
                  )}
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
                      <span className="recommended-tag">
                        {t("A GOOD START", "अच्छी शुरुआत")}
                      </span>
                    )}
                    <h3>{styleName(o.id)}</h3>
                    <p>
                      {!o.project
                        ? t(
                            "This arrangement needs more space. Try fewer bedrooms, another floor or a larger plot.",
                            "इस नक्शे के लिए ज़्यादा जगह चाहिए। कम बेडरूम, एक और मंज़िल या बड़ा प्लॉट आज़माएँ।",
                          )
                        : o.id === "family"
                          ? t(
                              "A simple layout for everyday family life.",
                              "परिवार की रोज़मर्रा की ज़रूरतों का सरल नक्शा।",
                            )
                          : o.id === "courtyard"
                            ? t(
                                "Rooms beside a small open-to-sky courtyard.",
                                "छोटे खुले आँगन के साथ कमरे।",
                              )
                            : t(
                                "A deeper open strip beside the house.",
                                "घर के पास थोड़ा ज़्यादा खुला हिस्सा।",
                              )}
                    </p>
                    {o.project && (
                      <small>
                        {area(projectStats(o.project).builtArea, unit)}{" "}
                        {areaLabel(unit, language)}{" "}
                        {t("floor area", "फ़्लोर क्षेत्रफल")}
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
              {t(
                "These are editable concept layouts, not approved building plans. Light, ventilation, access and local rules still need professional review.",
                "ये बदलने योग्य शुरुआती नक्शे हैं, स्वीकृत बिल्डिंग प्लान नहीं। रोशनी, हवा, आवागमन और स्थानीय नियमों की विशेषज्ञ जाँच ज़रूरी है।",
              )}
            </p>
          </>
        )}
      </div>
      <div className="guided-footer">
        <span>
          {step === 2
            ? t(
                "Your current home stays in Undo.",
                "पिछला घर “वापस” से मिलेगा।",
              )
            : t("No sign-up. No payment.", "न साइन-अप, न भुगतान।")}
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
            ? t("Next: my needs", "अगला: मेरी ज़रूरतें")
            : step === 1
              ? t("See my options", "मेरे विकल्प देखें")
              : t("Make this my starting home", "इस घर से शुरू करें")}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
