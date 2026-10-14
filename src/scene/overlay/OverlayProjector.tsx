// In-Canvas projector: after the camera updates each rendered frame, project
// overlay anchors to CSS px and write transforms imperatively (no React
// re-render per frame). Hides anchors behind the camera, off-screen, or
// occluded by the walls of their floor (ignoring wall parts above the cut),
// and declutters room labels that would overlap.
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Raycaster, Vector3 } from "three";
import { cutHeight } from "../materials/cutPlane";
import type { OverlayRegistry } from "./registry";

const v = new Vector3();
const dir = new Vector3();
const ray = new Raycaster();

export function OverlayProjector({ registry }: { registry: OverlayRegistry }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lastMatrix = useRef(new Matrix4());
  const lastVersion = useRef(-1);
  const lastSize = useRef("");
  const occluded = useRef(new Map<string, boolean>());
  /** Label declutter result: full, name only, or hidden behind a bigger label. */
  const fit = useRef(new Map<string, "full" | "compact" | "hidden">());
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
          const target = new Vector3(...a.pos);
          dir.copy(target).sub(camera.position);
          const dist = dir.length();
          ray.set(camera.position, dir.normalize());
          ray.far = dist - 0.05;
          for (const hit of ray.intersectObjects(meshes, false)) {
            if (hit.point.y <= cut + 0.001) {
              hidden = true;
              break;
            }
          }
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
    // a colliding one drops to just its name, or hides if even that collides.
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
        s.el.classList.remove("is-compact");
        const w = s.el.offsetWidth + 4,
          h = s.el.offsetHeight + 2;
        const full = { x0: s.x - w / 2, y0: s.y - h / 2, x1: s.x + w / 2, y1: s.y + h / 2 };
        const compact = { x0: full.x0, y0: s.y - 11, x1: full.x1, y1: s.y + 11 };
        let state: "full" | "compact" | "hidden" = "hidden";
        if (!hits(full)) {
          placed.push(full);
          state = "full";
        } else if (!hits(compact)) {
          placed.push(compact);
          state = "compact";
        }
        fit.current.set(s.id, state);
      }
    }
    for (const s of shown) {
      const state = fit.current.get(s.id);
      if (s.id.startsWith("label:")) s.el.classList.toggle("is-compact", state === "compact");
      const vis = s.hide || state === "hidden" ? "hidden" : "visible";
      if (s.el.style.visibility !== vis) s.el.style.visibility = vis;
    }
  });
  return null;
}
