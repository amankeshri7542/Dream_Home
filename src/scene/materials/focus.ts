// The dollhouse "hero room": one shared set of uniforms that every building
// material reads. Outside the focused room's rectangle, walls above a low stub
// are discarded and everything fades toward the paper colour; inside it, the
// cut tops of the room's own walls glow. The define is always compiled in, so
// entering or leaving a room never recompiles a shader or rebuilds geometry.
import { Color, Vector4 } from "three";
import { UI_COLORS } from "./palette";

export const focusUniforms = {
  /** World rect (x0, z0, x1, z1) of the hero room, padded to include its walls. */
  uFocusRect: { value: new Vector4(0, 0, 0, 0) },
  /** (active 0|1, fade 0..1, stub height (world y), glow 0..1) */
  uFocusP: { value: new Vector4(0, 0, 1e6, 0) },
  uFocusTint: { value: new Color("#efe6d8") },
  uFocusGlow: { value: new Color(UI_COLORS.selection) },
};

/** Plain mirror of the uniforms for CPU-side picking. */
export const focusState = { active: false, x0: 0, z0: 0, x1: 0, z1: 0, stubY: 1e6, fade: 0 };

export function setFocus(rect: { x0: number; z0: number; x1: number; z1: number } | null, stubY = 1e6) {
  if (!rect) {
    focusUniforms.uFocusP.value.x = 0;
    focusState.active = false;
    return;
  }
  focusUniforms.uFocusRect.value.set(rect.x0, rect.z0, rect.x1, rect.z1);
  focusUniforms.uFocusP.value.x = 1;
  focusUniforms.uFocusP.value.z = stubY;
  Object.assign(focusState, { active: true, ...rect, stubY });
}
export function setFocusMix(fade: number, glow: number) {
  focusUniforms.uFocusP.value.y = fade;
  focusUniforms.uFocusP.value.w = glow;
  focusState.fade = fade;
}
/** Would a point be cut away by the focus (outside the room and above the stub)? */
export function focusHides(x: number, y: number, z: number) {
  if (!focusState.active || focusState.fade < 0.5) return false;
  const outside = x < focusState.x0 || x > focusState.x1 || z < focusState.z0 || z > focusState.z1;
  return outside && y > focusState.stubY;
}

export const FOCUS_VERTEX_DECL = /* glsl */ `
#ifdef DH_FOCUS
varying vec3 vDhWorld;
#endif
`;
export const FOCUS_VERTEX = /* glsl */ `
#ifdef DH_FOCUS
  vec4 dhWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    dhWorld = batchingMatrix * dhWorld;
  #endif
  #ifdef USE_INSTANCING
    dhWorld = instanceMatrix * dhWorld;
  #endif
  vDhWorld = (modelMatrix * dhWorld).xyz;
#endif
`;
export const FOCUS_FRAGMENT_DECL = /* glsl */ `
#ifdef DH_FOCUS
varying vec3 vDhWorld;
uniform vec4 uFocusRect;
uniform vec4 uFocusP;
uniform vec3 uFocusTint;
uniform vec3 uFocusGlow;
#endif
`;
/** Runs first in main(): decides "outside the hero room" and cuts. */
export const FOCUS_CLIP = /* glsl */ `
#ifdef DH_FOCUS
  bool dhOutside = uFocusP.x > 0.5 && (vDhWorld.x < uFocusRect.x || vDhWorld.x > uFocusRect.z ||
    vDhWorld.z < uFocusRect.y || vDhWorld.z > uFocusRect.w);
  #ifdef DH_FOCUS_CUT
    if (dhOutside && uFocusP.y > 0.5 && vDhWorld.y > uFocusP.z) discard;
  #endif
#endif
`;
/** Runs just before tone mapping: fades the neighbours, lights the hero's cut tops. */
export const FOCUS_COLOR = /* glsl */ `
#ifdef DH_FOCUS
  if (dhOutside) gl_FragColor.rgb = mix(gl_FragColor.rgb, uFocusTint, uFocusP.y * 0.62);
  else if (uFocusP.x > 0.5 && !gl_FrontFacing) gl_FragColor.rgb = mix(gl_FragColor.rgb, uFocusGlow, uFocusP.w);
#endif
`;
