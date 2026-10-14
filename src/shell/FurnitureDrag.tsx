// Direct 3D arranging in Decorate: press on the selected piece of furniture
// and drag it across the floor — into another room, too. Like moving rooms,
// the press is taken before the orbit controls, a ghost shows where it lands,
// and one gesture commits once.
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import { floorForGeometry } from "../domain/core";
import {
  furnitureFitsRoom,
  furnitureFootprint,
  furnitureLabel,
  furnitureMisfitShort,
  resolveFurniture,
} from "../domain/furniture";
import { inside } from "../domain/geometry";
import { moveFurniture } from "../domain/furnitureCommands";
import { deriveWalls } from "../domain/model";
import type { EditResult, FurnitureItem, Project, Rect, Room } from "../domain/types";
import { DRAG_THRESHOLD } from "../editor/gesture";
import { floorSurfaceY, rayToPlot } from "../editor/spatial";
import type { EditorMode, GhostPreview, SelectionTarget } from "../editor/types";

type FurnitureTarget = Extract<SelectionTarget, { kind: "furniture" }>;
type Props = {
  project: Project;
  revision: number;
  mode: EditorMode;
  selection: SelectionTarget | null;
  onGhost: (ghost: GhostPreview | null) => void;
  onCommit: (result: EditResult, label: string, select: FurnitureTarget) => void;
  onBlocked: (result: EditResult) => void;
};

/** Furniture tops sit roughly this high; pressing a sofa's seat should grab it. */
const GRAB_HEIGHTS = [0.45, 0.02];
const GRAB_MARGIN = 15;

/** Short words for the floating badge. */
export function furnitureGhostLabel(
  result: EditResult,
  moving: string,
  into: Room | null,
  catalogId?: string,
) {
  if (result.ok) return into ? `Move to ${into.name}` : "Drop it here";
  // Not a piece for that room (a bed in a kitchen).
  if (into && catalogId && !furnitureFitsRoom(catalogId, into.kind))
    return furnitureMisfitShort(catalogId, into.kind);
  const issue = result.issues?.[0];
  if (issue?.code === "furniture-overlap") {
    const m = /^(.+) overlaps (.+)\. Leave/.exec(issue.message);
    if (m) {
      const other = m[1].toLowerCase() === moving.toLowerCase() ? m[2] : m[1].toLowerCase();
      return `Bumps into the ${other}`;
    }
    return "Bumps into furniture";
  }
  if (issue?.code === "furniture-outside") return "Too close to a wall";
  if (issue?.code === "furniture-blocks-door") return "That blocks a door";
  return "Can’t go here";
}

type Drag = {
  pointerId: number;
  start: { x: number; y: number };
  plane: number;
  startCm: { x: number; z: number };
  floorId: string;
  room: Room;
  item: FurnitureItem;
  label: string;
  dragging: boolean;
  revision: number;
  key: string;
  /** How far the pointer has carried the piece, in centimetres. */
  moved: number;
  result: EditResult | null;
  into: Room;
};

