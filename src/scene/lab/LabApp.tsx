// Scene lab: renders renderer v2 full-screen with a small control panel.
// URL params seed the state so screenshots are reproducible:
//   ?project=compact&hour=10.5&quality=balanced&mode=build&cutaway=1&roof=0
//   &roofStyle=gable&exterior=brick&select=<roomId>&camera=top&labels=1&panel=0
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Cmd = DistOmit<CameraCommand, "id">;
import { createBlueprint, type BlueprintRequest } from "../../domain/blueprints";
import { createPreset } from "../../domain/model";
import { createStarter } from "../../domain/starters";
import { EXTERIOR_FINISHES, type ExteriorFinishId } from "../../domain/materials";
import type { Project, RoofStyle } from "../../domain/types";
import type { CameraCommand, EditorMode, ExploreView, GhostPreview, QualitySetting, SelectionTarget } from "../../editor/types";
import type { SceneView } from "../types";
import type { PhotoJobRequest, PhotoOutcome } from "../../photo/PhotoRenderer";
import { LOOK_ORDER } from "../../domain/looks";
import type { StylePreset } from "../../domain/types";
import { lookSample, toWebp } from "./lookThumbs";

const Scene = lazy(() => import("../Scene"));

const blueprint = (patch: Partial<BlueprintRequest>): Project | null => {
  const r = createBlueprint({
    widthCm: 1219,
    depthCm: 1829,
    marginCm: 60,
    road: "south",
    kind: "home",
    floors: 1,
    bedrooms: 3,
    unitsPerFloor: 2,
    bedroomsPerUnit: 2,
    shopsPerFloor: 2,
    ...patch,
  });
  return r.ok ? r.project : null;
};

const PROJECTS: Record<string, () => Project | null> = {
  compact: () => createPreset("compact"),
  courtyard: () => createPreset("courtyard"),
  family: () => createPreset("family"),
  villa: () => blueprint({ flavor: "villa" }),
  duplex: () => blueprint({ flavor: "duplex", floors: 2 }),
  "home-3f-east": () => blueprint({ floors: 3, road: "east", bedrooms: 5 }),
  "home-courtyard": () => blueprint({ courtyard: true }),
  "apartments-8f": () => blueprint({ kind: "apartments", floors: 8, widthCm: 2400, depthCm: 3000 }),
  "apartments-3f": () => blueprint({ kind: "apartments", floors: 3 }),
  "market-2f": () => blueprint({ kind: "market", floors: 2 }),
  "starter-courtyard-2f": () => {
    const r = createStarter({ widthCm: 1219, depthCm: 1829, road: "south", marginCm: 60, bedrooms: 2, floors: 2 }, "courtyard");
    return r.ok ? r.project : null;
  },
};

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const bool = (k: string, d: boolean) => (params.has(k) ? params.get(k) === "1" || params.get(k) === "true" : d);

