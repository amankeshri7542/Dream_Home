// Procedural environment map: a PMREM of a tiny scene (sky dome clone, a warm
// "sun softbox" along the sun direction, a cool zenith panel and a warm ground
// bounce). Rebuilt only per 15-minute hour bucket; old targets are disposed.
import { useEffect, useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { createSkyMaterial, updateSky } from "./SkyDome";
import { envBucket, lighting, type Lighting, type SunContext } from "./timeOfDay";

export function useProceduralEnv(light: Lighting, north: number, size: number, place?: SunContext | null) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const bucket = envBucket(light.hour);
  useEffect(() => {
    // Rebuild from the bucket's representative hour (stable per bucket).
    const l = lighting(bucket / 4, north, place);
    const envScene = new Scene();
    const sky = createSkyMaterial();
    updateSky(sky, l, false);
    const disposables: { dispose(): void }[] = [sky];
    const dome = new Mesh(new SphereGeometry(100, 32, 16), sky);
    disposables.push(dome.geometry);
    envScene.add(dome);
    const p = l.palette;
    const dir = new Vector3(...l.keyDir);
    const softbox = new MeshBasicMaterial({
      color: p.sun.clone().multiplyScalar(0.8 + p.sunIntensity * 0.9),
      side: DoubleSide,
    });
    const box = new Mesh(new PlaneGeometry(36, 36), softbox);
    box.position.copy(dir.clone().multiplyScalar(80));
    box.lookAt(0, 0, 0);
    envScene.add(box);
    const zenith = new MeshBasicMaterial({ color: p.zenith.clone().multiplyScalar(1.1), side: DoubleSide });
    const panel = new Mesh(new PlaneGeometry(140, 140), zenith);
    panel.position.set(0, 90, 0);
    panel.rotation.x = Math.PI / 2;
    envScene.add(panel);
    const groundMat = new MeshBasicMaterial({ color: p.ground.clone().multiplyScalar(0.7), side: DoubleSide });
    const ground = new Mesh(new PlaneGeometry(400, 400), groundMat);
    ground.position.set(0, -6, 0);
    ground.rotation.x = -Math.PI / 2;
    envScene.add(ground);
    disposables.push(softbox, box.geometry, zenith, panel.geometry, groundMat, ground.geometry);
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(envScene, 0.04, 0.1, 500, { size });
    pmrem.dispose();
    disposables.forEach((d) => d.dispose());
    scene.environment = target.texture;
    invalidate();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [bucket, north, size, place, gl, scene, invalidate]);
  useLayoutEffect(() => {
    scene.environmentIntensity = light.palette.envIntensity;
  }, [scene, light]);
}
