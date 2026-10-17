// Shader patches (onBeforeCompile + customProgramCacheKey) shared by building
// materials:
//   clip  – the shared section plane (clipShadows) from cutPlane.ts
//   poché – back faces render a flat warm-charcoal section fill; materials are
//           permanently DoubleSide so toggling the cut never recompiles
//   rise  – up to four rects whose vertices scale up from a base (walls rising)
//   pop   – furniture in a rect scales/drops (0.6 → 1.08 → 1)
import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  RGBADepthPacking,
  Vector4,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { CUT_PLANES } from "./cutPlane";
import {
  FOCUS_CLIP,
  FOCUS_COLOR,
  FOCUS_FRAGMENT_DECL,
  FOCUS_VERTEX,
  FOCUS_VERTEX_DECL,
  focusUniforms,
} from "./focus";
import { UI_COLORS } from "./palette";

export const RISE_SLOTS = 4;
export const riseUniforms = {
  uRise: { value: Array.from({ length: RISE_SLOTS }, () => new Vector4(0, 0, 0, 0)) },
  /** (yBase, yTop, scale, active) */
  uRiseY: { value: Array.from({ length: RISE_SLOTS }, () => new Vector4(0, 0, 1, 0)) },
};
export const popUniforms = {
  uPop: { value: new Vector4(0, 0, 0, 0) },
  /** (yBase, scale, drop, active) */
  uPopY: { value: new Vector4(0, 1, 0, 0) },
};
export const pocheUniform = { value: new Color(UI_COLORS.poche) };

const RISE_VERTEX = /* glsl */ `
#ifdef DH_RISE
  for (int i = 0; i < ${RISE_SLOTS}; i++) {
    vec4 rr = uRise[i];
    vec4 ry = uRiseY[i];
    if (ry.w > 0.5 && transformed.x >= rr.x - 0.12 && transformed.x <= rr.z + 0.12 &&
        transformed.z >= rr.y - 0.12 && transformed.z <= rr.w + 0.12 &&
        transformed.y >= ry.x - 0.03 && transformed.y <= ry.y + 0.03) {
      transformed.y = ry.x + (transformed.y - ry.x) * ry.z;
    }
  }
#endif
#ifdef DH_POP
  if (uPopY.w > 0.5 && transformed.x >= uPop.x && transformed.x <= uPop.z &&
      transformed.z >= uPop.y && transformed.z <= uPop.w && transformed.y >= uPopY.x - 0.05) {
    vec2 c = vec2((uPop.x + uPop.z) * 0.5, (uPop.y + uPop.w) * 0.5);
    transformed.xz = c + (transformed.xz - c) * uPopY.y;
    transformed.y = uPopY.x + (transformed.y - uPopY.x) * uPopY.y + uPopY.z;
  }
#endif
`;

const VERTEX_DECL = /* glsl */ `
#ifdef DH_RISE
uniform vec4 uRise[${RISE_SLOTS}];
uniform vec4 uRiseY[${RISE_SLOTS}];
#endif
#ifdef DH_POP
uniform vec4 uPop;
uniform vec4 uPopY;
#endif
`;

/**
 * `focus`: "fade" tints everything outside the hero room; "cut" also cuts
 * neighbouring walls down to a stub (see focus.ts).
 */
export type PatchOptions = { clip?: boolean; poche?: boolean; rise?: boolean; pop?: boolean; focus?: "fade" | "cut" };

function patchShader(shader: WebGLProgramParametersWithUniforms, opts: PatchOptions) {
  const defines: string[] = [];
  if (opts.rise) {
    defines.push("#define DH_RISE");
    shader.uniforms.uRise = riseUniforms.uRise;
    shader.uniforms.uRiseY = riseUniforms.uRiseY;
  }
  if (opts.pop) {
    defines.push("#define DH_POP");
    shader.uniforms.uPop = popUniforms.uPop;
    shader.uniforms.uPopY = popUniforms.uPopY;
  }
  if (opts.rise || opts.pop) {
    shader.vertexShader =
      defines.join("\n") +
      "\n" +
      VERTEX_DECL +
      shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + RISE_VERTEX);
  }
  if (opts.poche) {
    shader.uniforms.uPoche = pocheUniform;
    shader.fragmentShader =
      "uniform vec3 uPoche;\n" +
      shader.fragmentShader.replace(
        "#include <tonemapping_fragment>",
        "if (!gl_FrontFacing) gl_FragColor = vec4(uPoche, 1.0);\n#include <tonemapping_fragment>",
      );
  }
  if (opts.focus) {
    const define = opts.focus === "cut" ? "#define DH_FOCUS\n#define DH_FOCUS_CUT\n" : "#define DH_FOCUS\n";
    Object.assign(shader.uniforms, focusUniforms);
    shader.vertexShader =
      define +
      FOCUS_VERTEX_DECL +
      shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + FOCUS_VERTEX);
    shader.fragmentShader =
      define +
      FOCUS_FRAGMENT_DECL +
      shader.fragmentShader
        .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + FOCUS_CLIP)
        .replace("#include <tonemapping_fragment>", FOCUS_COLOR + "\n#include <tonemapping_fragment>");
  }
}

/** Apply patches to a material (idempotent per material instance). */
export function patchMaterial<T extends Material>(material: T, opts: PatchOptions): T {
  if (opts.clip) {
    material.clippingPlanes = CUT_PLANES;
    material.clipShadows = true;
  }
  if (opts.poche) material.side = DoubleSide;
  const key = `dh:${opts.rise ? "r" : ""}${opts.pop ? "p" : ""}${opts.poche ? "c" : ""}${opts.focus ? opts.focus[0] : ""}`;
  if (opts.focus === "cut") material.userData.dhFocusCut = true;
  material.onBeforeCompile = (shader) => patchShader(shader, opts);
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

let riseDepth: MeshDepthMaterial | null = null;
let popDepth: MeshDepthMaterial | null = null;
/** Shadow depth materials that replicate the rise / pop vertex motion. */
export function riseDepthMaterial() {
  if (!riseDepth)
    riseDepth = patchMaterial(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), { rise: true, focus: "cut" });
  return riseDepth;
}
export function popDepthMaterial() {
  if (!popDepth)
    popDepth = patchMaterial(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), { pop: true });
  return popDepth;
}

/** Reset all rise slots (no animation). */
export function clearRise() {
  for (const v of riseUniforms.uRiseY.value) v.set(0, 0, 1, 0);
}
