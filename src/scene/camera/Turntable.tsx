// Showcase turntable: a slow 6°/s orbit that pauses while the user drags and
// resumes after 4 s idle. Callers disable it under reduced motion.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControlsImpl } from "@react-three/drei";

const SPEED = (6 * Math.PI) / 180;
const RESUME_MS = 4000;

export function Turntable({ active }: { active: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const pausedUntil = useRef(0);
  useEffect(() => {
    if (!controls || !active) return;
    const pause = () => {
      pausedUntil.current = Number.POSITIVE_INFINITY;
    };
    const release = () => {
      pausedUntil.current = performance.now() + RESUME_MS;
      window.setTimeout(() => invalidate(), RESUME_MS + 20);
    };
    const wheel = () => {
      pausedUntil.current = performance.now() + RESUME_MS;
      window.setTimeout(() => invalidate(), RESUME_MS + 20);
    };
    controls.addEventListener("controlstart", pause);
    controls.addEventListener("controlend", release);
    controls.addEventListener("control", wheel);
    invalidate();
    return () => {
      controls.removeEventListener("controlstart", pause);
      controls.removeEventListener("controlend", release);
      controls.removeEventListener("control", wheel);
    };
  }, [controls, active, invalidate]);
  useFrame((_, delta) => {
    if (!active || !controls) return;
    if (performance.now() < pausedUntil.current) return;
    void controls.rotate(SPEED * Math.min(delta, 0.1), 0, false);
    invalidate();
  });
  return null;
}
