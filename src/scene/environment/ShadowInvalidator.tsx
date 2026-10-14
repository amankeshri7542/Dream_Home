// Shadows render on demand only (shadowMap.autoUpdate = false). This component
// flags a shadow update whenever the scene version changes, and every frame
// while tweens run. It also advances tweens and keeps the demand loop alive
// while anything animates, so idle scenes render zero frames.
import { useEffect } from "react";
import { addEffect, useFrame, useThree } from "@react-three/fiber";
import { useSceneStore } from "../store";

export function ShadowInvalidator({ version }: { version: string }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const store = useSceneStore();
  useEffect(() => {
    store.setInvalidate(invalidate);
  }, [store, invalidate]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    store.bumpVersion();
    invalidate();
  }, [version, gl, invalidate, store]);
  useFrame((_, delta) => {
    if (store.step(delta)) {
      gl.shadowMap.needsUpdate = true;
      // Keep going while tweens run; one extra frame settles the final state.
      invalidate();
    }
    store.tickFrame();
  }, -5);
  // Accurate per-frame renderer stats (info.autoReset = false).
  useEffect(
    () =>
      addEffect(() => {
        gl.info.reset();
      }),
    [gl],
  );
  return null;
}
