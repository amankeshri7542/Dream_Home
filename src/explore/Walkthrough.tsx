// First-person walkthrough rendered inside the scene's Canvas. It borrows the
// camera while active and restores the orbit view exactly on exit.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Euler,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  type PointLight,
  Raycaster,
  Shape,
  ShapeGeometry,
  Vector2,
} from "three";
import { inside } from "../domain/geometry";
import { deriveFloorVoids } from "../domain/core";
import type { Floor, Project } from "../domain/types";
import { floorBaseY, plotToWorld, rayToPlot } from "../editor/spatial";
import { EYE_HEIGHT, buildColliders, moveVisitor, unstick } from "./walkPhysics";
import { walkInput } from "./walkInput";

type Props = {
  project: Project;
  startFloorId: string;
  start?: { x: number; z: number };
  reducedMotion: boolean;
  /** After dark the rooms light up around the visitor. */
  night?: boolean;
  onStatus?: (status: { floorId: string; roomId: string | null }) => void;
};

const WALK_FOV = 68;
/** The underside of the slab above sits this far below the next floor. */
const CEILING_DROP = 0.18;
const SPEED = 140; // cm per second
const TURN = 1.8; // radians per second

/**
 * A sensible entry point: one end of the largest room, looking along its
 * length, so the first view shows the room rather than a wall up close.
 */
export function walkSpawn(project: Project, floorId: string) {
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const rooms = [...floor.rooms].sort((a, b) => b.bounds.w * b.bounds.d - a.bounds.w * a.bounds.d);
  const r = rooms[0]?.bounds ?? floor.footprint;
  // yaw 0 looks north (−z); −π/2 looks east (+x).
  if (r.w >= r.d) return { x: r.x + Math.min(70, r.w * 0.2), z: r.z + r.d / 2, yaw: -Math.PI / 2 };
  return { x: r.x + r.w / 2, z: r.z + r.d - Math.min(70, r.d * 0.2), yaw: 0 };
}

