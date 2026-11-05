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
uniform float uClouds;
varying vec3 vDir;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudField(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return s;
}
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
  // Soft high clouds, thinning towards the horizon (haze) and lit by the sun's colour.
  if (uClouds > 0.0 && h > 0.0) {
    vec2 cp = d.xz / (h + 0.16) * 0.85;
    float f = cloudField(cp + vec2(3.7, 1.9));
    float thick = smoothstep(0.47, 0.72, f) * smoothstep(0.015, 0.2, h);
    float shade = smoothstep(0.46, 0.8, cloudField(cp * 1.1 + vec2(4.4, 2.3)));
    vec3 lit = mix(uHorizon, uSun, 0.35) * 1.22 + vec3(0.12) * (1.0 - uNight);
    vec3 cloud = mix(lit, lit * 0.74, shade);
    col = mix(col, cloud, thick * uClouds * (1.0 - 0.88 * uNight));
  }
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
      uClouds: { value: 0 },
    },
  });
}

export function updateSky(material: ShaderMaterial, light: Lighting, stars = true, clouds = 0) {
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
  u.uClouds.value = clouds;
  u.uDisc.value = moon ? 3 : light.elevation > -1 ? 7 : 0;
}

/** Clouds only where the sky is looked at (Explore, Walk, street photos): editing views keep the cheaper sky. */
export function SkyDome({ light, clouds = false }: { light: Lighting; clouds?: boolean }) {
  const material = useMemo(() => createSkyMaterial(), []);
  updateSky(material, light, true, clouds ? 0.85 : 0);
  return (
    <mesh renderOrder={-10} frustumCulled={false} material={material} raycast={() => null}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}
