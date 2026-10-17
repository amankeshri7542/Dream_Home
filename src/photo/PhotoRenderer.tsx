// Runs photo jobs inside the Canvas: waits for the scene to settle (moods and
// framings change lighting and walls), pauses on-screen rendering, renders the
// photo offline, and hands back a JPEG. Nothing on screen changes.
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { DirectionalLight, PerspectiveCamera, Vector3, type Object3D } from "three";
import type { Project } from "../domain/types";
import { useSceneStore } from "../scene/store";
import type { SceneView } from "../scene/types";
import { toJpeg } from "./encode";
import { photoShot } from "./framing";
import { MOODS, photoSize, photoTestHook, type Framing, type MoodId } from "./settings";

export type PhotoJobRequest = {
  id: number;
  framing: Framing;
  mood: MoodId;
  aspect: number;
  longEdge: number;
  samples: number;
  shadowSize: number;
  watermark: boolean;
};
export type PhotoOutcome = { id: number } & ({ blob: Blob } | { error: "cancelled" | "failed" });

type Controls = {
  getTarget(v: Vector3): Vector3;
  azimuthAngle: number;
  polarAngle: number;
  distance: number;
  enabled: boolean;
} | null;

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function PhotoRenderer({
  job,
  project,
  view,
  cancel,
  onProgress,
  onDone,
}: {
  job: PhotoJobRequest | null;
  project: Project;
  view: SceneView;
  cancel?: { current: boolean };
  onProgress?: (fraction: number) => void;
  onDone?: (outcome: PhotoOutcome) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const live = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls;
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const store = useSceneStore();
  const latest = useRef({ project, view, controls, onProgress, onDone, cancel });
  latest.current = { project, view, controls, onProgress, onDone, cancel };
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!job || started.current === job.id) return;
    started.current = job.id;
    let lost = false;
    const onLost = () => (lost = true);
    gl.domElement.addEventListener("webglcontextlost", onLost);
    const done = (outcome: PhotoOutcome) => latest.current.onDone?.(outcome);
    void (async () => {
      try {
        // Let walls, lights and the sky settle into the photo's mood first.
        let quiet = 0;
        for (let i = 0; i < 180 && quiet < 3; i++) {
          invalidate();
          await frame();
          quiet = store.isAnimating() ? 0 : quiet + 1;
        }
        const { width, height } = photoSize(job.aspect, Math.min(job.longEdge, gl.capabilities.maxTextureSize || 4096));
        const c = latest.current.controls;
        const target = c ? c.getTarget(new Vector3()) : new Vector3();
        const shot = photoShot(job.framing, {
          project: latest.current.project,
          view: latest.current.view,
          live: {
            target: [target.x, target.y, target.z],
            azimuth: c?.azimuthAngle ?? 0,
            polar: c?.polarAngle ?? Math.PI / 3,
            distance: c?.distance ?? live.position.distanceTo(target),
          },
          fov: live.fov,
          width,
          height,
        });
        const camera = new PerspectiveCamera(live.fov, width / height, live.near, live.far);
        if (job.framing === "view" && c && !c.enabled) {
          // Walking inside: the visitor's own eyes.
          camera.position.copy(live.position);
          camera.quaternion.copy(live.quaternion);
        } else {
          camera.position.set(...shot.position);
          camera.lookAt(...shot.target);
        }
        camera.updateMatrixWorld();
        let sun: DirectionalLight | null = null;
        scene.traverse((o: Object3D) => {
          if (!sun && o instanceof DirectionalLight && o.castShadow) sun = o;
        });
        if (photoTestHook()?.fail) throw new Error("Photo failure forced by a test.");
        // The careful renderer (and its AO library) loads only when a photo is taken.
        const { renderPhoto } = await import("./render");
        setFrameloop("never");
        const pixels = await renderPhoto({
          gl,
          scene,
          camera,
          width,
          height,
          samples: job.samples,
          sun,
          shadowSize: job.shadowSize,
          mood: { exposure: gl.toneMappingExposure, ...MOODS[job.mood].finish },
          onProgress: (f) => latest.current.onProgress?.(f),
          cancelled: () => lost || !!latest.current.cancel?.current,
        });
        if (lost) throw new Error("The graphics context was lost.");
        const blob = await toJpeg(pixels, { mark: job.watermark });
        done(blob ? { id: job.id, blob } : { id: job.id, error: "failed" });
      } catch (error) {
        const cancelled = error instanceof Error && error.name === "PhotoCancelled";
        if (!cancelled) console.error("photo failed", error);
        done({ id: job.id, error: cancelled ? "cancelled" : "failed" });
      } finally {
        gl.domElement.removeEventListener("webglcontextlost", onLost);
        setFrameloop("demand");
        invalidate();
      }
    })();
  }, [job, gl, scene, live, setFrameloop, invalidate, store]);

  return null;
}
