// The reel's compositor: one GL pass that turns a finished frame into a video
// frame. It dissolves from the previous shot's last frame, darkens the end
// card, lays the words on top, and flips the rows so they read back top-down
// (ready for the encoder's canvas). The words are painted on a 2D canvas; GL
// does the rest.
import {
  CanvasTexture,
  LinearFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const target = (w: number, h: number) =>
  new WebGLRenderTarget(w, h, { type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });

export function createCompositor(gl: WebGLRenderer, width: number, height: number) {
  const output = target(width, height);
  const previous = target(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const words = canvas.getContext("2d")!;
  const overlay = new CanvasTexture(canvas);
  overlay.generateMipmaps = false;
  overlay.minFilter = LinearFilter;
  const quad = new FullScreenQuad();
  const composite = new ShaderMaterial({
    uniforms: {
      image: { value: null },
      previous: { value: previous.texture },
      overlay: { value: overlay },
      fade: { value: 1 },
      wordsAlpha: { value: 0 },
      scrim: { value: 0 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D image; uniform sampler2D previous; uniform sampler2D overlay;
      uniform float fade; uniform float wordsAlpha; uniform float scrim;
      varying vec2 vUv;
      void main() {
        // Row 0 of the output is the picture's top row.
        vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
        vec3 c = mix(texture2D(previous, uv).rgb, texture2D(image, uv).rgb, fade);
        c *= 1.0 - scrim;
        vec4 w = texture2D(overlay, uv);
        gl_FragColor = vec4(mix(c, w.rgb, w.a * wordsAlpha), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const copy = new ShaderMaterial({
    uniforms: { image: { value: null } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D image; varying vec2 vUv;
      void main() { gl_FragColor = texture2D(image, vUv); }`,
    depthTest: false,
    depthWrite: false,
  });
  const draw = (material: ShaderMaterial, to: WebGLRenderTarget) => {
    quad.material = material;
    gl.setRenderTarget(to);
    quad.render(gl);
  };
  return {
    output,
    /** The 2D canvas for the words (the video's size). */
    words,
    /** Call after painting new words. */
    wordsChanged: () => void (overlay.needsUpdate = true),
    compose(image: Texture, { fade, wordsAlpha, scrim }: { fade: number; wordsAlpha: number; scrim: number }) {
      const u = composite.uniforms;
      u.image.value = image;
      u.fade.value = fade;
      u.wordsAlpha.value = wordsAlpha;
      u.scrim.value = scrim;
      draw(composite, output);
      return output;
    },
    /** Keeps a shot's last finished frame (without words) for the next dissolve. */
    keep(image: Texture) {
      copy.uniforms.image.value = image;
      draw(copy, previous);
    },
    dispose() {
      quad.dispose();
      composite.dispose();
      copy.dispose();
      overlay.dispose();
      output.dispose();
      previous.dispose();
    },
  };
}
export type Compositor = ReturnType<typeof createCompositor>;
