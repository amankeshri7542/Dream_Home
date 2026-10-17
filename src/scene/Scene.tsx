// Renderer v2 entry (lazy default export). WebGL2 check, error boundary with
// the user-facing fallback, quality tier resolution, the single Canvas and the
// DOM overlay (labels / ghost badge).
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, events as createEvents, type RootState } from "@react-three/fiber";
import { NeutralToneMapping, PCFSoftShadowMap, type Intersection } from "three";
import type { SceneProps } from "./types";
import type { SelectionTarget } from "../editor/types";
import { SceneRoot } from "./SceneRoot";
import { createSceneStore, SceneStoreContext } from "./store";
import { useCameraKeyboard, CAMERA_KEYBOARD_LABEL } from "./camera/useCameraKeyboard";
import { useReducedMotion } from "./camera/useReducedMotion";
import type { CameraApi } from "./camera/api";
import { probeWebGL, useQualityTier } from "./quality/useQuality";
import { TIERS, tierDpr } from "./quality/quality";
import { createOverlayRegistry } from "./overlay/registry";
import { SceneOverlay, roomLabels } from "./overlay/SceneOverlay";
import { visibility } from "./building/visibility";
import { cutPlane } from "./materials/cutPlane";
import { focusHides } from "./materials/focus";
import { bridge } from "./debug/DebugBridge";
import "./scene.css";

export function Fallback() {
  return (
    <div role="status" className="scene-fallback">
      <strong>{"3D isn’t available in this browser"}</strong>
      <p>
        {"Choose 2D plan to keep shaping your home. To explore in 3D, try a browser with WebGL enabled."}
      </p>
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Dream Home 3D view failed", error);
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

/** Ignore hits on clipped geometry above the section cut. */
function cutAwareEvents(store: Parameters<typeof createEvents>[0]) {
  const base = createEvents(store);
  return {
    ...base,
    filter: (items: Intersection[], state: RootState) => {
      const kept = items.filter((hit) => {
        const mat = (hit.object as { material?: { clippingPlanes?: unknown[] | null; userData?: { dhFocusCut?: boolean } } }).material;
        const single = !!mat && !Array.isArray(mat);
        const clipped = single && !!mat.clippingPlanes?.length;
        if (clipped && hit.point.y > cutPlane.constant + 0.001) return false;
        // Walls the hero-room focus has cut away can't be tapped either.
        const focusCut = single && !!mat.userData?.dhFocusCut;
        return !(focusCut && focusHides(hit.point.x, hit.point.y, hit.point.z));
      });
      return base.filter ? base.filter(kept, state) : kept;
    },
  };
}

const SHADOWS = { enabled: true, type: PCFSoftShadowMap, autoUpdate: false } as const;
const GL = { antialias: true, alpha: false, stencil: false, powerPreference: "high-performance" } as const;
const CAMERA = { fov: 32, near: 0.1, far: 900, position: [24, 22, 30] as [number, number, number] };

export default function Scene(props: SceneProps) {
  const [probe] = useState(probeWebGL);
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );
  if (!probe.ok) return <Fallback />;
  return (
    <SceneBoundary>
      <SceneCanvas {...props} gpu={probe.renderer} />
    </SceneBoundary>
  );
}

function SceneCanvas(props: SceneProps & { gpu: string | null }) {
  const { tier, reportFrames } = useQualityTier(props.quality, props.gpu, props.onQualityResolved);
  const spec = TIERS[tier];
  const [store] = useState(createSceneStore);
  const [registry] = useState(createOverlayRegistry);
  registry.insets = props.insets;
  const cameraApi = useRef<CameraApi | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useCameraKeyboard(wrapper, cameraApi);
  const [hoverTarget, setHoverTarget] = useState<SelectionTarget | null>(null);
  const onHover = props.onHover;
  const onHoverTarget = useMemo(
    () => (t: SelectionTarget | null) => {
      setHoverTarget(t);
      onHover?.(t);
    },
    [onHover],
  );
  // Ready attribute mirrors the store without re-rendering the Canvas tree.
  useEffect(
    () =>
      store.subscribe(() => {
        const el = wrapper.current;
        if (el) el.dataset.sceneReady = String(store.get().ready);
      }),
    [store],
  );
  const vis = visibility(props.project, props.view);
  // While decorating or placing doors in a room, its own label would sit on
  // the furniture and openings the child wants to tap: hide just that one.
  const sel = props.selection;
  const inRoom =
    (props.mode === "decorate" || props.mode === "openings") && sel
      ? sel.kind === "room"
        ? sel.id
        : sel.kind === "furniture"
          ? sel.roomId
          : null
      : null;
  // Inside a hero room the room itself is the subject: no labels at all.
  const focused = !!props.view.focus;
  const labels = useMemo(
    () => (focused ? [] : roomLabels(props.project, vis.labelsFloorId, props.areaUnit, inRoom)),
    [props.project, vis.labelsFloorId, props.areaUnit, inRoom, focused],
  );
  const dpr = tierDpr(spec, typeof window !== "undefined" ? window.devicePixelRatio : 1);
  const editMode = props.mode !== "explore";
  return (
    <div
      ref={wrapper}
      className="scene-v2"
      data-scene-ready="false"
      data-quality={tier}
      tabIndex={0}
      role="group"
      aria-roledescription="3D view"
      aria-label={`${props.project.name}. ${CAMERA_KEYBOARD_LABEL}`}
    >
      <Canvas
        frameloop="demand"
        dpr={dpr}
        shadows={SHADOWS}
        camera={CAMERA}
        gl={GL}
        events={cutAwareEvents}
        style={{ width: "100%", height: "100%", touchAction: "none", display: "block" }}
        onCreated={(state) => {
          state.gl.localClippingEnabled = true;
          state.gl.info.autoReset = false;
          state.gl.toneMapping = NeutralToneMapping;
          const b = bridge();
          if (b) b.canvasMounts++;
        }}
        onPointerMissed={(event) => {
          if (!editMode) return;
          if (event.type === "click") props.onSelect(null);
        }}
      >
        <SceneStoreContext.Provider value={store}>
          <SceneRoot
            {...props}
            tier={tier}
            registry={registry}
            cameraApi={cameraApi}
            reducedMotion={reducedMotion}
            hoverTarget={hoverTarget}
            onHoverTarget={onHoverTarget}
            reportFrames={reportFrames}
          />
        </SceneStoreContext.Provider>
      </Canvas>
      <SceneOverlay
        project={props.project}
        labels={labels}
        selection={props.selection}
        ghost={props.ghost}
        registry={registry}
        onSelect={props.onSelect}
        invalidate={store.invalidate}
      />
    </div>
  );
}