export default function Walkthrough({ project, startFloorId, start, reducedMotion, night = false, onStatus }: Props) {
  const { camera, gl, invalidate } = useThree();
  const controls = useThree((state) => state.controls) as unknown as {
    enabled: boolean;
  } | null;
  const floorIndex = useRef(Math.max(0, project.floors.findIndex((f) => f.id === startFloorId)));
  const spawn = walkSpawn(project, startFloorId);
  const pos = useRef(start ?? { x: spawn.x, z: spawn.z });
  const eye = useRef(0);
  const yaw = useRef(start ? 0 : spawn.yaw); // yaw 0 looks north (−z)
  const pitch = useRef(-0.14); // a little downward: more room, less ceiling
  const target = useRef<{ x: number; z: number } | null>(null);
  const keys = useRef(new Set<string>());
  const lastRoom = useRef<string | null | undefined>(undefined);
  const lastFloorRequest = useRef(walkInput.floorRequestId);
  const [floorId, setFloorId] = useState(startFloorId);
  const lamp = useRef<PointLight>(null);
  const colliders = useMemo(
    () =>
      project.floors.map((floor) => {
        // Courtyards are open to the sky: fence them so nobody steps off an upper floor.
        const holes = deriveFloorVoids(project, floor.id)
          .filter((v) => v.kind === "courtyard")
          .map((v) => v.bounds);
        return buildColliders(project, floor.id, holes);
      }),
    [project],
  );

  // Borrow the camera; restore it on exit.
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const saved = {
      position: cam.position.clone(),
      quaternion: cam.quaternion.clone(),
      fov: cam.fov,
      near: cam.near,
    };
    const hadControls = controls?.enabled ?? false;
    if (controls) controls.enabled = false;
    cam.fov = WALK_FOV;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    pos.current = unstick(pos.current, colliders[floorIndex.current]);
    eye.current = floorBaseY(project.floors[floorIndex.current]) + EYE_HEIGHT / 100;
    invalidate();
    return () => {
      cam.position.copy(saved.position);
      cam.quaternion.copy(saved.quaternion);
      cam.fov = saved.fov;
      cam.near = saved.near;
      cam.updateProjectionMatrix();
      if (controls) controls.enabled = hadControls;
      invalidate();
    };
    // The walk session is set up once; later project edits are not possible in Explore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DOM controls (joystick, floor buttons) wake the on-demand render loop.
  useEffect(() => {
    walkInput.wake = () => invalidate();
    return () => {
      walkInput.wake = null;
    };
  }, [invalidate]);

  // Keyboard and pointer look / tap-to-walk.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,select,textarea")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "q", "e"].includes(k)) {
        keys.current.add(k);
        target.current = null;
        if (k.startsWith("arrow")) e.preventDefault();
        invalidate();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    const pdown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    const pmove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      yaw.current -= dx * 0.005;
      pitch.current = Math.max(-1.1, Math.min(1.1, pitch.current - dy * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
      invalidate();
    };
    const pup = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tapped = !drag.moved;
      drag = null;
      if (!tapped) return;
      // Tap the floor to walk there.
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new Raycaster();
      ray.setFromCamera(ndc, camera);
      const floor = project.floors[floorIndex.current];
      const hit = rayToPlot(ray.ray, floorBaseY(floor), project.plot, 3000);
      if (hit) {
        target.current = hit;
        invalidate();
      }
    };
    const cancel = () => {
      drag = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup);
    el.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointermove", pmove);
      el.removeEventListener("pointerup", pup);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [gl, camera, invalidate, project]);

  const euler = useMemo(() => new Euler(0, 0, 0, "YXZ"), []);
  useFrame((_state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const k = keys.current;
    let forward = walkInput.forward,
      strafe = walkInput.strafe,
      turn = walkInput.turn;
    if (k.has("w") || k.has("arrowup")) forward += 1;
    if (k.has("s") || k.has("arrowdown")) forward -= 1;
    if (k.has("a")) strafe -= 1;
    if (k.has("d")) strafe += 1;
    if (k.has("arrowleft") || k.has("q")) turn += 1;
    if (k.has("arrowright") || k.has("e")) turn -= 1;
    const run = k.has("shift") || walkInput.run;
    yaw.current += turn * TURN * dt;
    let floor = project.floors[floorIndex.current];
    let moving = forward !== 0 || strafe !== 0 || turn !== 0;
    let delta = { x: 0, z: 0 };
    const speed = SPEED * (run ? 2 : 1) * dt;
    if (forward || strafe) {
      const sin = Math.sin(yaw.current),
        cos = Math.cos(yaw.current);
      // yaw = π faces −z (north). Forward vector in plot space:
      delta = {
        x: (-sin * forward + cos * strafe) * speed,
        z: (-cos * forward - sin * strafe) * speed,
      };
      const len = Math.hypot(delta.x, delta.z);
      if (len > speed) {
        delta.x *= speed / len;
        delta.z *= speed / len;
      }
    } else if (target.current) {
      const dx = target.current.x - pos.current.x,
        dz = target.current.z - pos.current.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 8) target.current = null;
      else {
        const step = Math.min(dist, speed);
        delta = { x: (dx / dist) * step, z: (dz / dist) * step };
        const desired = Math.atan2(-dx, -dz);
        let diff = desired - yaw.current;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        yaw.current += diff * Math.min(1, dt * 4);
        moving = true;
      }
    }
    if (delta.x || delta.z) {
      const next = moveVisitor(pos.current, delta, colliders[floorIndex.current]);
      // Blocked: barely moved compared with the step asked for. (Comparing with
      // the step, not a fixed distance, keeps very short frames from counting.)
      const wanted = Math.hypot(delta.x, delta.z),
        moved = Math.hypot(next.x - pos.current.x, next.z - pos.current.z);
      if (target.current && wanted > 0.5 && moved < wanted * 0.2) target.current = null;
      pos.current = next;
    }
    // Floor changes: walking onto stairs, or the HUD's up/down buttons.
    const requested = walkInput.floorRequestId !== lastFloorRequest.current;
    if (requested) lastFloorRequest.current = walkInput.floorRequestId;
    const stairs = project.verticalSpaces.find(
      (v) =>
        v.kind === "stairs" &&
        v.floorIds.includes(floor.id) &&
        inside(v.bounds, pos.current.x, pos.current.z),
    );
    const change = (to: number) => {
      const next = project.floors[to];
      if (!next) return;
      floorIndex.current = to;
      floor = next;
      const s = stairs?.bounds;
      if (s) {
        // Step off the top/bottom of the flight onto the new floor.
        const exitEdge = { x: s.x + s.w / 2, z: s.z - 40 };
        pos.current = unstick(exitEdge, colliders[to]);
      } else {
        const spot = walkSpawn(project, next.id);
        pos.current = unstick({ x: spot.x, z: spot.z }, colliders[to]);
        yaw.current = spot.yaw;
      }
      target.current = null;
    };
    if (requested) change(floorIndex.current + walkInput.floorRequest);
    else if (stairs && (forward > 0 || target.current)) {
      const i = floorIndex.current;
      if (stairs.floorIds.includes(project.floors[i + 1]?.id ?? "")) change(i + 1);
      else if (i > 0 && stairs.floorIds.includes(project.floors[i - 1].id)) change(i - 1);
    }
    // Ease the eye height toward the current floor (smooth on stairs).
    const want = floorBaseY(floor) + EYE_HEIGHT / 100;
    const ease = reducedMotion ? 1 : Math.min(1, dt * 6);
    eye.current += (want - eye.current) * ease;
    if (Math.abs(want - eye.current) > 0.002) moving = true;
    const world = plotToWorld(project.plot, pos.current.x, pos.current.z, eye.current);
    camera.position.copy(world);
    lamp.current?.position.set(world.x, eye.current + 0.9, world.z);
    euler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(euler);
    // Room announcements.
    const room =
      floor.rooms.find((r) => inside(r.bounds, pos.current.x, pos.current.z))?.id ?? null;
    if (room !== lastRoom.current || floor.id !== floorId) {
      lastRoom.current = room;
      if (floor.id !== floorId) setFloorId(floor.id);
      onStatus?.({ floorId: floor.id, roomId: room });
    }
    if (moving) invalidate();
  });
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  return (
    <>
      <WalkCeiling project={project} floor={floor} />
      {/* A warm ceiling light that follows the visitor; dark by day so the
          light count (and every shader) stays the same as the hour changes. */}
      <pointLight ref={lamp} color="#ffd29a" intensity={night ? 7 : 0} distance={8} decay={1.4} />
    </>
  );
}

