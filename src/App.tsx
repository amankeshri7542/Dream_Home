import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  Copy,
  MousePointer2,
  Columns2,
  CircleHelp,
  ZoomIn,
  ZoomOut,
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
import RoomCatalog from "./components/RoomCatalog";
import {
  duplicateRoom,
  rotateRoom,
  moveRoomSmart,
  resizeBuilding,
} from "./domain/builder";
import {
  Dialog,
  DialogHeading,
  Dimension,
  Switch,
} from "./components/Controls";
import { useProject } from "./useProject";
import {
  balconyBounds,
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
  roomName,
  unitLabel,
} from "./domain/display";
import type { Language, Unit } from "./domain/display";
import { ROOM_META } from "./domain/types";
import type { Project, Rect, ViewSettings } from "./domain/types";
const Scene = lazy(() => import("./components/Scene"));
type Panel = "plot" | "rooms" | "view" | null;
type Overlay = "start" | "share" | "more" | "help" | "catalog" | null;
function preferences() {
  try {
    const p = JSON.parse(
      localStorage.getItem("dream-home.preferences.v1") ?? "{}",
    );
    return {
      language: "en" as const,
      unit: p.unit === "m" ? ("m" as const) : ("ft" as const),
    };
  } catch {
    return { language: "en" as Language, unit: "ft" as Unit };
  }
}
function friendlyError(error: string) {
  if (error === "saved-file-unreadable")
    return "Your saved file could not be opened. It has been kept safe. Use “Recover saved file” in More before making changes.";
  if (error === "storage-unavailable")
    return "Saving is unavailable on this device. Download your project file to keep your changes.";
  if (/overlap/i.test(error))
    return "That space is already used. Try a clear area or make the room smaller.";
  if (/No free space/i.test(error))
    return "This room needs more space. Try a smaller size or expand the building area.";
  return error;
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
    language = "en" as const,
    [unit, setUnit] = useState<Unit>(prefs.unit);
  const [panel, setPanel] = useState<Panel>(null),
    [overlay, setOverlay] = useState<Overlay>(null),
    [welcome, setWelcome] = useState(!hasSavedProject);
  const [mode, setMode] = useState<"3d" | "2d" | "split">("3d"),
    [tool, setTool] = useState<"select" | "move" | "resize">("select"),
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
  const [message, setMessage] = useState("");
  const [cameraView, setCameraView] = useState<"orbit" | "front" | "top">(
    "orbit",
  );
  const [zoomStep, setZoomStep] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const editing = tool !== "select";
  const setEditing = (value: boolean) => setTool(value ? "move" : "select");
  const fileInput = useRef<HTMLInputElement>(null);
  const buildingArea = useRef<HTMLDetailsElement>(null);
  const [focusBuilding, setFocusBuilding] = useState(false);
  useEffect(() => {
    if (panel === "plot" && focusBuilding) {
      buildingArea.current?.scrollIntoView({ block: "nearest" });
      setFocusBuilding(false);
    }
  }, [panel, focusBuilding]);
  const stats = projectStats(project),
    activeFloor =
      project.floors.find((f) => f.id === view.floor) ?? project.floors[0];
  const chosenFloor = project.floors.find((f) =>
      f.rooms.some((r) => r.id === selected),
    ),
    room = chosenFloor?.rooms.find((r) => r.id === selected);
  const title = project.name;
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
      if (tool === "select") setPanel("rooms");
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
    setTool("select");
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
    setTool("select");
    setViewing({
      floor: "all",
      stage: 4,
      cutaway: true,
      roof: false,
      resetKey: view.resetKey + 1,
    });
    setMessage("Your starting home is ready. Tap a room or choose Add room.");
  }
  async function openFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 200000)
        throw new Error("Choose a project file smaller than 200 KB.");
      const next = parseProject(await file.text());
      commit(next);
      setOverlay(null);
      setSelected(null);
      setPanel(null);
      setWelcome(false);
      setViewing({ floor: "all", resetKey: view.resetKey + 1 });
      setMessage("Home opened. Undo brings back your previous idea.");
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
  function beginTool(next: "select" | "move" | "resize") {
    setTool(next);
    setWelcome(false);
    setPanel(null);
    setError("");
    setMode((current) => (current === "split" ? "split" : "2d"));
    setViewing({ floor: activeFloor.id });
    setMessage(
      next === "resize"
        ? "Tap a room, then drag its round corner to resize."
        : next === "move"
          ? "Drag a room to a clear space. Drop on a compatible room to swap."
          : "Tap any room to see its size and options.",
    );
  }
  function changeRoomOnPlan(id: string, bounds: Rect) {
    const result =
      tool === "move"
        ? moveRoomSmart(project, activeFloor.id, id, bounds)
        : updateRoom(project, activeFloor.id, id, { bounds });
    if (apply(result))
      setMessage(
        tool === "resize"
          ? "Room resized. Undo is always here."
          : "Room moved. Undo is always here.",
      );
  }
  function showOutside() {
    setMode("3d");
    setTool("select");
    setWelcome(false);
    setCameraView("orbit");
    setViewing({
      floor: "all",
      stage: 5,
      roof: true,
      cutaway: false,
      walls: true,
      openings: true,
    });
  }
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth < 1050 && mode === "split") setMode("2d");
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mode]);
  const panelTitle =
    panel === "plot"
      ? "Your plot"
      : panel === "rooms"
        ? room
          ? roomName(room)
          : "Make room for everyone"
        : "See your home differently";
  const instructions = "Drag to turn · pinch to zoom";

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
        <span className="topbar-tagline">{"A little closer to home."}</span>
        <div className="topbar-actions">
          <span className="desktop-history">
            <button
              className="round-button"
              aria-label={"Undo"}
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={19} />
            </button>
            <button
              className="round-button"
              aria-label={"Redo"}
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2 size={19} />
            </button>
          </span>
          <button
            className="share-button"
            aria-label={"Share home plan"}
            onClick={() => setOverlay("share")}
          >
            <Share2 size={18} />
            <span>{"Share"}</span>
          </button>
          <button
            className="round-button"
            aria-label={"More options"}
            onClick={() => setOverlay("more")}
          >
            <MoreHorizontal size={24} />
            <span className="button-word">More</span>
          </button>
        </div>
      </header>
      <main className="studio">
        <section
          className={`scene-area ${welcome ? "with-welcome" : ""}`}
          aria-label={"Your home preview"}
        >
          <div className="scene-heading">
            <span className="section-kicker">
              {welcome ? "AN IDEA TO BEGIN WITH" : "YOUR HOME, TAKING SHAPE"}
            </span>
            <h1>{title}</h1>
            <p>
              {length(project.plot.width, unit)} ×{" "}
              {length(project.plot.depth, unit)} {unitLabel(unit)}
              <i /> {stats.bedrooms} {"bedrooms"}
              <i />
              {project.floors.length === 1
                ? "Ground floor"
                : `${project.floors.length} floors`}
            </p>
          </div>
          <div className="view-switch" role="group" aria-label={"View mode"}>
            <button
              aria-pressed={mode === "3d"}
              onClick={() => {
                setMode("3d");
                setEditing(false);
              }}
            >
              <House size={17} />
              {"3D home"}
            </button>
            <button
              aria-pressed={mode === "2d"}
              onClick={() => {
                setMode("2d");
                setWelcome(false);
              }}
            >
              <Grid2X2 size={17} />
              {"Floor plan"}
            </button>
            <button
              className="desktop-only"
              aria-pressed={mode === "split"}
              onClick={() => {
                setMode("split");
                setWelcome(false);
                setTool("select");
              }}
            >
              <Columns2 size={18} />
              Plan + 3D
            </button>
          </div>
          <div className={`model-canvas mode-${mode}`}>
            <div className="scene-pane" hidden={mode === "2d"}>
              {mode !== "2d" && (
                <Suspense
                  fallback={
                    <div className="scene-loading">
                      <House size={29} />
                      <span>{"Getting your home ready…"}</span>
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
                    cameraView={cameraView}
                    zoomStep={zoomStep}
                  />
                </Suspense>
              )}
            </div>
            <div className="plan-pane" hidden={mode === "3d"}>
              {mode !== "3d" && (
                <Plan
                  project={project}
                  floor={activeFloor}
                  selected={selected}
                  onSelect={selectRoom}
                  view={view}
                  language={language}
                  unit={unit}
                  editable={editing}
                  tool={tool}
                  onMove={changeRoomOnPlan}
                />
              )}
            </div>
          </div>
          {!welcome && (
            <>
              <div
                className="build-toolbar"
                role="toolbar"
                aria-label="Building tools"
              >
                <button
                  onClick={() => {
                    setOverlay("catalog");
                    setError("");
                  }}
                >
                  <Plus size={23} />
                  <span>Add room</span>
                </button>
                <button
                  aria-pressed={tool === "move"}
                  onClick={() => beginTool(tool === "move" ? "select" : "move")}
                >
                  <Move size={22} />
                  <span>Move</span>
                </button>
                <button
                  aria-pressed={tool === "resize"}
                  onClick={() =>
                    beginTool(tool === "resize" ? "select" : "resize")
                  }
                >
                  <Expand size={22} />
                  <span>Resize</span>
                </button>
                <button
                  disabled={!canUndo}
                  aria-label="Undo last change"
                  onClick={undo}
                >
                  <Undo2 size={22} />
                  <span>Undo</span>
                </button>
                <button onClick={() => setOverlay("help")}>
                  <CircleHelp size={22} />
                  <span>Help</span>
                </button>
              </div>
              {room && editing && (
                <button
                  className="selected-chip"
                  onClick={() => {
                    setTool("select");
                    setPanel("rooms");
                  }}
                >
                  <MousePointer2 size={17} />
                  {room.name}
                  <span>Edit details</span>
                  <ChevronRight size={17} />
                </button>
              )}
              {!panel && tool === "select" && showGuide && (
                <div className="next-step">
                  <div>
                    <strong>Make it yours</strong>
                    <span>Use Move or Resize, or add a new room.</span>
                  </div>
                  <button
                    aria-label="Dismiss building tip"
                    onClick={() => setShowGuide(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </>
          )}
          <div className="camera-actions">
            <button
              aria-label="Reset view"
              onClick={() => {
                setZoomStep(0);
                setCameraView("orbit");
                setViewing({ resetKey: view.resetKey + 1 });
              }}
            >
              <Maximize size={19} />
              <span>Fit</span>
            </button>
            {mode !== "2d" && (
              <>
                <button
                  aria-label="Zoom in on home"
                  onClick={() => setZoomStep((n) => Math.min(8, n + 1))}
                >
                  <ZoomIn size={20} />
                </button>
                <button
                  aria-label="Zoom out of home"
                  onClick={() => setZoomStep((n) => Math.max(-4, n - 1))}
                >
                  <ZoomOut size={20} />
                </button>
              </>
            )}
          </div>
          {project.floors.length > 1 && (
            <div className="floating-floors">
              <select
                aria-label={"Visible floor"}
                value={mode === "3d" ? view.floor : activeFloor.id}
                onChange={(e) => chooseFloor(e.target.value)}
              >
                {mode === "3d" && <option value="all">Whole home</option>}
                {project.floors.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    {floorName(i)}
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
                <h2>{"Your plot. Your people. Your home."}</h2>
                <p>{"Tell us a little. Try a few possibilities."}</p>
              </div>
              <button
                className="primary-button"
                onClick={() => setOverlay("start")}
              >
                {"Start with my plot"}
                <ArrowRight size={18} />
              </button>
              <button
                className="text-link"
                onClick={() => {
                  setWelcome(false);
                  setShowGuide(true);
                }}
              >
                {"Just explore this sample"}
              </button>
            </div>
          ) : (
            <div className="scene-footnote">
              <span>
                <i />
                {saved ? "Saved on this device" : "Not saved—download a copy"}
              </span>
              <small>
                {mode === "3d" ? instructions : "Tap a room to see its size"}
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
                    aria-label={"Back to rooms"}
                    onClick={() => setSelected(null)}
                  >
                    <ArrowLeft size={21} />
                  </button>
                )}
                <div>
                  <span className="section-kicker">
                    {room
                      ? floorName(project.floors.indexOf(chosenFloor!))
                      : "MAKE IT YOURS"}
                  </span>
                  <h2>{panelTitle}</h2>
                </div>
                <button
                  className="round-button"
                  aria-label={"Close controls"}
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
                    <span>{friendlyError(error)}</span>
                    <button
                      aria-label={"Dismiss error"}
                      onClick={() => setError("")}
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {panel === "plot" && (
                  <>
                    <p className="supporting">
                      {"A few measurements. A world of possibilities."}
                    </p>
                    <div className="plot-stat">
                      <Ruler size={24} />
                      <strong>
                        {area(stats.plotArea, unit)}
                        <small>
                          {areaLabel(unit)} {"plot area"}
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
                        label={"Plot width"}
                        cm={project.plot.width}
                        unit={unit}
                        language={language}
                        min={400}
                        onChange={(width) =>
                          apply(updatePlot(project, { width }))
                        }
                      />
                      <Dimension
                        label={"Plot depth"}
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
                      {"Road is on this side"}
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
                            {roadName(side)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className="plain-details">
                      <summary>
                        {"Space around the home"}
                        <ChevronDown size={17} />
                      </summary>
                      <Dimension
                        label={"Open margin on each side"}
                        cm={project.plot.setback}
                        unit={unit}
                        language={language}
                        max={2000}
                        onChange={(setback) =>
                          apply(updatePlot(project, { setback }))
                        }
                      />
                      <p className="field-note">
                        {
                          "A sketch assumption, not the local setback rule. Your architect can confirm the space to leave."
                        }
                      </p>
                      <Switch
                        label={"Garden & green space"}
                        checked={project.garden}
                        icon={<Leaf size={20} />}
                        onChange={() =>
                          commit({ ...project, garden: !project.garden })
                        }
                      />
                      <Switch
                        label={"Open parking"}
                        description={
                          "Shown only where a car fits outside the home"
                        }
                        checked={project.parking}
                        icon={<Grid2X2 size={20} />}
                        onChange={() =>
                          commit({ ...project, parking: !project.parking })
                        }
                      />
                    </details>
                    <details className="plain-details building-area" open>
                      <summary>
                        Building area <ChevronDown size={17} />
                      </summary>
                      <p className="field-note">
                        Make space for more rooms. This changes the outline on
                        every floor and keeps existing rooms in place.
                      </p>
                      <button
                        className="secondary-button full"
                        onClick={() => {
                          const { plot } = project;
                          const { x, z } = activeFloor.footprint;
                          if (
                            apply(
                              resizeBuilding(project, activeFloor.id, {
                                w:
                                  Math.floor(
                                    (plot.width - plot.setback - x) / 10,
                                  ) * 10,
                                d:
                                  Math.floor(
                                    (plot.depth -
                                      plot.setback -
                                      z -
                                      Math.max(
                                        0,
                                        ...project.floors.map((f) =>
                                          f.balcony ? balconyBounds(f).d : 0,
                                        ),
                                      )) /
                                      10,
                                  ) * 10,
                              }),
                            )
                          )
                            setMessage(
                              "Building area expanded within your sketch margin. You can add rooms now.",
                            );
                        }}
                      >
                        <Expand size={18} />
                        Use available plot space
                      </button>
                      <div className="field-pair">
                        <Dimension
                          label="Building width"
                          cm={activeFloor.footprint.w}
                          unit={unit}
                          language={language}
                          min={300}
                          max={project.plot.width}
                          onChange={(w) =>
                            apply(
                              resizeBuilding(project, activeFloor.id, {
                                w,
                                d: activeFloor.footprint.d,
                              }),
                            )
                          }
                        />
                        <Dimension
                          label="Building depth"
                          cm={activeFloor.footprint.d}
                          unit={unit}
                          language={language}
                          min={300}
                          max={project.plot.depth}
                          onChange={(d) =>
                            apply(
                              resizeBuilding(project, activeFloor.id, {
                                w: activeFloor.footprint.w,
                                d,
                              }),
                            )
                          }
                        />
                      </div>
                    </details>
                    <button
                      className="secondary-button full"
                      onClick={() => setOverlay("start")}
                    >
                      <RotateCcw size={17} />
                      {"Find layouts for this plot"}
                    </button>
                    <p className="field-note">
                      {
                        "Changing the plot keeps your rooms in place. Start a new layout to rearrange the whole home."
                      }
                    </p>
                  </>
                )}
                {panel === "rooms" && !room && (
                  <>
                    <p className="supporting">
                      {"Tap a room. Give it a little more space."}
                    </p>
                    <div className="floor-control">
                      <select
                        aria-label={"Editing floor"}
                        value={activeFloor.id}
                        onChange={(e) => chooseFloor(e.target.value)}
                      >
                        {project.floors.map((f, i) => (
                          <option key={f.id} value={f.id}>
                            {floorName(i)}
                          </option>
                        ))}
                      </select>
                      <span>
                        {activeFloor.rooms.length} {"spaces"}
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
                            <strong>{roomName(r)}</strong>
                            <small>
                              {length(r.bounds.w, unit)} ×{" "}
                              {length(r.bounds.d, unit)} {unitLabel(unit)}
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                    </div>
                    <button
                      className="primary-button full"
                      onClick={() => setOverlay("catalog")}
                    >
                      <Plus size={20} />
                      Add a room
                    </button>
                    {activeFloor.voids.some((v) => v.kind === "courtyard") && (
                      <div className="advice-note">
                        <Sun size={20} />
                        <p>
                          {
                            "Your aangan is open to the sky. Its position stays aligned across floors in this version."
                          }
                        </p>
                      </div>
                    )}
                    <details className="plain-details">
                      <summary>
                        {"Floors & balcony"}
                        <ChevronDown size={17} />
                      </summary>
                      <div className="stepper-row">
                        <span>{"Total floors"}</span>
                        <div>
                          <button
                            aria-label={"Remove a floor"}
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
                            aria-label={"Add a floor"}
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
                        {
                          "An upper floor needs space for stairs. If they do not fit, try a two-floor starting layout. This is an idea, not a structural check."
                        }
                      </p>
                      {activeFloor.elevation > 0 && (
                        <Switch
                          label={"Front balcony"}
                          checked={activeFloor.balcony}
                          onChange={toggleBalcony}
                        />
                      )}
                    </details>
                  </>
                )}
                {panel === "rooms" && room && chosenFloor && (
                  <>
                    <div className="room-quick-actions">
                      <button onClick={() => beginTool("move")}>
                        <Move size={21} />
                        Move room
                      </button>
                      <button onClick={() => beginTool("resize")}>
                        <Expand size={21} />
                        Resize room
                      </button>
                      <button
                        onClick={() => {
                          if (
                            apply(rotateRoom(project, chosenFloor.id, room.id))
                          )
                            setMessage("Room rotated a quarter turn.");
                        }}
                      >
                        <RotateCcw size={21} />
                        Rotate
                      </button>
                      <button
                        onClick={() => {
                          const result = duplicateRoom(
                            project,
                            chosenFloor.id,
                            room.id,
                          );
                          if (apply(result) && result.ok) {
                            setSelected(
                              result.project.floors
                                .find((f) => f.id === chosenFloor.id)!
                                .rooms.at(-1)!.id,
                            );
                            setMessage(
                              "Room duplicated. Move it anywhere it fits.",
                            );
                          }
                        }}
                      >
                        <Copy size={21} />
                        Duplicate
                      </button>
                    </div>
                    <div className="selected-room-stat">
                      <span
                        className="room-color"
                        style={{ background: ROOM_META[room.kind].color }}
                      >
                        <BedDouble size={23} />
                      </span>
                      <strong>
                        {area((room.bounds.w * room.bounds.d) / 10000, unit)}
                        <small>{areaLabel(unit)}</small>
                      </strong>
                      <span>{"Approximate room area"}</span>
                    </div>
                    <div className="field-pair">
                      <Dimension
                        label={"Room width"}
                        stepper
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
                        label={"Room depth"}
                        stepper
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
                      {
                        "Sketch dimensions are approximate. Changes snap to a small planning grid."
                      }
                    </p>
                    <div className="nudge-control">
                      <span>
                        <strong>{"Move a little"}</strong>
                        <small>{"One small step at a time"}</small>
                      </span>
                      <div>
                        {[
                          {
                            icon: ArrowLeft,
                            x: -10,
                            z: 0,
                            label: "Move left",
                          },
                          {
                            icon: ArrowUp,
                            x: 0,
                            z: -10,
                            label: "Move back",
                          },
                          {
                            icon: ArrowDown,
                            x: 0,
                            z: 10,
                            label: "Move forward",
                          },
                          {
                            icon: ArrowRight,
                            x: 10,
                            z: 0,
                            label: "Move right",
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
                      {"Move it on the floor plan"}
                    </button>
                    <details className="plain-details">
                      <summary>
                        {"Name & exact position"}
                        <ChevronDown size={17} />
                      </summary>
                      <label className="select-label">
                        Swap positions with
                        <select
                          aria-label="Swap positions with"
                          value=""
                          onChange={(event) => {
                            const other = chosenFloor.rooms.find(
                              (r) => r.id === event.target.value,
                            );
                            if (!other) return;
                            if (
                              apply(
                                moveRoomSmart(
                                  project,
                                  chosenFloor.id,
                                  room.id,
                                  {
                                    ...room.bounds,
                                    x:
                                      other.bounds.x +
                                      (other.bounds.w - room.bounds.w) / 2,
                                    z:
                                      other.bounds.z +
                                      (other.bounds.d - room.bounds.d) / 2,
                                  },
                                ),
                              )
                            ) {
                              setMode("2d");
                              setMessage(
                                "Rooms swapped. Their sizes stay the same.",
                              );
                            }
                          }}
                        >
                          <option value="">Choose another room</option>
                          {chosenFloor.rooms
                            .filter((r) => r.id !== room.id)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="select-label">
                        {"Room name"}
                        <input
                          key={`${room.id}-${room.name}`}
                          aria-label={"Room name"}
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
                          label={"From the left edge"}
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
                          label={"From the top edge"}
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
                      {"Remove room"}
                    </button>
                  </>
                )}
                {panel === "view" && (
                  <>
                    <div className="view-presets">
                      <button
                        onClick={() => {
                          setMode("3d");
                          setCameraView("orbit");
                          setViewing({
                            stage: 4,
                            roof: false,
                            cutaway: true,
                            walls: true,
                          });
                        }}
                      >
                        <House size={23} />
                        See inside
                      </button>
                      <button onClick={showOutside}>
                        <Eye size={23} />
                        See outside
                      </button>
                      <button
                        onClick={() => {
                          setMode("3d");
                          setCameraView("front");
                          setViewing({
                            stage: 5,
                            roof: true,
                            cutaway: false,
                            floor: "all",
                            walls: true,
                          });
                        }}
                      >
                        <Grid2X2 size={23} />
                        Front view
                      </button>
                    </div>
                    <fieldset className="finish-choices">
                      <legend>Exterior finish</legend>
                      {(["ivory", "brick", "sand"] as const).map((finish) => (
                        <button
                          key={finish}
                          aria-pressed={(project.finish ?? "ivory") === finish}
                          onClick={() => {
                            commit({ ...project, finish });
                            showOutside();
                          }}
                        >
                          <i className={`finish-${finish}`} />
                          {finish === "ivory"
                            ? "Ivory plaster"
                            : finish === "brick"
                              ? "Warm brick"
                              : "Sandstone"}
                        </button>
                      ))}
                    </fieldset>
                    <p className="supporting">
                      {
                        "Look inside, see the outside, or try a different finish."
                      }
                    </p>
                    <Switch
                      label={"Show inside"}
                      description={"Lower the walls on the top visible floor"}
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
                      label={"Show the roof"}
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
                      label={"Room names"}
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
                      {"Show the whole home"}
                    </button>
                    <details className="plain-details">
                      <summary>
                        {"How a home takes shape"}
                        <ChevronDown size={17} />
                      </summary>
                      <div
                        className="stage-grid"
                        role="group"
                        aria-label={"Construction stage"}
                      >
                        {[
                          "Plot",
                          "Foundation",
                          "Frame",
                          "Walls",
                          "Floors",
                          "Roof",
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
                        {
                          "An illustrative sequence. This does not check strength, materials or construction methods."
                        }
                      </p>
                    </details>
                    <details className="plain-details">
                      <summary>
                        {"More view controls"}
                        <ChevronDown size={17} />
                      </summary>
                      <Switch
                        label={"Walls"}
                        checked={view.walls}
                        onChange={() => setViewing({ walls: !view.walls })}
                      />
                      <Switch
                        label={"Doors & windows"}
                        checked={view.openings}
                        onChange={() =>
                          setViewing({ openings: !view.openings })
                        }
                      />
                      <Switch
                        label={"Landscape"}
                        checked={view.landscape}
                        onChange={() =>
                          setViewing({ landscape: !view.landscape })
                        }
                      />
                      <label className="select-label">
                        {"North direction"}
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
                        {
                          "Orientation reference only, not a sunlight simulation."
                        }
                      </p>
                    </details>
                    <div className="advice-note">
                      <Sun size={21} />
                      <p>
                        {
                          "An aangan, shade and openings can be part of the conversation about light and air. Ask your architect what suits your site."
                        }
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="overview-content">
              <span className="section-kicker">{"A HOME, NOT A FORM"}</span>
              <h2>{"Let’s make room for your life."}</h2>
              <p>
                {
                  "A simple place to try ideas before you speak to an architect."
                }
              </p>
              <div className="overview-stats">
                <span>
                  <strong>{area(stats.plotArea, unit)}</strong>
                  {areaLabel(unit)} {"plot"}
                </span>
                <span>
                  <strong>{stats.bedrooms}</strong>
                  {"bedrooms"}
                </span>
              </div>
              <button
                className="primary-button full"
                onClick={() => setOverlay("start")}
              >
                {"Start with my plot"}
                <ArrowRight size={17} />
              </button>
              <div className="overview-guide">
                {[
                  {
                    icon: Ruler,
                    title: "Your plot",
                    body: "Start with the land you have.",
                    tab: "plot" as const,
                  },
                  {
                    icon: BedDouble,
                    title: "Your rooms",
                    body: "Give everyone a little space.",
                    tab: "rooms" as const,
                  },
                  {
                    icon: Eye,
                    title: "Your view",
                    body: "Look inside and around.",
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
                {"No account. No AI fees. Saved on your device."}
              </p>
            </div>
          )}
        </aside>
      </main>
      <nav className="bottom-nav" aria-label={"Home controls"}>
        {[
          {
            id: "plot" as const,
            title: "My plot",
            icon: Ruler,
          },
          { id: "rooms" as const, title: "Rooms", icon: Grid2X2 },
          { id: "view" as const, title: "View", icon: Eye },
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
      {((error && !panel) || (message && !editing)) && (
        <div
          className={`toast ${error && !panel ? "error" : ""}`}
          role="status"
        >
          <span>{error && !panel ? friendlyError(error) : message}</span>
          <button
            aria-label={"Dismiss message"}
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
      {overlay === "catalog" && (
        <Dialog label="Add a room" onClose={() => setOverlay(null)}>
          <RoomCatalog
            project={project}
            floorId={activeFloor.id}
            unit={unit}
            onClose={() => setOverlay(null)}
            onExpand={() => {
              setOverlay(null);
              setPanel("plot");
              setFocusBuilding(true);
              setWelcome(false);
              setMessage(
                "Adjust Building area to leave a clear space for another room.",
              );
            }}
            onUse={(next, id) => {
              commit(next);
              setOverlay(null);
              setWelcome(false);
              setMode("2d");
              setTool("move");
              setPanel(null);
              setSelected(id);
              setViewing({ floor: activeFloor.id });
              setMessage(
                "Room added. Drag it to adjust its position, or tap Edit details.",
              );
            }}
          />
        </Dialog>
      )}
      {overlay === "start" && (
        <Dialog label={"Start your home"} wide onClose={() => setOverlay(null)}>
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
        <Dialog label={"Share home"} onClose={() => setOverlay(null)}>
          <SharePlan
            project={project}
            unit={unit}
            language={language}
            onClose={() => setOverlay(null)}
          />
        </Dialog>
      )}
      {overlay === "more" && (
        <Dialog label={"More options"} onClose={() => setOverlay(null)}>
          <DialogHeading
            title={"Your home & settings"}
            language={language}
            onClose={() => setOverlay(null)}
          />
          <div className="menu-body">
            {error && (
              <p className="inline-error" role="alert">
                {friendlyError(error)}
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
                {"Recover saved file"}
              </button>
            )}
            <div className="menu-history">
              <button disabled={!canUndo} onClick={undo}>
                <Undo2 size={20} />
                {"Undo"}
              </button>
              <button disabled={!canRedo} onClick={redo}>
                <Redo2 size={20} />
                {"Redo"}
              </button>
            </div>
            <button className="menu-row" onClick={() => setOverlay("start")}>
              <House size={21} />
              {"Start a new home"}
              <ChevronRight size={17} />
            </button>
            <button
              className="menu-row"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={21} />
              {"Open a saved project"}
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
              {"Download project backup"}
              <ChevronRight size={17} />
            </button>
            <div className="menu-unit">
              <span>{"Measurements"}</span>
              <div className="unit-switch">
                <button
                  aria-pressed={unit === "ft"}
                  onClick={() => setUnit("ft")}
                >
                  {"Feet"}
                </button>
                <button
                  aria-pressed={unit === "m"}
                  onClick={() => setUnit("m")}
                >
                  {"Metres"}
                </button>
              </div>
            </div>
            <button className="menu-row" onClick={() => setOverlay("help")}>
              <Sun size={21} />
              {"Tips & how to use"}
              <ChevronRight size={17} />
            </button>
            <details className="plain-details">
              <summary>
                {"Keep it on your phone"}
                <ChevronDown size={17} />
              </summary>
              <p className="field-note">
                {
                  "Once this app is hosted, open its link in your phone’s browser. On Android, use the browser menu → Add to home screen. On iPhone, use Safari’s Share menu → Add to Home Screen. Availability depends on your browser."
                }
              </p>
              <p className="field-note">
                {
                  "Your work stays in that browser. Download a project backup before changing phones or clearing browser data."
                }
              </p>
            </details>
            <p className="privacy-note">
              {
                "A concept to discuss with your architect. No engineering or local-rule checks."
              }
            </p>
          </div>
        </Dialog>
      )}
      {overlay === "help" && (
        <Dialog label={"Tips & how to use"} onClose={() => setOverlay(null)}>
          <DialogHeading
            title={"Small steps. A home that feels yours."}
            language={language}
            onClose={() => setOverlay(null)}
          />
          <div className="help-body">
            {[
              {
                icon: House,
                title: "Start with what you know",
                body: "Measured plot sides, bedrooms and floors are enough to get started. Katha or dhur alone cannot tell us the shape.",
              },
              {
                icon: Move,
                title: "Tap first, then change",
                body: "Tap a room or find it under Rooms. Change its size or use the arrows. Use Move to drag a room or swap compatible rooms. Use Resize to drag its round corner. Green fits; red needs another spot.",
              },
              {
                icon: Leaf,
                title: "Think about the everyday",
                body: "An aangan, a bedroom downstairs and room for visitors are options to discuss with your family. Every household is different.",
              },
              {
                icon: Share2,
                title: "Bring the family into the idea",
                body: "Share downloads a clear plan image or opens your phone’s share menu. Take it to an architect for a site-specific plan.",
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
                {
                  "Discuss ventilation, shade, drainage, stairs and future floors with your local professional. The preview does not certify these."
                }
              </p>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
