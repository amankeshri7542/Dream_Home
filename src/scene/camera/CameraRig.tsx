// drei CameraControls with a custom inset-aware fit, sticky re-fitting,
// command handling, an intro glide and reduced-motion support.
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Box3, Vector3, type PerspectiveCamera } from "three";
import type { CameraCommand, Insets } from "../../editor/types";
import type { Project } from "../../domain/types";
import type { SceneView } from "../types";
import { useSceneStore } from "../store";
import type { CameraApi, FitIntent } from "./api";
import { fitBox, nearestAngle } from "./fit";
import {
  FOCUS_POLAR,
  frontPose,
  heroPose,
  homeBox,
  plotBox,
  roomBox,
  floorBox,
  topPose,
  type Box,
  type Pose,
} from "./poses";

const { ACTION } = CameraControlsImpl;
const SMOOTH = 0.38;
const DEG = Math.PI / 180;

type Props = {
  project: Project;
  view: SceneView;
  insets: Insets;
  command: CameraCommand | null | undefined;
  reducedMotion: boolean;
  apiRef: RefObject<CameraApi | null>;
  /** Called with true while the intro glide runs (quality measurement). */
  onIntro?: (running: boolean) => void;
  /** Showcase turntable: frame the home so it fits from every side. */
  turntable?: boolean;
};

/**
 * A square footprint that projects about as wide as the home does from any
 * side, so a turning showcase never clips a corner of the house.
 */
function spinBox(box: Box): Box {
  const cx = (box.min[0] + box.max[0]) / 2,
    cz = (box.min[2] + box.max[2]) / 2;
  const half = (Math.hypot(box.max[0] - box.min[0], box.max[2] - box.min[2]) / 2) * 0.78;
  return { min: [cx - half, box.min[1], cz - half], max: [cx + half, box.max[1], cz + half] };
}

