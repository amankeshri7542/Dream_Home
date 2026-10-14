// Fit an orthographic shadow camera tightly around a world box in light space.
export type V3 = [number, number, number];
export type ShadowFit = {
  /** Light position and target (world). */
  position: V3;
  target: V3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
};

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Light-space basis matching three.js lookAt (camera looks along −dir). */
export function lightBasis(dir: V3) {
  const z = norm(dir); // from target toward the light
  let up: V3 = [0, 1, 0];
  if (Math.abs(z[1]) > 0.999) up = [0, 0, -1];
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return { x, y, z };
}

/**
 * @param dir unit vector toward the light
 * @param min,max world-space box to cover
 * @param pad extra metres around the box
 */
export function fitShadowCamera(dir: V3, min: V3, max: V3, pad = 0.5): ShadowFit {
  const { x, y, z } = lightBasis(dir);
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  const distance = radius + 10;
  const position: V3 = [center[0] + z[0] * distance, center[1] + z[1] * distance, center[2] + z[2] * distance];
  let l = Infinity,
    r = -Infinity,
    b = Infinity,
    t = -Infinity,
    n = Infinity,
    f = -Infinity;
  for (const cx of [min[0], max[0]])
    for (const cy of [min[1], max[1]])
      for (const cz of [min[2], max[2]]) {
        const rel: V3 = [cx - position[0], cy - position[1], cz - position[2]];
        const px = dot(rel, x),
          py = dot(rel, y),
          depth = -dot(rel, z);
        l = Math.min(l, px);
        r = Math.max(r, px);
        b = Math.min(b, py);
        t = Math.max(t, py);
        n = Math.min(n, depth);
        f = Math.max(f, depth);
      }
  return {
    position,
    target: center,
    left: l - pad,
    right: r + pad,
    bottom: b - pad,
    top: t + pad,
    near: Math.max(0.1, n - pad),
    far: f + pad,
  };
}
