// Runs reel jobs inside the Canvas. While filming it takes over rendering
// (a priority frame callback, so R3F never draws on screen), pauses the demand
// loop and steps frames itself; afterwards everything goes back to normal and
// the scene returns to zero idle frames. The filming code loads lazily.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Project } from "../domain/types";
import { useSceneStore } from "../scene/store";
import type { ReelJobRequest, ReelOutcome, ReelProgress, ReelScene } from "./settings";

/** An empty priority callback: while mounted, R3F leaves the screen alone. */
function TakeOver() {
  useFrame(() => undefined, 1);
  return null;
}

export function ReelRenderer({
  job,
  project,
  sceneKey,
  cancel,
  onScene,
  onProgress,
  onDone,
}: {
  job: ReelJobRequest | null;
  project: Project;
  /** The reel scene the canvas is showing now. */
  sceneKey: string | null;
  cancel?: { current: boolean };
  onScene?: (scene: ReelScene) => void;
  onProgress?: (progress: ReelProgress) => void;
  onDone?: (outcome: ReelOutcome) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const advance = useThree((s) => s.advance);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const store = useSceneStore();
  const latest = useRef({ project, sceneKey, cancel, onScene, onProgress, onDone });
  latest.current = { project, sceneKey, cancel, onScene, onProgress, onDone };
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!job || started.current === job.id) return;
    started.current = job.id;
    let lost = false;
    const onLost = () => (lost = true);
    gl.domElement.addEventListener("webglcontextlost", onLost);
    void (async () => {
      let outcome: ReelOutcome;
      try {
        const { film } = await import("./film");
        setFrameloop("never");
        const result = await film({
          gl,
          scene,
          store,
          advance: (t) => advance(t),
          project: latest.current.project,
          job,
          setScene: (s) => latest.current.onScene?.(s),
          shownScene: () => latest.current.sceneKey,
          onProgress: (p) => latest.current.onProgress?.(p),
          stopped: () => lost || !!latest.current.cancel?.current,
        });
        outcome = lost ? { id: job.id, error: "failed" } : { id: job.id, ...result };
      } catch (error) {
        console.error("reel failed", error);
        outcome = { id: job.id, error: "failed" };
      } finally {
        gl.domElement.removeEventListener("webglcontextlost", onLost);
        setFrameloop("demand");
        invalidate();
      }
      latest.current.onDone?.(outcome);
    })();
  }, [job, gl, scene, store, advance, setFrameloop, invalidate]);

  return job ? <TakeOver /> : null;
}