export function CameraRig({ project, view, insets, command, reducedMotion, apiRef, onIntro, turntable = false }: Props) {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const store = useSceneStore();
  const lastFit = useRef<FitIntent>({ subject: "home", view: "hero" });
  const userMoved = useRef(false);
  const lastUpdate = useRef(0);
  const intro = useRef<"pending" | "running" | "done">("pending");
  const latest = useRef({ project, view, insets, size, reducedMotion, turntable });
  latest.current = { project, view, insets, size, reducedMotion, turntable };

  const subjectBox = (intent: FitIntent): Box => {
    const { project: p, view: v } = latest.current;
    if (intent.subject === "plot") return plotBox(p, v);
    if (intent.subject === "floor" && intent.floorId && p.floors.some((f) => f.id === intent.floorId))
      return floorBox(p, v, intent.floorId);
    if (intent.subject === "room" && intent.roomId) {
      const floorId =
        intent.floorId ?? p.floors.find((f) => f.rooms.some((r) => r.id === intent.roomId))?.id;
      const box = floorId ? roomBox(p, v, floorId, intent.roomId) : null;
      if (box) return box;
    }
    const home = homeBox(p, v);
    return latest.current.turntable ? spinBox(home) : home;
  };

  const poseFor = (intent: FitIntent, c: CameraControlsImpl): Pose => {
    const road = latest.current.project.plot.road;
    const current = { azimuth: c.azimuthAngle, polar: c.polarAngle };
    switch (intent.view) {
      case "hero":
        return heroPose(road);
      case "top":
        return topPose();
      case "front":
        return frontPose(road);
      case "keep":
        return current;
      default:
        return intent.subject === "room" || intent.subject === "floor"
          ? { azimuth: current.azimuth, polar: FOCUS_POLAR }
          : current;
    }
  };

  const computeFit = (intent: FitIntent, pose: Pose) => {
    const { insets: ins, size: sz } = latest.current;
    const box = subjectBox(intent);
    return fitBox({
      min: box.min,
      max: box.max,
      azimuth: pose.azimuth,
      polar: Math.max(0.0001, pose.polar),
      fov: camera.fov,
      width: sz.width,
      height: sz.height,
      insets: ins,
      margin: intent.subject === "home" && latest.current.turntable ? 0.2 : undefined,
    });
  };

  const updateLimits = (c: CameraControlsImpl, distance: number) => {
    const { project: p, view: v, size: sz } = latest.current;
    const plot = plotBox(p, v);
    const far = fitBox({ min: plot.min, max: plot.max, azimuth: 0, polar: 0.0001, fov: camera.fov, width: sz.width, height: sz.height });
    c.maxDistance = Math.max(far.distance * 1.8, distance * 1.3, 20);
    c.minDistance = Math.min(1.2, distance * 0.5);
    const b = new Box3(new Vector3(...plot.min).addScalar(-6), new Vector3(...plot.max).addScalar(6));
    b.min.y = -1;
    c.setBoundary(b);
  };

  const applyFit = (intent: FitIntent, animate: boolean) => {
    const c = controls.current;
    if (!c) return;
    const pose = poseFor(intent, c);
    const azimuth = nearestAngle(c.azimuthAngle, pose.azimuth);
    const fit = computeFit(intent, { azimuth, polar: pose.polar });
    updateLimits(c, fit.distance);
    void c.rotateTo(azimuth, Math.max(0.0001, pose.polar), animate);
    void c.moveTo(fit.target[0], fit.target[1], fit.target[2], animate);
    void c.dollyTo(fit.distance, animate);
    void c.setFocalOffset(fit.focal[0], fit.focal[1], 0, animate);
    // Sticky re-fits keep the chosen framing but not a forced view change.
    lastFit.current = { subject: intent.subject, floorId: intent.floorId, roomId: intent.roomId, view: "keep" };
    userMoved.current = false;
    lastUpdate.current = performance.now();
    invalidate();
  };

  const api = useMemo<CameraApi>(
    () => ({
      fit: (intent, animate) => applyFit(intent, animate && !latest.current.reducedMotion),
      dolly: (factor) => {
        const c = controls.current;
        if (!c) return;
        userMoved.current = true;
        void c.dollyTo(c.distance * factor, !latest.current.reducedMotion);
        invalidate();
      },
      orbit: (az, pol) => {
        const c = controls.current;
        if (!c) return;
        userMoved.current = true;
        void c.rotate(az * DEG, pol * DEG, !latest.current.reducedMotion);
        invalidate();
      },
      moving: () => performance.now() - lastUpdate.current < 200,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useLayoutEffect(() => {
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [api, apiRef]);

  // Static configuration.
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.mouseButtons.left = ACTION.ROTATE;
    c.mouseButtons.right = ACTION.TRUCK;
    c.mouseButtons.middle = ACTION.DOLLY;
    c.mouseButtons.wheel = ACTION.DOLLY;
    c.touches.one = ACTION.TOUCH_ROTATE;
    c.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    c.touches.three = ACTION.TOUCH_TRUCK;
    c.dollyToCursor = true;
    c.draggingSmoothTime = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.1;
    c.minPolarAngle = 0;
    c.restThreshold = 0.0025;
  }, []);
  useEffect(() => {
    const c = controls.current;
    if (c) c.smoothTime = reducedMotion ? 0 : SMOOTH;
  }, [reducedMotion]);

  // Intro glide (once): from 25° aside and 30% farther into the hero pose.
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c || intro.current !== "pending") return;
    const hero = heroPose(latest.current.project.plot.road);
    const fit = computeFit({ subject: "home", view: "hero" }, hero);
    updateLimits(c, fit.distance);
    lastFit.current = { subject: "home", view: "keep" };
    if (latest.current.reducedMotion) {
      intro.current = "done";
      applyFit({ subject: "home", view: "hero" }, false);
      return;
    }
    void c.rotateTo(hero.azimuth + 25 * DEG, hero.polar - 4 * DEG, false);
    void c.moveTo(fit.target[0], fit.target[1], fit.target[2], false);
    void c.dollyTo(fit.distance * 1.3, false);
    void c.setFocalOffset(fit.focal[0] * 1.3, fit.focal[1] * 1.3, 0, false);
    c.update(0);
    intro.current = "running";
    onIntro?.(true);
    c.smoothTime = 0.3;
    let fired = false;
    const start = requestAnimationFrame(() => {
      fired = true;
      applyFit({ subject: "home", view: "hero" }, true);
    });
    return () => {
      cancelAnimationFrame(start);
      // StrictMode re-runs effects: start over if the glide never began.
      if (!fired) intro.current = "pending";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sticky fit: when the viewport, insets or model bounds change, re-run the
  // last fit — but only if the user has not moved the camera since.
  const box = subjectBox(lastFit.current);
  const boundsKey = [...box.min, ...box.max].map((v) => v.toFixed(2)).join(",");
  const stickyKey = `${size.width}x${size.height}|${insets.top},${insets.right},${insets.bottom},${insets.left}|${boundsKey}`;
  const firstSticky = useRef(true);
  const lastBounds = useRef(boundsKey);
  const lastClear = useRef({ insets, size });
  /** Is the framed subject still fully inside the area the panels leave clear? */
  const stillClear = () => {
    const { insets: ins, size: sz } = latest.current;
    const b = subjectBox(lastFit.current);
    camera.updateMatrixWorld();
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const v = new Vector3();
    for (const x of [b.min[0], b.max[0]])
      for (const y of [b.min[1], b.max[1]])
        for (const z of [b.min[2], b.max[2]]) {
          v.set(x, y, z).project(camera);
          if (v.z > 1) return false;
          const px = ((v.x + 1) / 2) * sz.width,
            py = ((1 - v.y) / 2) * sz.height;
          x0 = Math.min(x0, px);
          y0 = Math.min(y0, py);
          x1 = Math.max(x1, px);
          y1 = Math.max(y1, py);
        }
    const slack = 8;
    return (
      x0 >= ins.left - slack &&
      y0 >= ins.top - slack &&
      x1 <= sz.width - ins.right + slack &&
      y1 <= sz.height - ins.bottom + slack
    );
  };
  useEffect(() => {
    if (firstSticky.current) {
      firstSticky.current = false;
      return;
    }
    const boundsChanged = lastBounds.current !== boundsKey;
    lastBounds.current = boundsKey;
    const before = lastClear.current;
    lastClear.current = { insets, size };
    // Did a panel open (the clear area shrank) rather than close?
    const shrank =
      insets.left >= before.insets.left &&
      insets.right >= before.insets.right &&
      insets.top >= before.insets.top &&
      insets.bottom >= before.insets.bottom &&
      size.width <= before.size.width &&
      size.height <= before.size.height;
    if (intro.current === "running") {
      applyFit({ subject: "home", view: "hero" }, true);
      return;
    }
    if (userMoved.current) return;
    // A panel opening or closing only re-frames when it would cover the
    // home; otherwise the view stays put under the pointer.
    if (!boundsChanged && shrank && stillClear()) return;
    applyFit(lastFit.current, !latest.current.reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyKey]);

  // Explicit reset via view.resetKey.
  const resetKey = view.resetKey;
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    applyFit({ subject: "home", view: "hero" }, !latest.current.reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Camera commands from the shell.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!command || handled.current === command.id) return;
    handled.current = command.id;
    const animate = !latest.current.reducedMotion;
    switch (command.type) {
      case "fit":
        applyFit(
          { subject: command.subject, floorId: command.floorId, roomId: command.roomId, view: command.view },
          animate && !command.instant,
        );
        break;
      case "dolly":
        api.dolly(command.factor);
        break;
      case "orbit":
        api.orbit(command.azimuthDeg, command.polarDeg ?? 0);
        break;
      case "reset":
        applyFit({ subject: "home", view: "hero" }, animate);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={reducedMotion ? 0 : SMOOTH}
      onControlStart={() => {
        userMoved.current = true;
        if (intro.current === "running") {
          intro.current = "done";
          onIntro?.(false);
          if (controls.current) controls.current.smoothTime = latest.current.reducedMotion ? 0 : SMOOTH;
        }
      }}
      onControl={() => {
        userMoved.current = true;
      }}
      onUpdate={() => {
        lastUpdate.current = performance.now();
        if (!store.get().cameraMoving) store.set({ cameraMoving: true });
      }}
      onSleep={() => {
        store.set({ cameraMoving: false });
        if (intro.current === "running") {
          intro.current = "done";
          onIntro?.(false);
          if (controls.current) controls.current.smoothTime = latest.current.reducedMotion ? 0 : SMOOTH;
        }
      }}
    />
  );
}
