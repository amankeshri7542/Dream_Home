import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  Expand,
  Eye,
  Grid2X2,
  House,
  Leaf,
  Maximize,
  Minus,
  MoreHorizontal,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Share2,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import Plan from "./components/Plan";
import GuidedStart from "./components/GuidedStart";
import SharePlan from "./components/SharePlan";
import {
  Dialog,
  DialogHeading,
  Dimension,
  Switch,
} from "./components/Controls";
import { useProject } from "./useProject";
import {
  addRoom,
  parseProject,
  projectStats,
  removeRoom,
  setFloorCount,
  updatePlot,
  updateRoom,
  validateProject,
} from "./domain/model";
import { download } from "./domain/export";
import {
  area,
  areaLabel,
  floorName,
  length,
  roadName,
  roomKindName,
  roomName,
  text,
  unitLabel,
} from "./domain/display";
import type { Language, Unit } from "./domain/display";
import { ROOM_META } from "./domain/types";
import type { Project, RoomKind, ViewSettings } from "./domain/types";
const Scene = lazy(() => import("./components/Scene"));
type Panel = "plot" | "rooms" | "view" | null;
type Overlay = "start" | "share" | "more" | "help" | null;
function preferences() {
  try {
    const p = JSON.parse(
      localStorage.getItem("dream-home.preferences.v1") ?? "{}",
    );
    return {
      language: p.language === "hi" ? ("hi" as const) : ("en" as const),
      unit: p.unit === "m" ? ("m" as const) : ("ft" as const),
    };
  } catch {
    return { language: "en" as Language, unit: "ft" as Unit };
  }
}
function friendlyError(error: string, language: Language) {
  if (language === "en") {
    if (error === "saved-file-unreadable")
      return "Your saved file could not be opened. It has been kept safe. Use “Recover saved file” in More before making changes.";
    if (error === "storage-unavailable")
      return "Saving is unavailable on this device. Download your project file to keep your changes.";
    return error;
  }
  if (error === "saved-file-unreadable")
    return "पुरानी फ़ाइल नहीं खुली। उसे सुरक्षित रखा गया है। बदलाव से पहले “और विकल्प” में “पुरानी फ़ाइल बचाएँ” चुनें।";
  if (error === "storage-unavailable")
    return "इस डिवाइस पर सेव नहीं हो रहा। बदलाव रखने के लिए प्रोजेक्ट फ़ाइल डाउनलोड करें।";
  if (/overlap/i.test(error))
    return "यह कमरा दूसरे कमरे, आँगन या सीढ़ियों से टकरा रहा है। छोटा माप या दूसरी जगह आज़माएँ।";
  if (/stair/i.test(error))
    return "ऊपर की मंज़िल के लिए सीढ़ियों की जगह चाहिए। “नया घर शुरू करें” में दो मंज़िल का विकल्प चुनें।";
  if (/setback|boundary|inside|balcony/i.test(error))
    return "घर और बालकनी को प्लॉट की खुली सीमा के अंदर रखें। माप या खुला हिस्सा बदलकर देखें।";
  if (/No free space/i.test(error))
    return "इस कमरे के लिए खाली जगह नहीं है। पहले किसी कमरे का माप या जगह बदलें।";
  return "यह बदलाव नहीं हो पाया। " + error;
}

