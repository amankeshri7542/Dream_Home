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
// `createPipeline` is the core; the reel (src/reel) films with it frame by frame.
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

export type PipelineOptions = {
  gl: WebGLRenderer;
  scene: Scene;
  /** The camera every sample is drawn from (it may move between samples). */
  camera: PerspectiveCamera;
  width: number;
  height: number;
  /** The shadow-casting sun, jittered for soft shadows. */
  sun: DirectionalLight | null;
  shadowSize: number;
  /** Quarter-cost ambient occlusion (video frames on phones). */
  aoHalfRes?: boolean;
};

/**
 * The renderer's core, shared by photos and the reel: draw samples of the
 * scene into half-float targets and average them, then finish the picture
 * (glow, grade, sRGB) into an 8-bit target. Built once, used for any number
 * of samples and frames, and `dispose()` puts back everything it changed.
 */
export type Pipeline = {
  width: number;
  height: number;
  /**
   * Draws sample `index` (0 starts a new average, centred) through the camera
   * and averages it in. `softSun` moves the sun across a small disc (the
   * shadow map is redrawn); `shadows` redraws the shadow map with the sun put.
   */
  sample(index: number, options?: { softSun?: boolean; shadows?: boolean }): void;
  /** The finished picture of the samples so far, in sRGB (bottom row first). */
  finish(mood: PhotoMood): WebGLRenderTarget;
  /** Reads a finished picture back, bottom row first. */
  read(target: WebGLRenderTarget, into?: Uint8Array): Promise<Uint8Array>;
  dispose(): void;
};

export function createPipeline(options: PipelineOptions): Pipeline {
  const { gl, scene, camera, width: W, height: H, sun } = options;
  // What we change, to put back afterwards.
  const saved = {
    target: gl.getRenderTarget(),
    autoClear: gl.autoClear,
    toneMapping: gl.toneMapping,
    shadowAuto: gl.shadowMap.autoUpdate,
    shadowSize: sun?.shadow.mapSize.clone(),
    fog: scene.fog instanceof Fog ? { near: scene.fog.near, far: scene.fog.far } : null,
    clear: gl.getClearColor(new Color()),
    clearAlpha: gl.getClearAlpha(),
  };
  const restoreOverlays = hideOverlays(scene);

  const sampleTarget = target(W, H);
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
    halfRes: !!options.aoHalfRes,
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

  gl.autoClear = true;
  gl.toneMapping = NoToneMapping;
  gl.shadowMap.autoUpdate = false;
  if (sun && sun.shadow.mapSize.x !== options.shadowSize) {
    sun.shadow.mapSize.set(options.shadowSize, options.shadowSize);
    sun.shadow.map?.dispose();
    (sun.shadow as { map: unknown }).map = null;
  }

  // The sun's own spot, kept the first time soft shadows move it.
  let sunHome: Vector3 | null = null;
  let side: Vector3 | null = null,
    up: Vector3 | null = null,
    spread = 0;
  let read = accum[0],
    write = accum[1];

  return {
    width: W,
    height: H,
    sample(index, { softSun = false, shadows = false } = {}) {
      const n = index + 1;
      // Fog that suits this camera, not the live one.
      if (scene.fog instanceof Fog) {
        scene.fog.near = camera.position.length() + 30;
        scene.fog.far = Math.max(scene.fog.near + 160, 300);
      }
      // Sub-pixel shift (anti-aliasing). The first sample is centred.
      const jx = index === 0 ? 0 : halton(n, 2) - 0.5,
        jy = index === 0 ? 0 : halton(n, 3) - 0.5;
      camera.setViewOffset(W, H, jx, jy, W, H);
      camera.updateProjectionMatrix();
      if (sun && softSun) {
        if (!sunHome) {
          sunHome = sun.position.clone();
          const toSun = sunHome.clone().sub(sun.target.getWorldPosition(new Vector3()));
          spread = toSun.length() * 0.035;
          side = new Vector3(0, 1, 0).cross(toSun).normalize();
          up = toSun.clone().cross(side).normalize();
        }
        // The sun wanders across a small disc: overlapping shadows read as soft.
        const r = index === 0 ? 0 : Math.sqrt(halton(n, 5)) * spread,
          a = halton(n, 7) * Math.PI * 2;
        sun.position.copy(sunHome).addScaledVector(side!, Math.cos(a) * r).addScaledVector(up!, Math.sin(a) * r);
        sun.updateMatrixWorld();
      }
      if (softSun || shadows) gl.shadowMap.needsUpdate = true;
      ao.render(gl, sampleTarget, null);
      if (index === 0) [read, write] = [accum[0], accum[1]];
      mats.blend.uniforms.previous.value = read.texture;
      mats.blend.uniforms.current.value = sampleTarget.texture;
      mats.blend.uniforms.weight.value = 1 / n;
      draw(mats.blend, write);
      [read, write] = [write, read];
    },
    finish(mood) {
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
      u.exposure.value = mood.exposure;
      u.bloom.value = mood.bloom;
      u.warmth.value = mood.warmth;
      u.vignette.value = mood.vignette;
      u.aspect.value = W / H;
      draw(mats.finish, output);
      return output;
    },
    async read(from, into) {
      const pixels = into ?? new Uint8Array(from.width * from.height * 4);
      const async = (gl as unknown as { readRenderTargetPixelsAsync?: WebGLRenderer["readRenderTargetPixels"] })
        .readRenderTargetPixelsAsync;
      if (async) await async.call(gl, from, 0, 0, from.width, from.height, pixels);
      else gl.readRenderTargetPixels(from, 0, 0, from.width, from.height, pixels);
      return pixels;
    },
    dispose() {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      if (sun) {
        if (sunHome) {
          sun.position.copy(sunHome);
          sun.updateMatrixWorld();
        }
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
      [sampleTarget, ...accum, glowA, glowB, output].forEach((t) => t.dispose());
    },
  };
}

export async function renderPhoto(job: PhotoJob): Promise<PhotoPixels> {
  const { width, height } = job;
  const samples = Math.max(1, Math.round(job.samples));
  const pipeline = createPipeline(job);
  try {
    for (let i = 0; i < samples; i++) {
      if (job.cancelled?.()) throw new PhotoCancelled();
      pipeline.sample(i, { softSun: true });
      job.onProgress?.((i + 1) / samples);
      // Let the page breathe (progress ring, Cancel button) between samples.
      await nextFrame();
    }
    const pixels = await pipeline.read(pipeline.finish(job.mood));
    return { width, height, pixels };
  } finally {
    pipeline.dispose();
  }
}