export function LabApp() {
  const [projectKey, setProjectKey] = useState(params.get("project") ?? "compact");
  // Screenshot scripts can hand the lab any project (`__lab.useProject(p)`).
  const [custom, setCustom] = useState<Project | null>(null);
  const [roofStyle, setRoofStyle] = useState<RoofStyle | "">((params.get("roofStyle") as RoofStyle) ?? "");
  const [exterior, setExterior] = useState<ExteriorFinishId | "">((params.get("exterior") as ExteriorFinishId) ?? "");
  const [hour, setHour] = useState(num("hour", 10.5));
  const [quality, setQuality] = useState<QualitySetting>((params.get("quality") as QualitySetting) ?? "auto");
  const [mode, setMode] = useState<EditorMode>((params.get("mode") as EditorMode) ?? "build");
  const [explore, setExplore] = useState<ExploreView>((params.get("explore") as ExploreView) ?? "orbit");
  const [view, setView] = useState<SceneView>({
    floor: params.get("floor") ?? "all",
    stage: num("stage", 5),
    cutaway: bool("cutaway", true),
    walls: bool("walls", true),
    openings: bool("openings", true),
    landscape: bool("landscape", true),
    labels: bool("labels", false),
    furnishings: bool("furnishings", true),
    roof: bool("roof", false),
    resetKey: 0,
  });
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [panel] = useState(bool("panel", true));
  const [insets, setInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [ghost, setGhost] = useState<GhostPreview | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  // Render-quality photos for scripts (look cards).
  const [photoJob, setPhotoJob] = useState<PhotoJobRequest | null>(null);
  const photoDone = useRef<((outcome: PhotoOutcome) => void) | null>(null);
  const photo = (job: Omit<PhotoJobRequest, "id">) =>
    new Promise<PhotoOutcome>((resolve) => {
      photoDone.current = resolve;
      setPhotoJob({ id: Date.now(), ...job });
    });

  const project = useMemo(() => {
    const base = custom ?? (PROJECTS[projectKey] ?? PROJECTS.compact)() ?? createPreset("compact");
    const style = { ...(base.style ?? {}) };
    if (roofStyle) style.roof = { style: roofStyle, material: roofStyle === "flat" ? "membrane" : style.roof?.material ?? "terracotta", pitch: style.roof?.pitch ?? 30 };
    if (exterior) style.exterior = exterior;
    return { ...base, style };
  }, [projectKey, roofStyle, exterior, custom]);

  // Initial selection from ?select=<roomId>.
  useEffect(() => {
    const id = params.get("select");
    if (!id) return;
    const floor = project.floors.find((f) => f.rooms.some((r) => r.id === id));
    if (floor) setSelection({ kind: "room", floorId: floor.id, id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Initial camera view from ?camera=top|front|plot.
  useEffect(() => {
    const cam = params.get("camera");
    if (!cam) return;
    const t = window.setTimeout(() => {
      if (cam === "top") setCommand({ id: 9001, type: "fit", subject: "home", view: "top", instant: true });
      if (cam === "front") setCommand({ id: 9001, type: "fit", subject: "home", view: "front", instant: true });
      if (cam === "plot") setCommand({ id: 9001, type: "fit", subject: "plot", view: "hero", instant: true });
    }, 1600);
    return () => window.clearTimeout(t);
  }, []);
  // Scripting hook for screenshots.
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = {
      setHour,
      setView: (patch: Partial<SceneView>) => setView((v) => ({ ...v, ...patch })),
      setProject: setProjectKey,
      useProject: setCustom,
      setRoofStyle,
      setExterior,
      setMode,
      setExplore,
      setQuality,
      select: (target: SelectionTarget | null) => setSelection(target),
      camera: (c: Cmd) => setCommand({ ...(c as CameraCommand), id: Date.now() }),
      setInsets,
      setGhost,
      setHighlight,
      project: () => project,
      photo,
      looks: () => [...LOOK_ORDER],
      /**
       * A look card: the sample home seen from across the road, a third of the
       * way round to one side, in clear morning light so its materials read
       * true (golden light turns every look the same orange), as WebP.
       */
      lookThumb: async (look: StylePreset, width = 480) => {
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        setCustom(lookSample(look));
        setMode("explore");
        setExplore("orbit");
        setHour(9.5);
        setView((v) => ({ ...v, floor: "all", stage: 5, roof: true, cutaway: false, labels: false, walls: true, livedIn: false, streetLife: false }));
        await wait(1200);
        setCommand({ id: Date.now(), type: "fit", subject: "plot", view: "front", instant: true });
        await wait(1000);
        setCommand({ id: Date.now() + 1, type: "orbit", azimuthDeg: -30, polarDeg: -10 });
        await wait(1800);
        const outcome = await photo({ framing: "view", mood: "morning", aspect: 3 / 2, longEdge: width * 2, samples: 24, shadowSize: 2048, watermark: false });
        if (!("blob" in outcome)) throw new Error(`Look photo failed: ${outcome.error}`);
        return toWebp(outcome.blob, width);
      },
    };
  }, [project]);
  const cmd = (c: Cmd) => setCommand({ ...(c as CameraCommand), id: Date.now() });
  const toggle = (k: keyof SceneView) => setView((v) => ({ ...v, [k]: !v[k] }));
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Suspense fallback={null}>
        <Scene
          project={project}
          view={view}
          mode={mode}
          selection={selection}
          onSelect={setSelection}
          cameraCommand={command}
          insets={insets}
          ghost={ghost}
          highlight={highlight}
          hour={hour}
          quality={quality}
          explore={mode === "explore" ? explore : undefined}
          onQualityResolved={(t) => console.info("quality", t)}
          photoJob={photoJob}
          onPhotoDone={(outcome) => {
            setPhotoJob(null);
            photoDone.current?.(outcome);
            photoDone.current = null;
          }}
        />
      </Suspense>
      {panel && (
        <div style={panelStyle}>
          <b style={{ fontSize: 13 }}>Scene lab</b>
          <label>
            Project{" "}
            <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)}>
              {Object.keys(PROJECTS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Hour {hour.toFixed(2)}
            <input type="range" min={0} max={24} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </label>
          <label>
            Quality{" "}
            <select value={quality} onChange={(e) => setQuality(e.target.value as QualitySetting)}>
              {["auto", "battery", "balanced", "beautiful"].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label>
            Mode{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value as EditorMode)}>
              {["build", "openings", "decorate", "outside", "explore"].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          {mode === "explore" && (
            <label>
              Explore{" "}
              <select value={explore} onChange={(e) => setExplore(e.target.value as ExploreView)}>
                {["orbit", "showcase", "walk"].map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Roof{" "}
            <select value={roofStyle} onChange={(e) => setRoofStyle(e.target.value as RoofStyle | "")}>
              <option value="">project</option>
              {["flat", "gable", "hip", "shed"].map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label>
            Exterior{" "}
            <select value={exterior} onChange={(e) => setExterior(e.target.value as ExteriorFinishId | "")}>
              <option value="">project</option>
              {Object.keys(EXTERIOR_FINISHES).map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label>
            Floor{" "}
            <select value={view.floor} onChange={(e) => setView((v) => ({ ...v, floor: e.target.value }))}>
              <option value="all">all</option>
              {project.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage {view.stage}
            <input type="range" min={0} max={5} step={1} value={view.stage} onChange={(e) => setView((v) => ({ ...v, stage: Number(e.target.value) }))} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["cutaway", "roof", "labels", "walls", "openings", "landscape", "furnishings"] as const).map((k) => (
              <label key={k} style={{ display: "inline-flex", gap: 3 }}>
                <input type="checkbox" checked={!!view[k]} onChange={() => toggle(k)} />
                {k}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button onClick={() => cmd({ type: "fit", subject: "home", view: "hero" })}>Home</button>
            <button onClick={() => cmd({ type: "fit", subject: "plot", view: "hero" })}>Plot</button>
            <button onClick={() => cmd({ type: "fit", subject: "home", view: "top" })}>Top</button>
            <button onClick={() => cmd({ type: "fit", subject: "home", view: "front" })}>Front</button>
            <button onClick={() => cmd({ type: "dolly", factor: 0.8 })}>+</button>
            <button onClick={() => cmd({ type: "dolly", factor: 1.25 })}>−</button>
            <button
              onClick={() =>
                selection && selection.kind === "room" && cmd({ type: "fit", subject: "room", floorId: selection.floorId, roomId: selection.id })
              }
            >
              Room
            </button>
            <button onClick={() => setInsets((i) => (i.bottom ? { top: 0, right: 0, bottom: 0, left: 0 } : { top: 60, right: 0, bottom: 300, left: 0 }))}>
              Sheet
            </button>
          </div>
          <small style={{ opacity: 0.7 }}>{selection ? `${selection.kind}: ${selection.id}` : "Click a room"}</small>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  width: 230,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 10,
  borderRadius: 12,
  background: "rgb(255 252 245 / 88%)",
  boxShadow: "0 4px 18px rgb(40 30 10 / 16%)",
  fontSize: 12,
  zIndex: 10,
};
