// In-Canvas projector: after the camera updates each rendered frame, project
// overlay anchors to CSS px and write transforms imperatively (no React
// re-render per frame). Hides anchors behind the camera, off-screen, or
// occluded by the walls of their floor (ignoring wall parts above the cut),
// and declutters room labels that would overlap.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Raycaster, Vector3, type Camera, type Object3D } from "three";
import { CUT_OFF, cutHeight } from "../materials/cutPlane";
import type { OverlayRegistry } from "./registry";

const v = new Vector3();
const dir = new Vector3();
const point = new Vector3();
const ray = new Raycaster();

/** Do walls (below the section cut) stand between the camera and this point? */
function blocked(camera: Camera, meshes: Object3D[], x: number, y: number, z: number, cut: number) {
  point.set(x, y, z);
  dir.copy(point).sub(camera.position);
  const dist = dir.length();
  ray.set(camera.position, dir.normalize());
  ray.far = dist - 0.05;
  for (const hit of ray.intersectObjects(meshes, false)) if (hit.point.y <= cut + 0.001) return true;
  return false;
}

/** Label declutter: the full label, its name only, a small marker, or hidden. */
type Fit = "full" | "compact" | "marker" | "hidden";
/** A marker's footprint when decluttering (it draws at 18 px). */
const MARKER = 11;

export function OverlayProjector({ registry }: { registry: OverlayRegistry }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lastMatrix = useRef(new Matrix4());
  const lastVersion = useRef(-1);
  const lastSize = useRef("");
  const occluded = useRef(new Map<string, boolean>());
  /** Label declutter result (see `Fit`). */
  const fit = useRef(new Map<string, Fit>());
  useFrame(() => {
    camera.updateMatrixWorld();
    const sizeKey = `${size.width}x${size.height}`;
    const moved =
      !lastMatrix.current.equals(camera.matrixWorld) || lastVersion.current !== registry.version || lastSize.current !== sizeKey;
    lastMatrix.current.copy(camera.matrixWorld);
    lastVersion.current = registry.version;
    lastSize.current = sizeKey;
    const cut = cutHeight();
    const shown: { id: string; el: HTMLElement; x: number; y: number; hide: boolean; priority: number }[] = [];
    for (const [id, a] of registry.anchors) {
      const el = a.el;
      if (!el) continue;
      v.set(...a.pos).project(camera);
      const behind = v.z > 1 || v.z < -1;
      const x = ((v.x + 1) / 2) * size.width,
        y = ((1 - v.y) / 2) * size.height;
      const off = x < -40 || y < -20 || x > size.width + 40 || y > size.height + 20;
      // Occlusion is recomputed only when the view or anchors change.
      if (moved && !behind && !off) {
        let hidden = false;
        const meshes = a.floorId ? registry.occluders.get(a.floorId) : undefined;
        if (meshes && meshes.length) {
          const [x, y, z] = a.pos;
          // A room seen over its cut walls keeps its label: hidden only when
          // walls block both the label's spot and the room just under the cut.
          const under = cut - 0.05;
          hidden =
            blocked(camera, meshes, x, y, z, cut) &&
            (cut >= CUT_OFF / 2 || under <= y || blocked(camera, meshes, x, under, z, cut));
        }
        occluded.current.set(id, hidden);
      }
      const hide = behind || off || occluded.current.get(id) === true;
      let px = x,
        py = y;
      if (id === "ghost") {
        // Keep the drag badge readable: inside the area the panels leave clear.
        const ins = registry.insets,
          hw = el.offsetWidth / 2 + 8,
          hh = el.offsetHeight / 2 + 8;
        px = Math.min(Math.max(px, ins.left + hw), size.width - ins.right - hw);
        py = Math.min(Math.max(py, ins.top + hh), size.height - ins.bottom - hh);
      }
      el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
      shown.push({ id, el, x: px, y: py, hide, priority: a.priority ?? Number.POSITIVE_INFINITY });
    }
    // Declutter room labels: bigger (or selected) rooms keep the full label;
    // a colliding one drops to just its name, then to a small marker that
    // still opens the room (and shows its name on hover or focus), and hides
    // only if even that collides.
    if (moved) {
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const hits = (r: { x0: number; y0: number; x1: number; y1: number }) =>
        placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
      for (const s of [...shown].sort((a, b) => b.priority - a.priority)) {
        if (!s.id.startsWith("label:")) continue;
        if (s.hide) {
          fit.current.set(s.id, "hidden");
          continue;
        }
        s.el.classList.remove("is-compact", "is-marker");
        const w = s.el.offsetWidth + 4,
          h = s.el.offsetHeight + 2;
        const full = { x0: s.x - w / 2, y0: s.y - h / 2, x1: s.x + w / 2, y1: s.y + h / 2 };
        const compact = { x0: full.x0, y0: s.y - 11, x1: full.x1, y1: s.y + 11 };
        const marker = { x0: s.x - MARKER, y0: s.y - MARKER, x1: s.x + MARKER, y1: s.y + MARKER };
        let state: Fit = "hidden";
        if (!hits(full)) {
          placed.push(full);
          state = "full";
        } else if (!hits(compact)) {
          placed.push(compact);
          state = "compact";
        } else if (!hits(marker)) {
          placed.push(marker);
          state = "marker";
        }
        fit.current.set(s.id, state);
      }
    }
    for (const s of shown) {
      const state = fit.current.get(s.id);
      if (s.id.startsWith("label:")) {
        s.el.classList.toggle("is-compact", state === "compact");
        s.el.classList.toggle("is-marker", state === "marker");
      }
      const vis = s.hide || state === "hidden" ? "hidden" : "visible";
      if (s.el.style.visibility !== vis) s.el.style.visibility = vis;
    }
  });
  return null;
}
