// Hidden-face removal for a soup of touching (non-overlapping) axis-aligned
// boxes. Faces (or parts of faces) pressed against a neighbouring box are
// dropped, so the union is a single closed shell: section cuts then show only
// back faces of the shell (the poché fill) and never coplanar fighting caps.
import type { V3 } from "./QuadBuilder";

export type SoupBox<T = unknown> = { min: V3; max: V3; data: T };
/** Remaining visible rectangle of a face, in the face's (u, v) axes. */
export type FaceRect = { u0: number; u1: number; v0: number; v1: number };
export type SoupFace<T = unknown> = {
  box: SoupBox<T>;
  axis: 0 | 1 | 2;
  side: 1 | -1;
  plane: number;
  rects: FaceRect[];
};

const KEY = (v: number) => Math.round(v * 10000);
const EPS = 1e-5;

/** Subtract rectangle `cut` from `r`; returns up to four pieces. */
export function subtractRect(r: FaceRect, cut: FaceRect): FaceRect[] {
  if (cut.u0 >= r.u1 - EPS || cut.u1 <= r.u0 + EPS || cut.v0 >= r.v1 - EPS || cut.v1 <= r.v0 + EPS)
    return [r];
  const out: FaceRect[] = [];
  const cu0 = Math.max(r.u0, cut.u0),
    cu1 = Math.min(r.u1, cut.u1),
    cv0 = Math.max(r.v0, cut.v0),
    cv1 = Math.min(r.v1, cut.v1);
  if (cv0 > r.v0 + EPS) out.push({ u0: r.u0, u1: r.u1, v0: r.v0, v1: cv0 });
  if (cv1 < r.v1 - EPS) out.push({ u0: r.u0, u1: r.u1, v0: cv1, v1: r.v1 });
  if (cu0 > r.u0 + EPS) out.push({ u0: r.u0, u1: cu0, v0: cv0, v1: cv1 });
  if (cu1 < r.u1 - EPS) out.push({ u0: cu1, u1: r.u1, v0: cv0, v1: cv1 });
  return out;
}

/** Visible faces of every box after removing touching contacts. */
export function visibleFaces<T>(boxes: readonly SoupBox<T>[]): SoupFace<T>[] {
  // Index boxes by their min/max plane coordinate per axis.
  const byMin: Map<number, SoupBox<T>[]>[] = [new Map(), new Map(), new Map()];
  const byMax: Map<number, SoupBox<T>[]>[] = [new Map(), new Map(), new Map()];
  for (const b of boxes)
    for (let a = 0; a < 3; a++) {
      const kMin = KEY(b.min[a]),
        kMax = KEY(b.max[a]);
      (byMin[a].get(kMin) ?? byMin[a].set(kMin, []).get(kMin)!).push(b);
      (byMax[a].get(kMax) ?? byMax[a].set(kMax, []).get(kMax)!).push(b);
    }
  const faces: SoupFace<T>[] = [];
  for (const b of boxes) {
    if (b.max[0] - b.min[0] <= EPS || b.max[1] - b.min[1] <= EPS || b.max[2] - b.min[2] <= EPS)
      continue;
    for (const a of [0, 1, 2] as const) {
      const ua = (a + 1) % 3,
        va = (a + 2) % 3;
      for (const side of [-1, 1] as const) {
        const plane = side > 0 ? b.max[a] : b.min[a];
        // Neighbours on the far side of this face start (or end) at the plane.
        const neighbours = (side > 0 ? byMin : byMax)[a].get(KEY(plane)) ?? [];
        let rects: FaceRect[] = [{ u0: b.min[ua], u1: b.max[ua], v0: b.min[va], v1: b.max[va] }];
        for (const n of neighbours) {
          if (n === b) continue;
          const cut = { u0: n.min[ua], u1: n.max[ua], v0: n.min[va], v1: n.max[va] };
          rects = rects.flatMap((r) => subtractRect(r, cut));
          if (!rects.length) break;
        }
        if (rects.length) faces.push({ box: b, axis: a, side, plane, rects });
      }
    }
  }
  return faces;
}

/** World-space point at the centre of a face rect, nudged along the normal. */
export function faceSample(face: SoupFace, rect: FaceRect, nudge: number): V3 {
  const p: V3 = [0, 0, 0];
  const ua = (face.axis + 1) % 3,
    va = (face.axis + 2) % 3;
  p[face.axis] = face.plane + face.side * nudge;
  p[ua] = (rect.u0 + rect.u1) / 2;
  p[va] = (rect.v0 + rect.v1) / 2;
  return p;
}
