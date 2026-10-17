// The photo renderer: an offline, render-quality still of the live scene.
//
// It borrows the app's renderer and scene but never touches what's on screen:
// every sample is drawn into its own half-float targets at the photo's size.
//  1. Each sample: a sub-pixel camera shift (clean edges) and a slightly moved
//     sun (soft, area-like shadows), drawn with full-quality ambient occlusion.
//  2. The samples are averaged.
//  3. One final shader: a soft glow on bright lamps, exposure, neutral tone
//     mapping, a warm grade, vignette and fine grain, then sRGB.
//  4. The pixels are read back for the watermark and JPEG encoding.
// Everything it changes (render target, shadow size, sun, fog) is restored.
import {
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  LinearFilter,
  NoToneMapping,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { N8AOPass } from "n8ao";

export type PhotoMood = { exposure: number; warmth: number; bloom: number; vignette: number };
export type PhotoJob = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  width: number;
  height: number;
  samples: number;
  /** The shadow-casting sun, jittered for soft shadows. */
  sun: DirectionalLight | null;
  shadowSize: number;
  mood: PhotoMood;
  onProgress?: (fraction: number) => void;
  cancelled?: () => boolean;
};
export type PhotoPixels = { width: number; height: number; pixels: Uint8Array };

/** Thrown when the photo is cancelled (checked by name: this module loads lazily). */
export class PhotoCancelled extends Error {
  override name = "PhotoCancelled";
}

