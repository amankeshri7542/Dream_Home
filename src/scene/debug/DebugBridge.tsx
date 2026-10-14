// window.__dreamHome: renderer stats, camera state, projections and idle
// waiting for e2e tests and the lab. Enabled in dev, under webdriver, or with
// ?debug in the URL.
import { useEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { CameraControlsImpl } from "@react-three/drei";
import { Box3, Vector3, type Group, type PerspectiveCamera } from "three";
import type { Project } from "../../domain/types";
import { FLOOR_SURFACE, floorBase, plotToWorld } from "../coords";
import { useSceneStore } from "../store";
import { cutPlane } from "../materials/cutPlane";
import type { Lighting } from "../environment/timeOfDay";
import { targetRect } from "../building/SelectionOverlay";
import type { DreamHomeBridge } from "./global";

export function debugEnabled(): boolean {
  try {
    return (
      !!import.meta.env.DEV ||
      (typeof navigator !== "undefined" && !!navigator.webdriver) ||
      (typeof location !== "undefined" && location.search.includes("debug"))
    );
  } catch {
    return false;
  }
}

/** Ensure the bridge object exists (also used to count Canvas mounts). */
export function bridge(): DreamHomeBridge | null {
  if (!debugEnabled() || typeof window === "undefined") return null;
  if (!window.__dreamHome) {
    const empty = () => {
      throw new Error("Scene not ready");
    };
    window.__dreamHome = {
      ready: false,
      frame: 0,
      quality: "unknown",
      canvasMounts: 0,
      renderer: empty,
      camera: empty,
      modelScreenBounds: () => null,
      screenOf: () => null,
      projectToScreen: empty,
      isAnimating: () => true,
      waitForIdle: () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
      lighting: empty,
    };
  }
  return window.__dreamHome;
}

type Props = {
  project: Project;
  quality: string;
  light: Lighting;
  building: RefObject<Group | null>;
  moving: () => boolean;
};

export function DebugBridge({ project, quality, light, building, moving }: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const scene = useThree((s) => s.scene);
  const store = useSceneStore();
  const latest = useRef({ project, quality, light, controls });
  latest.current = { project, quality, light, controls };

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const toScreen = (p: Vector3) => {
      const rect = gl.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      const v = p.clone().project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    Object.defineProperty(b, "frame", { get: () => store.get().frame, configurable: true });
    Object.defineProperty(b, "ready", { get: () => store.get().ready, configurable: true });
    Object.defineProperty(b, "quality", { get: () => latest.current.quality, configurable: true });
    b.renderer = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
    });
    b.camera = () => {
      const c = latest.current.controls;
      const target = new Vector3(),
        focal = new Vector3();
      c?.getTarget(target);
      c?.getFocalOffset(focal);
      return {
        position: camera.position.toArray() as [number, number, number],
        target: target.toArray() as [number, number, number],
        fov: camera.fov,
        distance: c?.distance ?? camera.position.distanceTo(target),
        azimuth: c?.azimuthAngle ?? 0,
        polar: c?.polarAngle ?? 0,
        focal: focal.toArray() as [number, number, number],
      };
    };
    b.modelScreenBounds = () => {
      const g = building.current;
      if (!g) return null;
      const box = new Box3().setFromObject(g);
      if (box.isEmpty()) return null;
      // Geometry above the section cut is clipped away: don't count it.
      box.max.y = Math.min(box.max.y, Math.max(box.min.y, cutPlane.constant));
      const rect = gl.domElement.getBoundingClientRect();
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const s = toScreen(new Vector3(x, y, z));
            x0 = Math.min(x0, s.x);
            y0 = Math.min(y0, s.y);
            x1 = Math.max(x1, s.x);
            y1 = Math.max(y1, s.y);
          }
      const cx0 = Math.max(x0, rect.left),
        cy0 = Math.max(y0, rect.top),
        cx1 = Math.min(x1, rect.right),
        cy1 = Math.min(y1, rect.bottom);
      const visible = Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0);
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, coverage: visible / Math.max(1, rect.width * rect.height) };
    };
    b.projectToScreen = ({ x, z, floorId, y }) => {
      const p = latest.current.project;
      const floor = floorId ? p.floors.find((f) => f.id === floorId) : undefined;
      const yy = y !== undefined ? y / 100 : floor ? floorBase(floor) + FLOOR_SURFACE : 0.04;
      return toScreen(new Vector3(...plotToWorld(p, x, z, yy)));
    };
    b.screenOf = (id) => {
      const p = latest.current.project;
      const t = targetRect(p, "any", id);
      if (!t) return null;
      const cx = ((t.rect.x0 + t.rect.x1) / 2) * 100,
        cz = ((t.rect.z0 + t.rect.z1) / 2) * 100;
      return toScreen(new Vector3(...plotToWorld(p, cx, cz, floorBase(t.floor) + FLOOR_SURFACE + 0.02)));
    };
    b.isAnimating = () => store.isAnimating() || moving();
    b.waitForIdle = () =>
      new Promise<void>((resolve) => {
        let calm = 0;
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          if (b.isAnimating()) calm = 0;
          else calm += now - last;
          last = now;
          if (calm >= 200) resolve();
          else setTimeout(tick, 32);
        };
        tick();
      });
    (b as unknown as { inspect: () => unknown }).inspect = () => {
      const lights: unknown[] = [];
      scene.traverse((o) => {
        const l = o as unknown as {
          isDirectionalLight?: boolean;
          castShadow: boolean;
          position: Vector3;
          intensity: number;
          target: { position: Vector3 };
          shadow: { camera: { left: number; right: number; top: number; bottom: number; near: number; far: number }; mapSize: { x: number }; map: unknown };
        };
        if (l.isDirectionalLight)
          lights.push({
            cast: l.castShadow,
            intensity: l.intensity,
            pos: l.position.toArray(),
            target: l.target.position.toArray(),
            cam: { ...l.shadow.camera },
            size: l.shadow.mapSize.x,
            hasMap: !!l.shadow.map,
          });
      });
      return { lights, shadowMap: { enabled: gl.shadowMap.enabled, auto: gl.shadowMap.autoUpdate, type: gl.shadowMap.type } };
    };
    (b as unknown as { shadowAuto: (v: boolean) => void }).shadowAuto = (v: boolean) => {
      gl.shadowMap.autoUpdate = v;
      store.invalidate();
    };
    (b as unknown as { scene: () => unknown }).scene = () => scene;
    (b as unknown as { envOff: () => void }).envOff = () => {
      scene.environmentIntensity = 0;
      scene.traverse((o) => {
        const l = o as unknown as { isHemisphereLight?: boolean; intensity: number };
        if (l.isHemisphereLight) l.intensity = 0;
      });
      store.invalidate();
    };
    (b as unknown as { refreshShadows: () => void }).refreshShadows = () => {
      gl.shadowMap.needsUpdate = true;
      store.invalidate();
    };
    b.lighting = () => ({
      hour: latest.current.light.hour,
      sun: latest.current.light.keyDir,
      windowGlow: latest.current.light.palette.windowGlow,
    });
  }, [gl, camera, store, building, moving, scene]);
  return null;
}