/**
 * A soft plaster ceiling over the floor being walked, so looking up shows a
 * room rather than the underside of the roof. Courtyards and stairwells stay open.
 */
function WalkCeiling({ project, floor }: { project: Project; floor: Floor }) {
  const geometry = useMemo(() => {
    const f = floor.footprint;
    const shape = new Shape();
    // Shape (x, y) = plot (x, z); turning it face-down maps shape y onto world +z.
    shape.moveTo(f.x, f.z);
    shape.lineTo(f.x + f.w, f.z);
    shape.lineTo(f.x + f.w, f.z + f.d);
    shape.lineTo(f.x, f.z + f.d);
    shape.closePath();
    for (const v of deriveFloorVoids(project, floor.id)) {
      const b = v.bounds;
      const hole = new Path();
      hole.moveTo(b.x, b.z);
      hole.lineTo(b.x, b.z + b.d);
      hole.lineTo(b.x + b.w, b.z + b.d);
      hole.lineTo(b.x + b.w, b.z);
      hole.closePath();
      shape.holes.push(hole);
    }
    const g = new ShapeGeometry(shape);
    g.scale(0.01, 0.01, 1);
    return g;
  }, [project, floor]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: "#f4ede3", roughness: 0.95, metalness: 0 }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const origin = plotToWorld(project.plot, 0, 0, floorBaseY(floor) + floor.height / 100 - CEILING_DROP);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={origin}
      rotation={[Math.PI / 2, 0, 0]}
      raycast={() => null}
    />
  );
}
