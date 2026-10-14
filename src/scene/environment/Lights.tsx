// Fixed light rig (count never changes → no shader recompiles):
// warm key sun/moon with tight-fitted shadows, cool fill, hemisphere sky, and
// an always-mounted entrance point light (0 intensity by day).
import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { DirectionalLight, HemisphereLight, Object3D, PointLight } from "three";
import { fitShadowCamera, type V3 } from "./shadowFit";
import type { Lighting } from "./timeOfDay";

type Props = {
  light: Lighting;
  /** World-space box the shadow camera must cover. */
  shadowBox: { min: V3; max: V3 };
  mapSize: number;
  entrance: V3 | null;
};

export function Lights({ light, shadowBox, mapSize, entrance }: Props) {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const point = useRef<PointLight>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const p = light.palette;

  // Targets must be in the scene graph for matrixWorld updates.
  useLayoutEffect(() => {
    const targets: Object3D[] = [];
    for (const l of [key.current, fill.current]) {
      if (l && !l.target.parent) {
        scene.add(l.target);
        targets.push(l.target);
      }
    }
    return () => targets.forEach((t) => scene.remove(t));
  }, [scene]);

  const boxKey = [...shadowBox.min, ...shadowBox.max].map((v) => v.toFixed(2)).join(",");
  useLayoutEffect(() => {
    const k = key.current,
      f = fill.current;
    if (!k || !f) return;
    const fit = fitShadowCamera(light.keyDir, shadowBox.min, shadowBox.max, 0.6);
    k.position.set(...fit.position);
    k.target.position.set(...fit.target);
    k.target.updateMatrixWorld();
    const cam = k.shadow.camera;
    cam.left = fit.left;
    cam.right = fit.right;
    cam.top = fit.top;
    cam.bottom = fit.bottom;
    cam.near = fit.near;
    cam.far = fit.far;
    cam.updateProjectionMatrix();
    if (k.shadow.mapSize.x !== mapSize) {
      k.shadow.mapSize.set(mapSize, mapSize);
      // Post-mount size changes need a fresh shadow render target.
      k.shadow.map?.dispose();
      (k.shadow as { map: unknown }).map = null;
    }
    k.shadow.bias = -0.0002;
    k.shadow.normalBias = 0.03;
    // Cool fill from the opposite side, high in the sky.
    const [dx, , dz] = light.keyDir;
    const len = Math.hypot(dx, dz) || 1;
    const c: V3 = [(shadowBox.min[0] + shadowBox.max[0]) / 2, 0, (shadowBox.min[2] + shadowBox.max[2]) / 2];
    f.position.set(c[0] - (dx / len) * 40, 45, c[2] - (dz / len) * 40);
    f.target.position.set(...c);
    f.target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light.keyDir[0], light.keyDir[1], light.keyDir[2], boxKey, mapSize, gl, invalidate]);

  useLayoutEffect(() => {
    if (key.current) {
      key.current.color.copy(p.sun);
      key.current.intensity = p.sunIntensity;
    }
    if (fill.current) {
      fill.current.color.copy(p.fill);
      fill.current.intensity = p.fillIntensity;
    }
    if (hemi.current) {
      hemi.current.color.copy(p.hemiSky);
      hemi.current.groundColor.copy(p.ground);
      hemi.current.intensity = p.hemiIntensity;
    }
    if (point.current) {
      point.current.intensity = p.windowGlow * 9;
      if (entrance) point.current.position.set(...entrance);
    }
    invalidate();
  }, [p, entrance, invalidate]);

  return (
    <>
      <directionalLight ref={key} castShadow />
      <directionalLight ref={fill} />
      <hemisphereLight ref={hemi} />
      <pointLight ref={point} color="#ffc27a" distance={7} decay={2} intensity={0} position={[0, -50, 0]} />
    </>
  );
}
