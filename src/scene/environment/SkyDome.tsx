// Gradient sky dome (zenith → horizon → ground) with a soft sun/moon disc and
// hashed stars at night. Shader only — no network assets.
import { useMemo } from "react";
import { BackSide, Color, ShaderMaterial, Vector3 } from "three";
import type { Lighting } from "./timeOfDay";

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const fragmentShader = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uDisc;
varying vec3 vDir;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, h), 0.5));
  else col = mix(uHorizon, uGround, smoothstep(0.0, -0.22, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(sd, 5.0) * 0.16 + pow(sd, 48.0) * 0.3) * (1.0 - 0.6 * uNight);
  float disc = smoothstep(0.99935, 0.99972, sd);
  col += uSun * disc * uDisc;
  if (uNight > 0.01 && h > 0.0) {
    vec3 p = floor(d * 420.0);
    float s = hash13(p);
    float star = step(0.9982, s) * smoothstep(0.02, 0.35, h) * (0.6 + 0.4 * hash13(p + 7.0));
    col += vec3(star) * uNight * 1.4;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSkyMaterial() {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new Color() },
      uHorizon: { value: new Color() },
      uGround: { value: new Color() },
      uSun: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uDisc: { value: 6 },
    },
  });
}

export function updateSky(material: ShaderMaterial, light: Lighting, stars = true) {
  const u = material.uniforms;
  const p = light.palette;
  (u.uZenith.value as Color).copy(p.zenith);
  (u.uHorizon.value as Color).copy(p.horizon);
  (u.uGround.value as Color).copy(p.ground).lerp(p.horizon, 0.35);
  const moon = light.night > 0.5;
  const dir = moon ? light.moonDir : light.sunDir;
  (u.uSunDir.value as Vector3).set(dir[0], dir[1], dir[2]);
  (u.uSun.value as Color).copy(p.sun).multiplyScalar(moon ? 0.5 : 1);
  u.uNight.value = stars ? light.night : 0;
  u.uDisc.value = moon ? 3 : light.elevation > -1 ? 7 : 0;
}

export function SkyDome({ light }: { light: Lighting }) {
  const material = useMemo(() => createSkyMaterial(), []);
  updateSky(material, light);
  return (
    <mesh renderOrder={-10} frustumCulled={false} material={material} raycast={() => null}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}
