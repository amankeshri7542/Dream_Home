// Everything inside the Canvas: environment, lights, diorama, building,
// overlays, camera rig, effects and the debug bridge.
import { Component, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Fog, type Group, type Mesh } from "three";
import { siteGround } from "../domain/materials";
import type { SceneProps } from "./types";
import { CameraRig } from "./camera/CameraRig";
import type { CameraApi } from "./camera/api";
import { Turntable } from "./camera/Turntable";
import { plotBox } from "./camera/poses";
import { floorBase, plotOffset } from "./coords";
import { Building } from "./building/Building";
import { Ghost } from "./building/Ghost";
import { SelectionOverlay } from "./building/SelectionOverlay";
import { entranceLightPosition, findEntrance } from "./building/geometry/porch";
import { visibility } from "./building/visibility";
import { DebugBridge } from "./debug/DebugBridge";
import { Ground } from "./environment/Ground";
import { Lights } from "./environment/Lights";
import { Night } from "./environment/Night";
import { ShadowInvalidator } from "./environment/ShadowInvalidator";
import { SkyDome } from "./environment/SkyDome";
import { lighting } from "./environment/timeOfDay";
import { useProceduralEnv } from "./environment/useProceduralEnv";
import { getLibrary } from "./materials/library";
import { OverlayProjector } from "./overlay/OverlayProjector";
import type { OverlayRegistry } from "./overlay/registry";
import { Landscape } from "./props/Landscape";
import { Plot } from "./props/Plot";
import { SiteExtras } from "./props/SiteExtras";
import { StreetLife } from "./street/StreetLife";
import { siteLayout } from "./props/site";
import { PhotoCapture } from "./PhotoCapture";
import { TIERS, MEASURE_FRAMES } from "./quality/quality";
import type { QualityTier } from "../editor/types";
import { useSceneStore } from "./store";

const Effects = lazy(() => import("./effects/Effects"));

class EffectsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Dream Home: post-processing disabled", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type RootProps = SceneProps & {
  tier: QualityTier;
  registry: OverlayRegistry;
  cameraApi: RefObject<CameraApi | null>;
  reducedMotion: boolean;
  onHoverTarget: (t: SceneProps["selection"]) => void;
  hoverTarget: SceneProps["selection"];
  reportFrames: (times: number[]) => void;
};

let versionCounter = 0;