export function FurnitureDrag(props: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<Drag | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const d = drag.current;
    if (d && d.revision !== props.revision) cancelRef.current?.();
  }, [props.revision]);

  useEffect(() => {
    const host = gl.domElement.closest<HTMLElement>(".dh-scene-host") ?? gl.domElement.parentElement;
    if (!host) return;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let frame = 0;
    let pending: PointerEvent | null = null;

    const plotAt = (e: { clientX: number; clientY: number }, y: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return rayToPlot(raycaster.ray, y, latest.current.project.plot);
    };
    const finish = () => {
      const d = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame);
      pending = null;
      if (controls) controls.enabled = true;
      if (d) {
        try {
          host.releasePointerCapture(d.pointerId);
        } catch {
          /* already released */
        }
      }
      latest.current.onGhost(null);
      return d;
    };
    const cancel = () => {
      if (drag.current) finish();
    };
    cancelRef.current = cancel;

    const update = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const at = plotAt(e, d.plane);
      if (!at) return;
      const { project } = latest.current;
      const floor = project.floors.find((f) => f.id === d.floorId);
      if (!floor) return;
      d.moved = Math.hypot(at.x - d.startCm.x, at.z - d.startCm.z);
      // The piece's new centre in plot centimetres, on a 5 cm grid.
      const cx = Math.round((d.room.bounds.x + d.item.x + at.x - d.startCm.x) / 5) * 5,
        cz = Math.round((d.room.bounds.z + d.item.z + at.z - d.startCm.z) / 5) * 5;
      const into = floor.rooms.find((r) => inside(r.bounds, cx, cz)) ?? d.room;
      const key = `${cx},${cz},${into.id}`;
      if (key === d.key) return;
      d.key = key;
      const result = moveFurniture(project, d.floorId, d.room.id, d.item.id, {
        ...(into.id !== d.room.id ? { roomId: into.id } : {}),
        x: cx - into.bounds.x,
        z: cz - into.bounds.z,
        rotation: d.item.rotation,
      });
      d.result = result;
      d.into = into;
      const fp = furnitureFootprint({ ...d.item, x: cx, z: cz });
      latest.current.onGhost({
        floorId: d.floorId,
        bounds: fp,
        status: result.ok ? "valid" : "blocked",
        label: furnitureGhostLabel(result, d.label, into.id !== d.room.id ? into : null, d.item.catalogId),
        guides: [],
        blockers: [],
      });
    };

    const down = (e: PointerEvent) => {
      const p = latest.current;
      if (drag.current) {
        if (e.pointerId !== drag.current.pointerId) cancel();
        return;
      }
      if (!e.isPrimary || e.button !== 0 || p.mode !== "decorate") return;
      if (p.selection?.kind !== "furniture") return;
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const sel = p.selection;
      const floor = p.project.floors.find((f) => f.id === sel.floorId);
      const room = floor?.rooms.find((r) => r.id === sel.roomId);
      if (!floor || !room) return;
      const walls = deriveWalls(floorForGeometry(p.project, floor.id), p.project.plot.road);
      const item = resolveFurniture(room, walls).find((i) => i.id === sel.id);
      if (!item) return;
      const fp = furnitureFootprint(item);
      const grab: Rect = {
        x: room.bounds.x + fp.x - GRAB_MARGIN,
        z: room.bounds.z + fp.z - GRAB_MARGIN,
        w: fp.w + GRAB_MARGIN * 2,
        d: fp.d + GRAB_MARGIN * 2,
      };
      let hit: { plane: number; at: { x: number; z: number } } | null = null;
      for (const h of GRAB_HEIGHTS) {
        const plane = floorSurfaceY(floor) + h;
        const at = plotAt(e, plane);
        if (at && inside(grab, at.x, at.z)) {
          hit = { plane, at };
          break;
        }
      }
      if (!hit) return;
      e.stopPropagation();
      e.preventDefault();
      if (controls) controls.enabled = false;
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events cannot capture */
      }
      drag.current = {
        pointerId: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        plane: hit.plane,
        startCm: hit.at,
        floorId: floor.id,
        room,
        item,
        label: furnitureLabel(item),
        dragging: false,
        revision: p.revision,
        key: "",
        moved: 0,
        result: null,
        into: room,
      };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < DRAG_THRESHOLD) return;
        d.dragging = true;
      }
      pending = e;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending) update(pending);
          pending = null;
        });
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      if (d.dragging) update(e);
      const done = finish();
      if (!done?.dragging || !done.result) return;
      if (done.into.id === done.room.id && done.moved < 5) return;
      const result = done.result;
      if (result.ok)
        latest.current.onCommit(
          result,
          done.into.id === done.room.id
            ? `Move ${done.label.toLowerCase()}`
            : `Move ${done.label.toLowerCase()} to ${done.into.name}`,
          { kind: "furniture", floorId: done.floorId, roomId: done.into.id, id: result.focusId ?? done.item.id },
        );
      else latest.current.onBlocked(result);
    };
    const lost = (e: PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) cancel();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drag.current) {
        e.stopPropagation();
        e.preventDefault();
        cancel();
      }
    };
    host.addEventListener("pointerdown", down, { capture: true });
    host.addEventListener("pointermove", move, { capture: true });
    host.addEventListener("pointerup", up, { capture: true });
    host.addEventListener("pointercancel", lost, { capture: true });
    host.addEventListener("lostpointercapture", lost);
    window.addEventListener("keydown", key, { capture: true });
    return () => {
      cancel();
      cancelRef.current = null;
      host.removeEventListener("pointerdown", down, { capture: true });
      host.removeEventListener("pointermove", move, { capture: true });
      host.removeEventListener("pointerup", up, { capture: true });
      host.removeEventListener("pointercancel", lost, { capture: true });
      host.removeEventListener("lostpointercapture", lost);
      window.removeEventListener("keydown", key, { capture: true });
    };
  }, [gl, camera, controls]);

  useEffect(() => {
    cancelRef.current?.();
  }, [props.mode, props.selection?.id]);
  return null;
}
