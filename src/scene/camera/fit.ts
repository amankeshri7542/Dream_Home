// Pure perspective "fit" maths. Given a box, a camera direction (spherical
// azimuth/polar like camera-controls), the vertical FOV, the viewport and the
// chrome insets, find the smallest orbit distance at which all eight corners
// sit inside the clear (inset) area with a margin, and the focal offset that
// centres the target in that clear area.
//
// camera-controls applies the focal offset after orbiting as a camera-space
// translation: position += right·fx + up·(−fy) (+ back·fz). `focal` below is in
// that convention, ready for `controls.setFocalOffset(fx, fy, 0)`.

export type Vec3 = [number, number, number];
export type Insets = { top: number; right: number; bottom: number; left: number };
export type FitInput = {
  min: Vec3;
  max: Vec3;
  /** Radians around +y; 0 = camera on the +z side looking toward −z. */
  azimuth: number;
  /** Radians from +y (0 = straight down). */
  polar: number;
  /** Vertical field of view, degrees. */
  fov: number;
  width: number;
  height: number;
  insets?: Insets;
  /** Fraction of the clear half-extent kept free on each side (default 0.08). */
  margin?: number;
};
export type FitResult = {
  target: Vec3;
  distance: number;
  /** camera-controls focal offset (fx, fy). */
  focal: [number, number];
  /** Camera position before the focal offset. */
  position: Vec3;
};

export type Basis = { right: Vec3; up: Vec3; back: Vec3 };

/** Camera basis for a spherical direction (three.js lookAt with up = +y). */
export function cameraBasis(azimuth: number, polar: number): Basis {
  const sp = Math.sin(polar);
  const back: Vec3 = [sp * Math.sin(azimuth), Math.cos(polar), sp * Math.cos(azimuth)];
  // right = normalize(up × back) with up = +y → (back.z, 0, −back.x)
  let rx = back[2],
    rz = -back[0];
  const len = Math.hypot(rx, rz);
  if (len < 1e-12) {
    rx = Math.cos(azimuth);
    rz = -Math.sin(azimuth);
  } else {
    rx /= len;
    rz /= len;
  }
  const right: Vec3 = [rx, 0, rz];
  // up = back × right
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return { right, up, back };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

export function fitBox(input: FitInput): FitResult {
  const { min, max, azimuth, polar, fov, width, height } = input;
  const insets = input.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const margin = input.margin ?? 0.08;
  const W = Math.max(1, width),
    H = Math.max(1, height);
  // Honour each panel fully (a tall phone sheet may cover 60% of the screen),
  // but keep at least 24% of the viewport usable: when opposite insets
  // together exceed 76%, shrink both proportionally.
  const squeeze = (a: number, b: number, size: number) => {
    const total = Math.max(0, a) + Math.max(0, b),
      cap = size * 0.76;
    const k = total > cap ? cap / total : 1;
    return [Math.max(0, a) * k, Math.max(0, b) * k];
  };
  const [l, r] = squeeze(insets.left, insets.right, W),
    [t, b] = squeeze(insets.top, insets.bottom, H);
  const target: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * (W / H);
  const basis = cameraBasis(azimuth, polar);
  // Clear-area centre and half extents in NDC.
  const cx = (l - r) / W,
    cy = (b - t) / H;
  const hx = (1 - (l + r) / W) * (1 - margin),
    hy = (1 - (t + b) / H) * (1 - margin);
  // Camera translation (right, up) that maps the target to the clear centre:
  // ox = −cx·D·tanH, oy = −cy·D·tanV  (i.e. (r−l)/W·D·tanH, (t−b)/H·D·tanV).
  const kx = -cx * tanH,
    ky = -cy * tanV;
  let D = 0;
  for (const corner of boxCorners(min, max)) {
    const rel: Vec3 = [corner[0] - target[0], corner[1] - target[1], corner[2] - target[2]];
    const x = dot(rel, basis.right),
      y = dot(rel, basis.up),
      z = dot(rel, basis.back);
    // depth d = D − z; NDC = (x − k·D) / (tan·d). Bound by c ± h.
    const hiX = cx + hx,
      loX = cx - hx,
      hiY = cy + hy,
      loY = cy - hy;
    D = Math.max(
      D,
      (x + hiX * tanH * z) / (kx + hiX * tanH),
      (x + loX * tanH * z) / (kx + loX * tanH),
      (y + hiY * tanV * z) / (ky + hiY * tanV),
      (y + loY * tanV * z) / (ky + loY * tanV),
      z + 0.5,
    );
  }
  D = Math.max(D, 0.5);
  const ox = kx * D,
    oy = ky * D;
  const position: Vec3 = [
    target[0] + basis.back[0] * D,
    target[1] + basis.back[1] * D,
    target[2] + basis.back[2] * D,
  ];
  return { target, distance: D, focal: [ox, -oy], position };
}

/** Apply a camera-controls focal offset to a camera position (for tests/bridges). */
export function applyFocal(position: Vec3, basis: Basis, focal: [number, number]): Vec3 {
  const [fx, fy] = focal;
  return [
    position[0] + basis.right[0] * fx - basis.up[0] * fy,
    position[1] + basis.right[1] * fx - basis.up[1] * fy,
    position[2] + basis.right[2] * fx - basis.up[2] * fy,
  ];
}

/** Nearest equivalent of `target` to `current` (avoid spinning through 2π). */
export function nearestAngle(current: number, target: number) {
  const TAU = Math.PI * 2;
  return target + Math.round((current - target) / TAU) * TAU;
}