export function SceneRoot(props: RootProps) {
  const { project, view, mode, tier, registry, cameraApi, reducedMotion, explore } = props;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const store = useSceneStore();
  const spec = TIERS[tier];
  const hour = explore === "showcase" ? 17.25 : props.hour;
  const light = useMemo(() => lighting(hour, project.plot.north), [hour, project.plot.north]);
  const library = getLibrary({
    textureSize: spec.textureSize,
    anisotropy: Math.min(spec.anisotropy, gl.capabilities.getMaxAnisotropy()),
  });
  library.ao().opacity = 0.34 * spec.aoStrips;
  useProceduralEnv(light, project.plot.north, spec.envSize);

  // Fog melts the backdrop disc into the horizon colour.
  const plotRadius = Math.hypot(project.plot.width, project.plot.depth) / 200;
  useLayoutEffect(() => {
    if (!(scene.fog instanceof Fog)) scene.fog = new Fog(new Color(), 60, 280);
    const fog = scene.fog as Fog;
    fog.color.copy(light.palette.horizon);
    gl.toneMappingExposure = light.palette.exposure;
    gl.setClearColor(light.palette.horizon);
  }, [scene, gl, light]);
  // Fog starts just beyond the diorama as seen from the current camera, so
  // tall buildings viewed from far away never wash out.
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const fog = scene.fog as Fog | null;
    if (!fog) return;
    const d = camera.position.length();
    fog.near = d + plotRadius * 1.2 + 8;
    fog.far = Math.max(fog.near + 160, 300);
  });

  const vis = visibility(project, view);
  const offset = plotOffset(project);
  const entrance = useMemo(() => (vis.stage >= 4 ? findEntrance(project) : null), [project, vis.stage]);
  const layout = useMemo(() => siteLayout(project, findEntrance(project)), [project]);
  const box = plotBox(project, view);
  const shadowBox = {
    min: [box.min[0], -0.8, box.min[2]] as [number, number, number],
    max: [box.max[0], box.max[1] + 2, box.max[2]] as [number, number, number],
  };
  const entranceWorld = entrance
    ? (entranceLightPosition(entrance).map((v, i) => v + offset[i]) as [number, number, number])
    : null;

  // A new version whenever anything that can change shadows changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const version = useMemo(() => String(++versionCounter), [project, view, light, tier]);
  const occluders = useRef(registry.occluders as Map<string, Mesh[]>);
  const building = useRef<Group>(null);
  const nightFloors = useMemo(
    () =>
      vis.floors
        .filter(() => !vis.interiorHidden && vis.stage >= 4)
        .map((f) => ({ floor: { ...f, voids: [] }, base: floorBase(f) })),
    [vis.floors, vis.interiorHidden, vis.stage],
  );

  // Ready after two rendered frames with the model.
  const frames = useRef(0);
  const onReady = useRef(props.onReady);
  onReady.current = props.onReady;
  useFrame(() => {
    if (store.get().ready) return;
    frames.current++;
    if (frames.current >= 2) {
      store.set({ ready: true });
      onReady.current?.();
    } else store.invalidate();
  });

  // Effects mount lazily after the first frame (never on battery).
  const ready = useReadyFlag();
  const wantEffects = spec.post !== "none" && ready;

  // Intro frame timing for the auto tier measurement.
  const [measuring, setMeasuring] = useState(false);
  const times = useRef<number[]>([]);
  const reportFrames = useRef(props.reportFrames);
  reportFrames.current = props.reportFrames;
  useFrame((_, delta) => {
    if (!measuring) return;
    times.current.push(delta * 1000);
    if (times.current.length >= MEASURE_FRAMES) {
      setMeasuring(false);
      reportFrames.current(times.current.slice(4));
    }
  });
  const onIntro = (running: boolean) => {
    if (running) {
      times.current = [];
      setMeasuring(true);
    } else if (times.current.length >= 12) {
      setMeasuring(false);
      reportFrames.current(times.current.slice(4));
      times.current = [];
    }
  };

  const ground = view.landscape ? siteGround(project) : "soil";
  // Street life: Explore / showcase only, never on battery or reduced motion.
  const streetLife =
    (mode === "explore" || explore === "showcase") && tier !== "battery" && !reducedMotion && view.streetLife !== false;
  const pickLandscape = (id: string) => props.onSelect({ kind: "landscape", id });
  return (
    <>
      <ShadowInvalidator version={version} />
      <SkyDome light={light} />
      <Lights light={light} shadowBox={shadowBox} mapSize={size.width < 768 ? spec.shadowMapSizeMobile : spec.shadowMapSize} entrance={entranceWorld} />
      <group position={offset}>
        <Ground project={project} ground={ground} library={library} light={light} />
        <Plot project={project} layout={layout} landscape={view.landscape} library={library} />
        <SiteExtras project={project} layout={layout} library={library} landscape={view.landscape} />
        <StreetLife project={project} layout={layout} enabled={streetLife} />
        {view.landscape && (
          <Landscape project={project} layout={layout} library={library} pickable={mode === "outside"} onPick={pickLandscape} />
        )}
        <Building
          project={project}
          view={view}
          mode={mode}
          library={library}
          aoStrips={spec.aoStrips > 0}
          reducedMotion={reducedMotion}
          onSelect={props.onSelect}
          onHoverTarget={props.onHoverTarget}
          occluders={occluders}
          groupRef={building}
        />
        <SelectionOverlay
          project={project}
          offset={offset}
          selection={props.selection}
          hover={props.hover ?? props.hoverTarget}
          highlight={props.highlight ?? []}
          reducedMotion={reducedMotion}
        />
        {props.ghost && <Ghost project={project} ghost={props.ghost} offset={offset} />}
        <Night light={light} library={library} floors={nightFloors} />
      </group>
      <CameraRig
        project={project}
        view={view}
        insets={props.insets}
        command={props.cameraCommand}
        reducedMotion={reducedMotion}
        apiRef={cameraApi}
        onIntro={onIntro}
        turntable={explore === "showcase"}
      />
      <Turntable active={explore === "showcase" && !reducedMotion} />
      <OverlayProjector registry={registry} />
      <PhotoCapture request={props.photoRequest ?? null} onPhoto={props.onPhoto} />
      <DebugBridge
        project={project}
        quality={tier}
        light={light}
        building={building}
        moving={() => cameraApi.current?.moving() ?? false}
      />
      {wantEffects && (
        <EffectsBoundary>
          <Suspense fallback={null}>
            <Effects tier={tier} night={light.palette.windowGlow > 0.4} showcase={explore === "showcase"} />
          </Suspense>
        </EffectsBoundary>
      )}
      {props.children}
    </>
  );
}

function useReadyFlag() {
  const store = useSceneStore();
  const [ready, setReady] = useState(store.get().ready);
  useEffect(() => store.subscribe(() => setReady(store.get().ready)), [store]);
  return ready;
}