/** Halton low-discrepancy sequence (deterministic sample positions). */
export function halton(index: number, base: number): number {
  let f = 1,
    r = 0,
    i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Running average: out = mix(previous, sample, weight). */
const blend = () =>
  new ShaderMaterial({
    // ("sample" is a reserved word in WebGL2 shaders, hence "current".)
    uniforms: { previous: { value: null }, current: { value: null }, weight: { value: 1 } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D previous; uniform sampler2D current; uniform float weight; varying vec2 vUv;
      void main() { gl_FragColor = mix(texture2D(previous, vUv), texture2D(current, vUv), weight); }`,
    depthTest: false,
    depthWrite: false,
  });

/** Bright parts only, downsampled (the start of the lamp glow). */
const brightPass = () =>
  new ShaderMaterial({
    uniforms: { image: { value: null }, threshold: { value: 1.0 } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D image; uniform float threshold; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(image, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c * smoothstep(threshold, threshold * 1.6, l), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

/** A 9-tap Gaussian along one direction. */
const blur = () =>
  new ShaderMaterial({
    uniforms: { image: { value: null }, step: { value: new Vector2() } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D image; uniform vec2 step; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(image, vUv).rgb * 0.227;
        c += (texture2D(image, vUv + step).rgb + texture2D(image, vUv - step).rgb) * 0.195;
        c += (texture2D(image, vUv + step * 2.0).rgb + texture2D(image, vUv - step * 2.0).rgb) * 0.122;
        c += (texture2D(image, vUv + step * 3.0).rgb + texture2D(image, vUv - step * 3.0).rgb) * 0.054;
        c += (texture2D(image, vUv + step * 4.0).rgb + texture2D(image, vUv - step * 4.0).rgb) * 0.016;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

/** The finishing pass: glow, exposure, neutral tone mapping, grade, vignette, grain, sRGB. */
const finish = () =>
  new ShaderMaterial({
    uniforms: {
      image: { value: null },
      glow: { value: null },
      exposure: { value: 1 },
      bloom: { value: 0.2 },
      warmth: { value: 0.04 },
      vignette: { value: 0.22 },
      aspect: { value: 1 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D image; uniform sampler2D glow;
      uniform float exposure; uniform float bloom; uniform float warmth; uniform float vignette; uniform float aspect;
      varying vec2 vUv;
      // Khronos PBR Neutral, as three.js's NeutralToneMapping (the live view uses it too).
      vec3 neutral(vec3 color) {
        const float start = 0.8 - 0.04;
        const float desaturation = 0.15;
        float x = min(color.r, min(color.g, color.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        color -= offset;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < start) return color;
        float d = 1.0 - start;
        float newPeak = 1.0 - d * d / (peak + d - start);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
        return mix(color, vec3(newPeak), g);
      }
      vec3 toSRGB(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(image, vUv).rgb + texture2D(glow, vUv).rgb * bloom;
        c = neutral(c * exposure);
        // A gentle warm grade: lift reds, ease blues, a touch more contrast in the mids.
        c *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.6);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
        vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
        c *= 1.0 - vignette * smoothstep(0.35, 1.1, length(q) * 1.15);
        vec3 s = toSRGB(c);
        s += (hash(vUv * 1024.0) - 0.5) / 255.0 * 1.5;
        gl_FragColor = vec4(s, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

const target = (w: number, h: number, type: TextureDataType = HalfFloatType) =>
  new WebGLRenderTarget(w, h, { type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });

/** Things that should never appear in a photo (selection outlines, hover marks). */
function hideOverlays(scene: Scene): () => void {
  const hidden: Object3D[] = [];
  scene.traverse((o) => {
    if (o.name === "selection-overlay" && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  return () => hidden.forEach((o) => (o.visible = true));
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function renderPhoto(job: PhotoJob): Promise<PhotoPixels> {
  const { gl, scene, camera, width: W, height: H, sun } = job;
  const samples = Math.max(1, Math.round(job.samples));

  // What we change, to put back afterwards.
  const saved = {
    target: gl.getRenderTarget(),
    autoClear: gl.autoClear,
    toneMapping: gl.toneMapping,
    shadowAuto: gl.shadowMap.autoUpdate,
    sunPosition: sun?.position.clone(),
    shadowSize: sun?.shadow.mapSize.clone(),
    fog: scene.fog instanceof Fog ? { near: scene.fog.near, far: scene.fog.far } : null,
    clear: gl.getClearColor(new Color()),
    clearAlpha: gl.getClearAlpha(),
  };
  const restoreOverlays = hideOverlays(scene);

  const sample = target(W, H);
  const accum = [target(W, H), target(W, H)];
  const gw = Math.max(1, Math.round(W / 4)),
    gh = Math.max(1, Math.round(H / 4));
  const glowA = target(gw, gh),
    glowB = target(gw, gh);
  const output = target(W, H, UnsignedByteType);
  const quad = new FullScreenQuad();
  const mats = { blend: blend(), bright: brightPass(), blur: blur(), finish: finish() };
  const ao = new N8AOPass(scene, camera, W, H);
  Object.assign(ao.configuration, {
    aoRadius: 0.9,
    distanceFalloff: 0.6,
    intensity: 2.2,
    aoSamples: 16,
    denoiseSamples: 8,
    denoiseRadius: 12,
    halfRes: false,
    gammaCorrection: false,
    transparencyAware: false,
    accumulate: false,
    color: new Color("#2b2118"),
  });
  ao.renderToScreen = false;

  const draw = (material: ShaderMaterial, to: WebGLRenderTarget) => {
    quad.material = material;
    gl.setRenderTarget(to);
    quad.render(gl);
  };

  try {
    gl.autoClear = true;
    gl.toneMapping = NoToneMapping;
    gl.shadowMap.autoUpdate = false;
    // Fog that suits this camera, not the live one.
    if (scene.fog instanceof Fog) {
      const d = camera.position.length();
      scene.fog.near = d + 30;
      scene.fog.far = Math.max(scene.fog.near + 160, 300);
    }
    if (sun && sun.shadow.mapSize.x !== job.shadowSize) {
      sun.shadow.mapSize.set(job.shadowSize, job.shadowSize);
      sun.shadow.map?.dispose();
      (sun.shadow as { map: unknown }).map = null;
    }
    // The sun's spot and a sideways axis for the soft-shadow jitter.
    const sunTarget = sun ? sun.target.getWorldPosition(new Vector3()) : null;
    const sunHome = sun?.position.clone();
    const toSun = sun && sunTarget ? sunHome!.clone().sub(sunTarget) : null;
    const spread = toSun ? toSun.length() * 0.035 : 0;
    const side = toSun ? new Vector3(0, 1, 0).cross(toSun).normalize() : null;
    const up = toSun && side ? toSun.clone().cross(side).normalize() : null;

    let read = accum[0],
      write = accum[1];
    for (let i = 0; i < samples; i++) {
      if (job.cancelled?.()) throw new PhotoCancelled();
      const n = i + 1;
      // Sub-pixel shift (anti-aliasing). The first sample is centred.
      const jx = i === 0 ? 0 : halton(n, 2) - 0.5,
        jy = i === 0 ? 0 : halton(n, 3) - 0.5;
      camera.setViewOffset(W, H, jx, jy, W, H);
      camera.updateProjectionMatrix();
      // The sun wanders across a small disc: overlapping shadows read as soft.
      if (sun && sunHome && side && up && i > 0) {
        const r = Math.sqrt(halton(n, 5)) * spread,
          a = halton(n, 7) * Math.PI * 2;
        sun.position.copy(sunHome).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
        sun.updateMatrixWorld();
      }
      gl.shadowMap.needsUpdate = true;
      ao.render(gl, sample, null);
      mats.blend.uniforms.previous.value = read.texture;
      mats.blend.uniforms.current.value = sample.texture;
      mats.blend.uniforms.weight.value = 1 / n;
      draw(mats.blend, write);
      [read, write] = [write, read];
      job.onProgress?.(n / samples);
      // Let the page breathe (progress ring, Cancel button) between samples.
      await nextFrame();
    }

    // Lamp glow: bright parts, blurred at quarter size.
    mats.bright.uniforms.image.value = read.texture;
    draw(mats.bright, glowA);
    for (let pass = 0; pass < 2; pass++) {
      mats.blur.uniforms.image.value = glowA.texture;
      mats.blur.uniforms.step.value.set(1.5 / gw, 0);
      draw(mats.blur, glowB);
      mats.blur.uniforms.image.value = glowB.texture;
      mats.blur.uniforms.step.value.set(0, 1.5 / gh);
      draw(mats.blur, glowA);
    }
    const u = mats.finish.uniforms;
    u.image.value = read.texture as Texture;
    u.glow.value = glowA.texture;
    u.exposure.value = job.mood.exposure;
    u.bloom.value = job.mood.bloom;
    u.warmth.value = job.mood.warmth;
    u.vignette.value = job.mood.vignette;
    u.aspect.value = W / H;
    draw(mats.finish, output);

    const pixels = new Uint8Array(W * H * 4);
    const async = (gl as unknown as { readRenderTargetPixelsAsync?: WebGLRenderer["readRenderTargetPixels"] })
      .readRenderTargetPixelsAsync;
    if (async) await async.call(gl, output, 0, 0, W, H, pixels);
    else gl.readRenderTargetPixels(output, 0, 0, W, H, pixels);
    return { width: W, height: H, pixels };
  } finally {
    camera.clearViewOffset();
    if (sun && saved.sunPosition) {
      sun.position.copy(saved.sunPosition);
      sun.updateMatrixWorld();
      if (saved.shadowSize && sun.shadow.mapSize.x !== saved.shadowSize.x) {
        sun.shadow.mapSize.copy(saved.shadowSize);
        sun.shadow.map?.dispose();
        (sun.shadow as { map: unknown }).map = null;
      }
    }
    if (scene.fog instanceof Fog && saved.fog) {
      scene.fog.near = saved.fog.near;
      scene.fog.far = saved.fog.far;
    }
    restoreOverlays();
    gl.setRenderTarget(saved.target);
    gl.autoClear = saved.autoClear;
    gl.toneMapping = saved.toneMapping;
    gl.shadowMap.autoUpdate = saved.shadowAuto;
    gl.shadowMap.needsUpdate = true;
    gl.setClearColor(saved.clear, saved.clearAlpha);
    ao.dispose();
    quad.dispose();
    Object.values(mats).forEach((m) => m.dispose());
    [sample, ...accum, glowA, glowB, output].forEach((t) => t.dispose());
  }
}