export default function App() {
  const {
    project,
    commit,
    apply,
    undo,
    redo,
    canUndo,
    canRedo,
    error,
    setError,
    saved,
    hasSavedProject,
    recovery,
  } = useProject();
  const [prefs] = useState(preferences),
    [language, setLanguage] = useState<Language>(prefs.language),
    [unit, setUnit] = useState<Unit>(prefs.unit);
  const t = (en: string, hi: string) => text(language, en, hi);
  const [panel, setPanel] = useState<Panel>(null),
    [overlay, setOverlay] = useState<Overlay>(null),
    [welcome, setWelcome] = useState(!hasSavedProject);
  const [mode, setMode] = useState<"3d" | "2d">("3d"),
    [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewSettings>({
    floor: "all",
    stage: 4,
    cutaway: true,
    walls: true,
    openings: true,
    landscape: true,
    labels: false,
    roof: false,
    resetKey: 0,
  });
  const [addKind, setAddKind] = useState<RoomKind>("bedroom"),
    [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const stats = projectStats(project),
    activeFloor =
      project.floors.find((f) => f.id === view.floor) ?? project.floors[0];
  const chosenFloor = project.floors.find((f) =>
      f.rooms.some((r) => r.id === selected),
    ),
    room = chosenFloor?.rooms.find((r) => r.id === selected);
  const title =
    language === "hi"
      ? ({
          "Our Family Home": "हमारे परिवार का घर",
          "Our Aangan Home": "हमारा आँगन वाला घर",
          "Our Home with a Front Yard": "खुले हिस्से वाला हमारा घर",
        }[project.name] ?? project.name)
      : project.name;
  const setViewing = (patch: Partial<ViewSettings>) =>
    setView((v) => ({ ...v, ...patch }));
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(
        "dream-home.preferences.v1",
        JSON.stringify({ language, unit }),
      );
    } catch {
      /* Editing and export remain available when device storage is blocked. */
    }
  }, [language, unit]);
  useEffect(() => {
    if (
      view.floor !== "all" &&
      !project.floors.some((f) => f.id === view.floor)
    )
      setView((v) => ({ ...v, floor: "all" }));
    if (
      selected &&
      !project.floors.some((f) => f.rooms.some((r) => r.id === selected))
    )
      setSelected(null);
  }, [project, view.floor, selected]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,select,textarea,dialog")
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape") {
        setPanel(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
  function selectRoom(id: string | null) {
    setSelected(id);
    if (id) {
      setWelcome(false);
      setPanel("rooms");
      const floor = project.floors.find((f) =>
        f.rooms.some((r) => r.id === id),
      );
      if (floor) setViewing({ floor: floor.id });
    }
  }
  function chooseFloor(id: string) {
    setViewing({ floor: id });
    setSelected(null);
  }
  function choosePanel(next: Exclude<Panel, null>) {
    setPanel(panel === next ? null : next);
    setWelcome(false);
    setSelected(null);
    setError("");
  }
  function useStarter(next: Project, nextUnit: Unit) {
    commit(next);
    setUnit(nextUnit);
    setWelcome(false);
    setOverlay(null);
    setPanel(null);
    setSelected(null);
    setMode("3d");
    setViewing({
      floor: "all",
      stage: 4,
      cutaway: true,
      roof: false,
      resetKey: view.resetKey + 1,
    });
    setMessage(
      t(
        "Your starting home is ready. Tap Rooms to make it yours.",
        "आपका शुरुआती घर तैयार है। बदलाव के लिए “कमरे” चुनें।",
      ),
    );
  }
  async function openFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 200000)
        throw new Error(
          t(
            "Choose a project file smaller than 200 KB.",
            "200 KB से छोटी प्रोजेक्ट फ़ाइल चुनें।",
          ),
        );
      const next = parseProject(await file.text());
      commit(next);
      setOverlay(null);
      setSelected(null);
      setPanel(null);
      setWelcome(false);
      setViewing({ floor: "all", resetKey: view.resetKey + 1 });
      setMessage(
        t(
          "Home opened. Undo brings back your previous idea.",
          "घर खुल गया। “वापस” से पिछला विचार मिलेगा।",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  function toggleBalcony() {
    const next = {
      ...project,
      floors: project.floors.map((f) =>
        f.id === activeFloor.id ? { ...f, balcony: !f.balcony } : f,
      ),
    };
    const errors = validateProject(next);
    if (errors.length) setError(errors[0]);
    else commit(next);
  }
  function nudge(x: number, z: number) {
    if (room && chosenFloor)
      apply(
        updateRoom(project, chosenFloor.id, room.id, {
          bounds: {
            ...room.bounds,
            x: room.bounds.x + x,
            z: room.bounds.z + z,
          },
        }),
      );
  }
  const panelTitle =
    panel === "plot"
      ? t("Your plot", "आपका प्लॉट")
      : panel === "rooms"
        ? room
          ? roomName(room, language)
          : t("Make room for everyone", "सबके लिए जगह")
        : t("See your home differently", "घर को नए नज़रिए से देखें");
  const instructions = t(
    "Drag to turn · pinch to zoom",
    "घुमाने के लिए खींचें · ज़ूम के लिए पिंच करें",
  );

  return (
    <div className={`home-app ${panel ? "panel-open" : ""}`}>
      <header className="topbar">
        <a href="./" className="brand" aria-label="Dream-Home">
          <span className="brand-mark">
            <House size={21} />
          </span>
          <span>
            dream<span className="brand-dash">—</span>home
          </span>
        </a>
        <span className="topbar-tagline">
          {t("A little closer to home.", "अपने घर के थोड़ा और करीब।")}
        </span>
        <div className="topbar-actions">
          <button
            className="language-button"
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            aria-label={
              language === "en" ? "Switch to Hindi" : "Switch to English"
            }
          >
            {language === "en" ? "हिन्दी" : "English"}
          </button>
          <span className="desktop-history">
            <button
              className="round-button"
              aria-label={t("Undo", "वापस")}
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={19} />
            </button>
            <button
              className="round-button"
              aria-label={t("Redo", "फिर करें")}
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 size={19} />
            </button>
          </span>
          <button
            className="share-button"
            aria-label={t("Share home plan", "घर का नक्शा शेयर करें")}
            onClick={() => setOverlay("share")}
          >
            <Share2 size={18} />
            <span>{t("Share", "शेयर")}</span>
          </button>
          <button
            className="round-button"
            aria-label={t("More options", "और विकल्प")}
            onClick={() => setOverlay("more")}
          >
            <MoreHorizontal size={24} />
          </button>
        </div>
      </header>
      <main className="studio">
        <section
          className={`scene-area ${welcome ? "with-welcome" : ""}`}
          aria-label={t("Your home preview", "आपके घर का प्रीव्यू")}
        >
          <div className="scene-heading">
            <span className="section-kicker">
              {welcome
                ? t("AN IDEA TO BEGIN WITH", "शुरुआत के लिए एक विचार")
                : t("YOUR HOME, TAKING SHAPE", "आपका घर, आकार लेता हुआ")}
            </span>
            <h1>{title}</h1>
            <p>
              {length(project.plot.width, unit)} ×{" "}
              {length(project.plot.depth, unit)} {unitLabel(unit, language)}
              <i /> {stats.bedrooms} {t("bedrooms", "बेडरूम")}
              <i />
              {project.floors.length === 1
                ? t("Ground floor", "भूतल")
                : t(
                    `${project.floors.length} floors`,
                    `${project.floors.length} मंज़िलें`,
                  )}
            </p>
          </div>
          <div
            className="view-switch"
            role="group"
            aria-label={t("View mode", "देखने का तरीका")}
          >
            <button
              aria-pressed={mode === "3d"}
              onClick={() => {
                setMode("3d");
                setEditing(false);
              }}
            >
              <House size={17} />
              {t("3D home", "3D घर")}
            </button>
            <button
              aria-pressed={mode === "2d"}
              onClick={() => {
                setMode("2d");
                setWelcome(false);
              }}
            >
              <Grid2X2 size={17} />
              {t("Floor plan", "नक्शा")}
            </button>
          </div>
          <div className="model-canvas">
            {mode === "3d" ? (
              <Suspense
                fallback={
                  <div className="scene-loading">
                    <House size={29} />
                    <span>
                      {t(
                        "Getting your home ready…",
                        "आपका घर तैयार हो रहा है…",
                      )}
                    </span>
                  </div>
                }
              >
                <Scene
                  project={project}
                  selected={selected}
                  onSelect={selectRoom}
                  view={view}
                  language={language}
                  unit={unit}
                />
              </Suspense>
            ) : (
              <Plan
                project={project}
                floor={activeFloor}
                selected={selected}
                onSelect={selectRoom}
                view={view}
                language={language}
                unit={unit}
                editable={editing}
                onMove={(id, bounds) =>
                  apply(updateRoom(project, activeFloor.id, id, { bounds }))
                }
              />
            )}
          </div>
          <div className="canvas-actions">
            <button
              className="round-button"
              title={t("Reset view", "पूरा दृश्य")}
              aria-label={t("Reset view", "पूरा दृश्य")}
              onClick={() => setViewing({ resetKey: view.resetKey + 1 })}
            >
              <Maximize size={19} />
            </button>
            <button
              className="round-button mobile-undo"
              aria-label={t("Undo", "वापस")}
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={19} />
            </button>
            {mode === "2d" && (
              <button
                className={`move-button ${editing ? "active" : ""}`}
                aria-pressed={editing}
                onClick={() => {
                  setEditing(!editing);
                  setPanel(null);
                }}
              >
                <Move size={16} />
                {t("Move rooms", "कमरे खिसकाएँ")}
              </button>
            )}
          </div>
          {project.floors.length > 1 && (
            <div className="floating-floors">
              <select
                aria-label={t("Visible floor", "दिखने वाली मंज़िल")}
                value={view.floor}
                onChange={(e) => chooseFloor(e.target.value)}
              >
                <option value="all">{t("Whole home", "पूरा घर")}</option>
                {project.floors.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    {floorName(i, language)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          )}
          {welcome ? (
            <div className="welcome-card">
              <span className="welcome-symbol">
                <Sun size={22} />
              </span>
              <div>
                <h2>
                  {t(
                    "Your plot. Your people. Your home.",
                    "आपका प्लॉट। आपका परिवार। आपका घर।",
                  )}
                </h2>
                <p>
                  {t(
                    "Tell us a little. Try a few possibilities.",
                    "थोड़ा बताएँ। कुछ संभावनाएँ आज़माएँ।",
                  )}
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setOverlay("start")}
              >
                {t("Start with my plot", "मेरे प्लॉट से शुरू करें")}
                <ArrowRight size={18} />
              </button>
              <button className="text-link" onClick={() => setWelcome(false)}>
                {t("Just explore this sample", "अभी इस उदाहरण को देखें")}
              </button>
            </div>
          ) : (
            <div className="scene-footnote">
              <span>
                <i />
                {saved
                  ? t("Saved on this device", "इस डिवाइस पर सेव है")
                  : t(
                      "Not saved—download a copy",
                      "सेव नहीं हुआ—कॉपी डाउनलोड करें",
                    )}
              </span>
              <small>
                {mode === "3d"
                  ? instructions
                  : t(
                      "Tap a room to see its size",
                      "माप देखने के लिए कमरा छुएँ",
                    )}
              </small>
            </div>
          )}
        </section>
        <aside
          className={`controls-panel ${panel ? "visible" : "overview"}`}
          aria-label={panelTitle}
        >
          {panel ? (
            <>
              <div className="panel-heading">
                {room && panel === "rooms" && (
                  <button
                    className="round-button"
                    aria-label={t("Back to rooms", "कमरों की सूची")}
                    onClick={() => setSelected(null)}
                  >
                    <ArrowLeft size={21} />
                  </button>
                )}
                <div>
                  <span className="section-kicker">
                    {room
                      ? floorName(
                          project.floors.indexOf(chosenFloor!),
                          language,
                        )
                      : t("MAKE IT YOURS", "इसे अपना बनाएँ")}
                  </span>
                  <h2>{panelTitle}</h2>
                </div>
                <button
                  className="round-button"
                  aria-label={t("Close controls", "कंट्रोल बंद करें")}
                  onClick={() => {
                    setPanel(null);
                    setSelected(null);
                  }}
                >
                  <X size={21} />
                </button>
              </div>
              <div className="panel-body">
                {error && (
                  <div className="inline-error" role="alert">
                    <span>{friendlyError(error, language)}</span>
                    <button
                      aria-label={t("Dismiss error", "संदेश हटाएँ")}
                      onClick={() => setError("")}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {panel === "plot" && (
                  <>
                    <p className="supporting">
                      {t(
                        "A few measurements. A world of possibilities.",
                        "कुछ माप। ढेर सारी संभावनाएँ।",
                      )}
                    </p>
                    <div className="plot-stat">
                      <Ruler size={24} />
                      <strong>
                        {area(stats.plotArea, unit)}
                        <small>
                          {areaLabel(unit, language)}{" "}
                          {t("plot area", "प्लॉट क्षेत्रफल")}
                        </small>
                      </strong>
                      <div className="unit-switch">
                        <button
                          aria-pressed={unit === "ft"}
                          onClick={() => setUnit("ft")}
                        >
                          ft
                        </button>
                        <button
                          aria-pressed={unit === "m"}
                          onClick={() => setUnit("m")}
                        >
                          m
                        </button>
                      </div>
                    </div>
                    <div className="field-pair">
                      <Dimension
                        label={t("Plot width", "प्लॉट की चौड़ाई")}
                        cm={project.plot.width}
                        unit={unit}
                        language={language}
                        min={400}
                        onChange={(width) =>
                          apply(updatePlot(project, { width }))
                        }
                      />
                      <Dimension
                        label={t("Plot depth", "प्लॉट की लंबाई")}
                        cm={project.plot.depth}
                        unit={unit}
                        language={language}
                        min={400}
                        onChange={(depth) =>
                          apply(updatePlot(project, { depth }))
                        }
                      />
                    </div>
                    <label className="select-label">
                      {t("Road is on this side", "रास्ता इस तरफ है")}
                      <select
                        value={project.plot.road}
                        onChange={(e) =>
                          apply(
                            updatePlot(project, {
                              road: e.target.value as Project["plot"]["road"],
                            }),
                          )
                        }
                      >
                        {["south", "east", "north", "west"].map((side) => (
                          <option key={side} value={side}>
                            {roadName(side, language)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className="plain-details">
                      <summary>
                        {t("Space around the home", "घर के आसपास की जगह")}
                        <ChevronDown size={17} />
                      </summary>
                      <Dimension
                        label={t(
                          "Open margin on each side",
                          "हर तरफ खुला हिस्सा",
                        )}
                        cm={project.plot.setback}
                        unit={unit}
                        language={language}
                        max={2000}
                        onChange={(setback) =>
                          apply(updatePlot(project, { setback }))
                        }
                      />
                      <p className="field-note">
                        {t(
                          "A sketch assumption, not the local setback rule. Your architect can confirm the space to leave.",
                          "यह शुरुआती अनुमान है, स्थानीय नियम नहीं। कितना हिस्सा छोड़ना है, आर्किटेक्ट से जाँचें।",
                        )}
                      </p>
                      <Switch
                        label={t("Garden & green space", "बगीचा और हरियाली")}
                        checked={project.garden}
                        icon={<Leaf size={20} />}
                        onChange={() =>
                          commit({ ...project, garden: !project.garden })
                        }
                      />
                      <Switch
                        label={t("Open parking", "खुली पार्किंग")}
                        description={t(
                          "Shown only where a car fits outside the home",
                          "घर के बाहर जगह होने पर ही दिखेगी",
                        )}
                        checked={project.parking}
                        icon={<Grid2X2 size={20} />}
                        onChange={() =>
                          commit({ ...project, parking: !project.parking })
                        }
                      />
                    </details>
                    <button
                      className="secondary-button full"
                      onClick={() => setOverlay("start")}
                    >
                      <RotateCcw size={17} />
                      {t(
                        "Find layouts for this plot",
                        "इस प्लॉट के विकल्प देखें",
                      )}
                    </button>
                    <p className="field-note">
                      {t(
                        "Changing the plot keeps your rooms in place. Start a new layout to rearrange the whole home.",
                        "प्लॉट बदलने पर कमरे अपनी जगह रहेंगे। पूरे घर को बदलने के लिए नया नक्शा चुनें।",
                      )}
                    </p>
                  </>
                )}
                {panel === "rooms" && !room && (
                  <>
                    <p className="supporting">
                      {t(
                        "Tap a room. Give it a little more space.",
                        "कमरा चुनें। उसे थोड़ी और जगह दें।",
                      )}
                    </p>
                    <div className="floor-control">
                      <select
                        aria-label={t("Editing floor", "बदलने वाली मंज़िल")}
                        value={activeFloor.id}
                        onChange={(e) => chooseFloor(e.target.value)}
                      >
                        {project.floors.map((f, i) => (
                          <option key={f.id} value={f.id}>
                            {floorName(i, language)}
                          </option>
                        ))}
                      </select>
                      <span>
                        {activeFloor.rooms.length} {t("spaces", "कमरे")}
                      </span>
                    </div>
                    <div className="room-list">
                      {activeFloor.rooms.map((r) => (
                        <button
                          className="room-card"
                          key={r.id}
                          onClick={() => selectRoom(r.id)}
                        >
                          <span
                            className="room-color"
                            style={{ background: ROOM_META[r.kind].color }}
                          >
                            <Grid2X2 size={18} />
                          </span>
                          <span>
                            <strong>{roomName(r, language)}</strong>
                            <small>
                              {length(r.bounds.w, unit)} ×{" "}
                              {length(r.bounds.d, unit)}{" "}
                              {unitLabel(unit, language)}
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                    </div>
                    <div className="add-room-row">
                      <select
                        aria-label={t("New room type", "नए कमरे का प्रकार")}
                        value={addKind}
                        onChange={(e) => setAddKind(e.target.value as RoomKind)}
                      >
                        {(Object.keys(ROOM_META) as RoomKind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {roomKindName(kind, language)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary-button"
                        aria-label={t("Add room", "कमरा जोड़ें")}
                        onClick={() =>
                          apply(addRoom(project, activeFloor.id, addKind))
                        }
                      >
                        <Plus size={19} />
                        {t("Add", "जोड़ें")}
                      </button>
                    </div>
                    {activeFloor.voids.some((v) => v.kind === "courtyard") && (
                      <div className="advice-note">
                        <Sun size={20} />
                        <p>
                          {t(
                            "Your aangan is open to the sky. Its position stays aligned across floors in this version.",
                            "आपका आँगन ऊपर से खुला है। इस संस्करण में हर मंज़िल पर इसकी जगह एक ही रहेगी।",
                          )}
                        </p>
                      </div>
                    )}
                    <details className="plain-details">
                      <summary>
                        {t("Floors & balcony", "मंज़िलें और बालकनी")}
                        <ChevronDown size={17} />
                      </summary>
                      <div className="stepper-row">
                        <span>{t("Total floors", "कुल मंज़िलें")}</span>
                        <div>
                          <button
                            aria-label={t("Remove a floor", "मंज़िल हटाएँ")}
                            disabled={project.floors.length <= 1}
                            onClick={() =>
                              apply(
                                setFloorCount(
                                  project,
                                  project.floors.length - 1,
                                ),
                              )
                            }
                          >
                            <Minus size={19} />
                          </button>
                          <strong>{project.floors.length}</strong>
                          <button
                            aria-label={t("Add a floor", "मंज़िल जोड़ें")}
                            disabled={project.floors.length >= 3}
                            onClick={() =>
                              apply(
                                setFloorCount(
                                  project,
                                  project.floors.length + 1,
                                ),
                              )
                            }
                          >
                            <Plus size={19} />
                          </button>
                        </div>
                      </div>
                      <p className="field-note">
                        {t(
                          "An upper floor needs space for stairs. If they do not fit, try a two-floor starting layout. This is an idea, not a structural check.",
                          "ऊपरी मंज़िल के लिए सीढ़ियों की जगह चाहिए। जगह न हो तो दो-मंज़िल वाला शुरुआती विकल्प चुनें। यह संरचना की जाँच नहीं है।",
                        )}
                      </p>
                      {activeFloor.elevation > 0 && (
                        <Switch
                          label={t("Front balcony", "सामने बालकनी")}
                          checked={activeFloor.balcony}
                          onChange={toggleBalcony}
                        />
                      )}
                    </details>
                  </>
                )}
                {panel === "rooms" && room && chosenFloor && (
                  <>
                    <div className="selected-room-stat">
                      <span
                        className="room-color"
                        style={{ background: ROOM_META[room.kind].color }}
                      >
                        <BedDouble size={23} />
                      </span>
                      <strong>
                        {area((room.bounds.w * room.bounds.d) / 10000, unit)}
                        <small>{areaLabel(unit, language)}</small>
                      </strong>
                      <span>
                        {t(
                          "Approximate room area",
                          "कमरे का अनुमानित क्षेत्रफल",
                        )}
                      </span>
                    </div>
                    <div className="field-pair">
                      <Dimension
                        label={t("Room width", "कमरे की चौड़ाई")}
                        cm={room.bounds.w}
                        unit={unit}
                        language={language}
                        min={120}
                        max={chosenFloor.footprint.w}
                        onChange={(w) =>
                          apply(
                            updateRoom(project, chosenFloor.id, room.id, {
                              bounds: { ...room.bounds, w },
                            }),
                          )
                        }
                      />
                      <Dimension
                        label={t("Room depth", "कमरे की लंबाई")}
                        cm={room.bounds.d}
                        unit={unit}
                        language={language}
                        min={120}
                        max={chosenFloor.footprint.d}
                        onChange={(d) =>
                          apply(
                            updateRoom(project, chosenFloor.id, room.id, {
                              bounds: { ...room.bounds, d },
                            }),
                          )
                        }
                      />
                    </div>
                    <p className="field-note">
                      {t(
                        "Sketch dimensions are approximate. Changes snap to a small planning grid.",
                        "माप अनुमानित हैं। बदलाव नक्शे की छोटी ग्रिड के अनुसार होंगे।",
                      )}
                    </p>
                    <div className="nudge-control">
                      <span>
                        <strong>{t("Move a little", "थोड़ा खिसकाएँ")}</strong>
                        <small>
                          {t("One small step at a time", "एक बार में छोटा कदम")}
                        </small>
                      </span>
                      <div>
                        {[
                          {
                            icon: ArrowLeft,
                            x: -10,
                            z: 0,
                            label: t("Move left", "बाईं ओर खिसकाएँ"),
                          },
                          {
                            icon: ArrowUp,
                            x: 0,
                            z: -10,
                            label: t("Move back", "पीछे खिसकाएँ"),
                          },
                          {
                            icon: ArrowDown,
                            x: 0,
                            z: 10,
                            label: t("Move forward", "आगे खिसकाएँ"),
                          },
                          {
                            icon: ArrowRight,
                            x: 10,
                            z: 0,
                            label: t("Move right", "दाईं ओर खिसकाएँ"),
                          },
                        ].map((item) => (
                          <button
                            key={item.label}
                            aria-label={item.label}
                            onClick={() => nudge(item.x, item.z)}
                          >
                            <item.icon size={18} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      className="secondary-button full"
                      onClick={() => {
                        setMode("2d");
                        setEditing(true);
                        setPanel(null);
                      }}
                    >
                      <Move size={17} />
                      {t("Move it on the floor plan", "नक्शे पर खिसकाएँ")}
                    </button>
                    <details className="plain-details">
                      <summary>
                        {t("Name & exact position", "नाम और सटीक जगह")}
                        <ChevronDown size={17} />
                      </summary>
                      <label className="select-label">
                        {t("Room name", "कमरे का नाम")}
                        <input
                          key={`${room.id}-${room.name}`}
                          aria-label={t("Room name", "कमरे का नाम")}
                          defaultValue={room.name}
                          maxLength={60}
                          onBlur={(e) => {
                            if (
                              !apply(
                                updateRoom(project, chosenFloor.id, room.id, {
                                  name: e.target.value,
                                }),
                              )
                            )
                              e.target.value = room.name;
                          }}
                        />
                      </label>
                      <div className="field-pair">
                        <Dimension
                          label={t("From the left edge", "बाएँ किनारे से")}
                          cm={room.bounds.x}
                          unit={unit}
                          language={language}
                          max={
                            chosenFloor.footprint.x +
                            chosenFloor.footprint.w -
                            room.bounds.w
                          }
                          onChange={(x) =>
                            apply(
                              updateRoom(project, chosenFloor.id, room.id, {
                                bounds: { ...room.bounds, x },
                              }),
                            )
                          }
                        />
                        <Dimension
                          label={t("From the top edge", "ऊपरी किनारे से")}
                          cm={room.bounds.z}
                          unit={unit}
                          language={language}
                          max={
                            chosenFloor.footprint.z +
                            chosenFloor.footprint.d -
                            room.bounds.d
                          }
                          onChange={(z) =>
                            apply(
                              updateRoom(project, chosenFloor.id, room.id, {
                                bounds: { ...room.bounds, z },
                              }),
                            )
                          }
                        />
                      </div>
                    </details>
                    <button
                      className="danger-link"
                      onClick={() => {
                        if (apply(removeRoom(project, chosenFloor.id, room.id)))
                          setSelected(null);
                      }}
                    >
                      <Trash2 size={16} />
                      {t("Remove room", "कमरा हटाएँ")}
                    </button>
                  </>
                )}
                {panel === "view" && (
                  <>
                    <p className="supporting">
                      {t(
                        "Look inside. Walk around. Imagine the everyday.",
                        "अंदर झाँकें। चारों ओर देखें। रोज़मर्रा की कल्पना करें।",
                      )}
                    </p>
                    <Switch
                      label={t("Show inside", "अंदर देखें")}
                      description={t(
                        "Lower the walls on the top visible floor",
                        "दिख रही ऊपरी मंज़िल की दीवारें नीची करें",
                      )}
                      icon={<Eye size={22} />}
                      checked={view.cutaway && !view.roof}
                      onChange={() =>
                        setViewing({
                          cutaway: !(view.cutaway && !view.roof),
                          roof: false,
                        })
                      }
                    />
                    <Switch
                      label={t("Show the roof", "छत देखें")}
                      checked={view.roof}
                      icon={<House size={22} />}
                      onChange={() =>
                        setViewing({
                          roof: !view.roof,
                          stage: !view.roof ? 5 : 4,
                        })
                      }
                    />
                    <Switch
                      label={t("Room names", "कमरों के नाम")}
                      checked={view.labels}
                      icon={<Grid2X2 size={22} />}
                      onChange={() => setViewing({ labels: !view.labels })}
                    />
                    <button
                      className="secondary-button full"
                      onClick={() => {
                        setViewing({
                          floor: "all",
                          resetKey: view.resetKey + 1,
                        });
                        setPanel(null);
                      }}
                    >
                      <Expand size={18} />
                      {t("Show the whole home", "पूरा घर दिखाएँ")}
                    </button>
                    <details className="plain-details">
                      <summary>
                        {t("How a home takes shape", "घर कैसे आकार लेता है")}
                        <ChevronDown size={17} />
                      </summary>
                      <div
                        className="stage-grid"
                        role="group"
                        aria-label={t("Construction stage", "निर्माण के चरण")}
                      >
                        {[
                          t("Plot", "प्लॉट"),
                          t("Foundation", "नींव"),
                          t("Frame", "ढाँचा"),
                          t("Walls", "दीवारें"),
                          t("Floors", "फ़्लोर"),
                          t("Roof", "छत"),
                        ].map((s, i) => (
                          <button
                            key={i}
                            aria-pressed={view.stage === i}
                            onClick={() => {
                              setMode("3d");
                              setViewing({ stage: i, roof: i === 5 });
                            }}
                          >
                            <i>{i + 1}</i>
                            {s}
                          </button>
                        ))}
                      </div>
                      <p className="field-note">
                        {t(
                          "An illustrative sequence. This does not check strength, materials or construction methods.",
                          "सिर्फ़ समझाने के लिए क्रम। यह मज़बूती, सामग्री या निर्माण की जाँच नहीं करता।",
                        )}
                      </p>
                    </details>
                    <details className="plain-details">
                      <summary>
                        {t("More view controls", "दृश्य के और विकल्प")}
                        <ChevronDown size={17} />
                      </summary>
                      <Switch
                        label={t("Walls", "दीवारें")}
                        checked={view.walls}
                        onChange={() => setViewing({ walls: !view.walls })}
                      />
                      <Switch
                        label={t("Doors & windows", "दरवाज़े और खिड़कियाँ")}
                        checked={view.openings}
                        onChange={() =>
                          setViewing({ openings: !view.openings })
                        }
                      />
                      <Switch
                        label={t("Landscape", "बाहरी हरियाली")}
                        checked={view.landscape}
                        onChange={() =>
                          setViewing({ landscape: !view.landscape })
                        }
                      />
                      <label className="select-label">
                        {t("North direction", "उत्तर की दिशा")}
                        <select
                          value={project.plot.north}
                          onChange={(e) =>
                            apply(
                              updatePlot(project, {
                                north: Number(e.target.value),
                              }),
                            )
                          }
                        >
                          {Array.from(
                            new Set([project.plot.north, 0, 90, 180, 270]),
                          )
                            .sort((a, b) => a - b)
                            .map((n) => (
                              <option key={n} value={n}>
                                {n}°
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="field-note">
                        {t(
                          "Orientation reference only, not a sunlight simulation.",
                          "सिर्फ़ दिशा का संदर्भ, धूप का सिमुलेशन नहीं।",
                        )}
                      </p>
                    </details>
                    <div className="advice-note">
                      <Sun size={21} />
                      <p>
                        {t(
                          "An aangan, shade and openings can be part of the conversation about light and air. Ask your architect what suits your site.",
                          "आँगन, छाया और खिड़कियों से रोशनी और हवा पर बात शुरू करें। आपके प्लॉट के लिए क्या ठीक है, आर्किटेक्ट से पूछें।",
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="overview-content">
              <span className="section-kicker">
                {t("A HOME, NOT A FORM", "अपना घर, अपने ढंग से")}
              </span>
              <h2>
                {t(
                  "Let’s make room for your life.",
                  "अपने जीवन के लिए जगह बनाएँ।",
                )}
              </h2>
              <p>
                {t(
                  "A simple place to try ideas before you speak to an architect.",
                  "आर्किटेक्ट से मिलने से पहले अपने विचार आज़माने की आसान जगह।",
                )}
              </p>
              <div className="overview-stats">
                <span>
                  <strong>{area(stats.plotArea, unit)}</strong>
                  {areaLabel(unit, language)} {t("plot", "प्लॉट")}
                </span>
                <span>
                  <strong>{stats.bedrooms}</strong>
                  {t("bedrooms", "बेडरूम")}
                </span>
              </div>
              <button
                className="primary-button full"
                onClick={() => setOverlay("start")}
              >
                {t("Start with my plot", "मेरे प्लॉट से शुरू करें")}
                <ArrowRight size={17} />
              </button>
              <div className="overview-guide">
                {[
                  {
                    icon: Ruler,
                    title: t("Your plot", "आपका प्लॉट"),
                    body: t(
                      "Start with the land you have.",
                      "अपनी ज़मीन से शुरू करें।",
                    ),
                    tab: "plot" as const,
                  },
                  {
                    icon: BedDouble,
                    title: t("Your rooms", "आपके कमरे"),
                    body: t(
                      "Give everyone a little space.",
                      "सबके लिए थोड़ी जगह।",
                    ),
                    tab: "rooms" as const,
                  },
                  {
                    icon: Eye,
                    title: t("Your view", "आपका नज़रिया"),
                    body: t(
                      "Look inside and around.",
                      "अंदर और चारों ओर देखें।",
                    ),
                    tab: "view" as const,
                  },
                ].map((item) => (
                  <button key={item.tab} onClick={() => choosePanel(item.tab)}>
                    <item.icon size={22} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <p className="privacy-note">
                <Check size={15} />
                {t(
                  "No account. No AI fees. Saved on your device.",
                  "न खाता, न AI शुल्क। आपके डिवाइस पर सेव।",
                )}
              </p>
            </div>
          )}
        </aside>
      </main>
      <nav
        className="bottom-nav"
        aria-label={t("Home controls", "घर के कंट्रोल")}
      >
        {[
          {
            id: "plot" as const,
            title: t("My plot", "मेरा प्लॉट"),
            icon: Ruler,
          },
          { id: "rooms" as const, title: t("Rooms", "कमरे"), icon: Grid2X2 },
          { id: "view" as const, title: t("View", "दृश्य"), icon: Eye },
        ].map((item) => (
          <button
            key={item.id}
            aria-expanded={panel === item.id}
            aria-pressed={panel === item.id}
            onClick={() => choosePanel(item.id)}
          >
            <item.icon size={21} strokeWidth={1.7} />
            <span>{item.title}</span>
          </button>
        ))}
      </nav>
      {((error && !panel) || message) && (
        <div
          className={`toast ${error && !panel ? "error" : ""}`}
          role="status"
        >
          <span>
            {error && !panel ? friendlyError(error, language) : message}
          </span>
          <button
            aria-label={t("Dismiss message", "संदेश हटाएँ")}
            onClick={() => {
              setMessage("");
              if (!panel) setError("");
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => void openFile(e.target.files?.[0])}
      />
      {overlay === "start" && (
        <Dialog
          label={t("Start your home", "अपना घर शुरू करें")}
          wide
          onClose={() => setOverlay(null)}
        >
          <GuidedStart
            project={project}
            language={language}
            unit={unit}
            onClose={() => setOverlay(null)}
            onUse={useStarter}
          />
        </Dialog>
      )}
      {overlay === "share" && (
        <Dialog
          label={t("Share home", "घर शेयर करें")}
          onClose={() => setOverlay(null)}
        >
          <SharePlan
            project={project}
            unit={unit}
            language={language}
            onClose={() => setOverlay(null)}
          />
        </Dialog>
      )}
      {overlay === "more" && (
        <Dialog
          label={t("More options", "और विकल्प")}
          onClose={() => setOverlay(null)}
        >
          <DialogHeading
            title={t("Your little home studio", "आपका छोटा होम स्टूडियो")}
            language={language}
            onClose={() => setOverlay(null)}
          />
          <div className="menu-body">
            {error && (
              <p className="inline-error" role="alert">
                {friendlyError(error, language)}
              </p>
            )}
            {recovery && (
              <button
                className="secondary-button"
                onClick={() =>
                  download(
                    new Blob([recovery], { type: "application/json" }),
                    "dream-home-recovery.json",
                  )
                }
              >
                {t("Recover saved file", "पुरानी फ़ाइल बचाएँ")}
              </button>
            )}
            <div className="menu-history">
              <button disabled={!canUndo} onClick={undo}>
                <Undo2 size={20} />
                {t("Undo", "वापस")}
              </button>
              <button disabled={!canRedo} onClick={redo}>
                <Redo2 size={20} />
                {t("Redo", "फिर करें")}
              </button>
            </div>
            <button className="menu-row" onClick={() => setOverlay("start")}>
              <House size={21} />
              {t("Start a new home", "नया घर शुरू करें")}
              <ChevronRight size={17} />
            </button>
            <button
              className="menu-row"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={21} />
              {t("Open a saved project", "सेव किया प्रोजेक्ट खोलें")}
              <ChevronRight size={17} />
            </button>
            <button
              className="menu-row"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(project, null, 2)], {
                    type: "application/json",
                  }),
                  "dream-home.json",
                )
              }
            >
              <Download size={21} />
              {t("Download project backup", "प्रोजेक्ट बैकअप डाउनलोड करें")}
              <ChevronRight size={17} />
            </button>
            <div className="menu-unit">
              <span>{t("Measurements", "माप")}</span>
              <div className="unit-switch">
                <button
                  aria-pressed={unit === "ft"}
                  onClick={() => setUnit("ft")}
                >
                  {t("Feet", "फ़ीट")}
                </button>
                <button
                  aria-pressed={unit === "m"}
                  onClick={() => setUnit("m")}
                >
                  {t("Metres", "मीटर")}
                </button>
              </div>
            </div>
            <button className="menu-row" onClick={() => setOverlay("help")}>
              <Sun size={21} />
              {t("Tips & how to use", "सुझाव और इस्तेमाल का तरीका")}
              <ChevronRight size={17} />
            </button>
            <details className="plain-details">
              <summary>
                {t("Keep it on your phone", "फ़ोन पर आसानी से खोलें")}
                <ChevronDown size={17} />
              </summary>
              <p className="field-note">
                {t(
                  "Once this app is hosted, open its link in your phone’s browser. On Android, use the browser menu → Add to home screen. On iPhone, use Safari’s Share menu → Add to Home Screen. Availability depends on your browser.",
                  "ऐप होस्ट होने पर उसका लिंक फ़ोन के ब्राउज़र में खोलें। Android में मेन्यू → Add to home screen। iPhone में Safari के Share मेन्यू → Add to Home Screen। सुविधा ब्राउज़र पर निर्भर है।",
                )}
              </p>
              <p className="field-note">
                {t(
                  "Your work stays in that browser. Download a project backup before changing phones or clearing browser data.",
                  "आपका काम उसी ब्राउज़र में रहता है। फ़ोन बदलने या ब्राउज़र का डेटा हटाने से पहले बैकअप डाउनलोड करें।",
                )}
              </p>
            </details>
            <p className="privacy-note">
              {t(
                "A concept to discuss with your architect. No engineering or local-rule checks.",
                "आर्किटेक्ट से चर्चा के लिए शुरुआती विचार। इंजीनियरिंग या स्थानीय नियमों की जाँच नहीं।",
              )}
            </p>
          </div>
        </Dialog>
      )}
      {overlay === "help" && (
        <Dialog
          label={t("Tips & how to use", "सुझाव और इस्तेमाल")}
          onClose={() => setOverlay(null)}
        >
          <DialogHeading
            title={t(
              "Small steps. A home that feels yours.",
              "छोटे कदम। अपने जैसा एक घर।",
            )}
            language={language}
            onClose={() => setOverlay(null)}
          />
          <div className="help-body">
            {[
              {
                icon: House,
                title: t("Start with what you know", "जो पता है, उससे शुरुआत"),
                body: t(
                  "Measured plot sides, bedrooms and floors are enough to get started. Katha or dhur alone cannot tell us the shape.",
                  "प्लॉट की लंबाई–चौड़ाई, बेडरूम और मंज़िलें शुरुआत के लिए काफ़ी हैं। सिर्फ़ कट्ठा या धुर से आकार नहीं पता चलता।",
                ),
              },
              {
                icon: Move,
                title: t("Tap first, then change", "पहले चुनें, फिर बदलें"),
                body: t(
                  "Tap a room or find it under Rooms. Change its size or use the arrows. In Floor plan, switch on Move rooms to drag.",
                  "कमरा छुएँ या “कमरे” में चुनें। माप बदलें या तीर से खिसकाएँ। नक्शे में खींचने के लिए “कमरे खिसकाएँ” चालू करें।",
                ),
              },
              {
                icon: Leaf,
                title: t(
                  "Think about the everyday",
                  "रोज़मर्रा के बारे में सोचें",
                ),
                body: t(
                  "An aangan, a bedroom downstairs and room for visitors are options to discuss with your family. Every household is different.",
                  "आँगन, नीचे बेडरूम और मेहमानों की जगह पर परिवार से बात करें। हर परिवार अलग है।",
                ),
              },
              {
                icon: Share2,
                title: t(
                  "Bring the family into the idea",
                  "परिवार के साथ विचार बाँटें",
                ),
                body: t(
                  "Share downloads a clear plan image or opens your phone’s share menu. Take it to an architect for a site-specific plan.",
                  "शेयर से साफ़ नक्शे का चित्र डाउनलोड करें या फ़ोन का शेयर मेन्यू खोलें। प्लॉट के अनुसार पूरा प्लान बनाने के लिए आर्किटेक्ट को दिखाएँ।",
                ),
              },
            ].map((item) => (
              <div className="help-item" key={item.title}>
                <item.icon size={22} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
            <div className="advice-note">
              <Compass size={21} />
              <p>
                {t(
                  "Discuss ventilation, shade, drainage, stairs and future floors with your local professional. The preview does not certify these.",
                  "हवा, छाया, पानी की निकासी, सीढ़ियाँ और भविष्य की मंज़िलों पर स्थानीय विशेषज्ञ से चर्चा करें। प्रीव्यू इनकी पुष्टि नहीं करता।",
                )}
              </p>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
