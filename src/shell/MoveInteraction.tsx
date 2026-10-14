// Direct 3D moving: grab a room, balcony, stairs or courtyard and drag it
// across its floor. Rendered inside the scene's Canvas. Pointer-downs that
// land on a movable piece are taken before the orbit controls see them; any
// other drag still turns the view. One gesture commits exactly once.
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import { balconyBounds } from "../domain/core";
import { inside, overlaps } from "../domain/geometry";
import type { EditIssue, EditResult, Project, Rect } from "../domain/types";
import { cmPerPixel, floorSurfaceY, plotToWorld, rayToPlot } from "../editor/spatial";
import { previewMove, type SnapLock } from "../editor/transformPreview";
import type { EditorMode, GhostPreview, SelectionTarget } from "../editor/types";
import type { Tool } from "../editor/state";
import { DRAG_THRESHOLD } from "../editor/gesture";

// Furniture arranging shares this lazy chunk.
export { FurnitureDrag } from "./FurnitureDrag";

type MovableTarget = Extract<SelectionTarget, { kind: "room" | "balcony" | "vertical" }>;
type Movable = { target: MovableTarget; bounds: Rect; name: string };

type Props = {
  project: Project;
  revision: number;
  mode: EditorMode;
  tool: Tool;
  floorId: string;
  selection: SelectionTarget | null;
  onGhost: (ghost: GhostPreview | null) => void;
  onSelect: (target: SelectionTarget) => void;
  onCommit: (result: EditResult, label: string) => void;
  onBlocked: (result: EditResult) => void;
  /** A room dropped on the Tray button is set aside. */
  onSetAside: (room: { floorId: string; id: string; name: string }) => void;
};

/** Movable pieces on a floor, the selected one first. */
function movables(project: Project, floorId: string, selection: SelectionTarget | null): Movable[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const items: Movable[] = [
    ...floor.rooms.map((r) => ({
      target: { kind: "room" as const, floorId, id: r.id },
      bounds: r.bounds,
      name: r.name,
    })),
    ...floor.balconies.map((b) => ({
      target: { kind: "balcony" as const, floorId, id: b.id },
      bounds: balconyBounds(floor, b),
      name: floor.elevation > 0 ? "Balcony" : "Veranda",
    })),
    ...project.verticalSpaces
      .filter((v) => v.floorIds.includes(floorId))
      .map((v) => ({
        target: { kind: "vertical" as const, floorId, id: v.id },
        bounds: v.bounds,
        name: v.kind === "stairs" ? "Stairs" : "Courtyard",
      })),
  ];
  const selected = selection ? items.findIndex((m) => m.target.id === selection.id) : -1;
  if (selected > 0) items.unshift(...items.splice(selected, 1));
  return items;
}

/** A few words for the floating badge while dragging. */
export function ghostLabel(
  project: Project,
  status: GhostPreview["status"],
  issue?: EditIssue,
  swapWith?: string,
) {
  if (status !== "blocked" && swapWith) return `Swap with ${swapWith}`;
  if (status === "valid") return "Drop it here";
  if (status === "snap") return "Lined up — drop it here";
  const blocker = issue?.blockers[0];
  if (blocker) {
    for (const f of project.floors) {
      const room = f.rooms.find((r) => r.id === blocker.id);
      if (room) return `Bumps into ${room.name}`;
    }
    const v = project.verticalSpaces.find((x) => x.id === blocker.id);
    if (v) return v.kind === "stairs" ? "Covers the stairs" : "Covers the courtyard";
    if (blocker.kind === "balcony") return "Bumps into the balcony";
  }
  if (issue?.code.includes("outside")) return "Outside the house";
  return "Can’t go here";
}

type Drag = {
  pointerId: number;
  start: { x: number; y: number };
  startCm: { x: number; z: number };
  item: Movable;
  dragging: boolean;
  revision: number;
  lock: SnapLock;
  preview: ReturnType<typeof previewMove> | null;
  key: string;
};

export function MoveInteraction(props: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<Drag | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // A document change (undo, another edit) mid-gesture cancels it.
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

    const plotAt = (e: { clientX: number; clientY: number }, floorId: string) => {
      const p = latest.current.project;
      const floor = p.floors.find((f) => f.id === floorId);
      if (!floor) return null;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return rayToPlot(raycaster.ray, floorSurfaceY(floor), p.plot);
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
      const { project } = latest.current;
      if (
        d.item.target.kind === "room" &&
        document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-room-tray-drop]")
      ) {
        if (d.key !== "tray") {
          d.key = "tray";
          latest.current.onGhost({
            floorId: d.item.target.floorId,
            bounds: d.item.bounds,
            status: "snap",
            label: `Put ${d.item.name} in the tray`,
            guides: [],
            blockers: [],
          });
        }
        return;
      }
      const floorId = d.item.target.floorId;
      const at = plotAt(e, floorId);
      if (!at) return;
      const floor = project.floors.find((f) => f.id === floorId)!;
      const centre = plotToWorld(project.plot, d.item.bounds.x + d.item.bounds.w / 2, d.item.bounds.z + d.item.bounds.d / 2, floorSurfaceY(floor));
      const perPx = cmPerPixel(camera, centre, gl.domElement.clientHeight);
      const preview = previewMove(
        project,
        floorId,
        d.item.target.id,
        d.item.bounds,
        { dx: at.x - d.startCm.x, dz: at.z - d.startCm.z },
        { attract: 8 * perPx, release: 12 * perPx, lock: d.lock, intent: "swap" },
      );
      d.lock = preview.lock;
      d.preview = preview;
      const b = preview.bounds;
      const key = `${b.x},${b.z},${preview.status},${preview.guides.length}`;
      if (key === d.key) return;
      d.key = key;
      // Dropping a room onto another room swaps the two.
      const swap =
        d.item.target.kind === "room" && preview.result.ok
          ? floor.rooms.find((r) => r.id !== d.item.target.id && overlaps(r.bounds, b))
          : undefined;
      latest.current.onGhost({
        floorId,
        bounds: b,
        status: preview.status,
        label: ghostLabel(project, preview.status, preview.issue, swap?.name),
        guides: preview.guides,
        blockers: preview.issue?.blockers.map((x) => x.id) ?? [],
      });
      // A gentle tick when something lines up (where the device supports it).
      if (preview.status === "snap" && e.pointerType === "touch") navigator.vibrate?.(8);
    };

    const down = (e: PointerEvent) => {
      const p = latest.current;
      if (drag.current) {
        // A second finger: let it pinch/zoom, and drop the move.
        if (e.pointerId !== drag.current.pointerId) cancel();
        return;
      }
      if (!e.isPrimary || e.button !== 0 || p.mode !== "build") return;
      const armed = p.tool === "move";
      // With a mouse, the selected piece can be dragged without arming Move.
      const quick = p.tool === "select" && e.pointerType === "mouse" && !!p.selection;
      if (!armed && !quick) return;
      // The canvas, or a room's floating name label (a natural handle to grab).
      if (!(e.target instanceof Element) || !e.target.closest("canvas, .scene-room-label")) return;
      const floorId = p.floorId;
      const at = plotAt(e, floorId);
      if (!at) return;
      const candidates = movables(p.project, floorId, p.selection);
      const pool = armed ? candidates : candidates.filter((m) => m.target.id === p.selection?.id);
      const item = pool.find((m) => inside(m.bounds, at.x, at.z));
      if (!item) return;
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
        startCm: at,
        item,
        dragging: false,
        revision: p.revision,
        lock: {},
        preview: null,
        key: "",
      };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.stopPropagation();
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < DRAG_THRESHOLD) return;
        d.dragging = true;
        if (latest.current.selection?.id !== d.item.target.id) latest.current.onSelect(d.item.target);
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
      // Dropped on the Tray button: put the room away for later.
      const tray =
        d.dragging && d.item.target.kind === "room"
          ? document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-room-tray-drop]")
          : null;
      if (d.dragging && !tray) update(e);
      const done = finish();
      if (!done) return;
      if (tray) {
        latest.current.onSetAside({ ...done.item.target, name: done.item.name });
        return;
      }
      if (!done.dragging) {
        // A tap: pick the piece, just like a click on the canvas.
        latest.current.onSelect(done.item.target);
        return;
      }
      const result = done.preview?.result;
      if (!result) return;
      const unchanged =
        result.ok &&
        done.preview!.bounds.x === done.item.bounds.x &&
        done.preview!.bounds.z === done.item.bounds.z;
      if (unchanged) return;
      if (result.ok) latest.current.onCommit(result, `Move ${done.item.name}`);
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
    // Capture on the host so these run before the orbit controls and R3F.
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

  // Leaving Build, switching tools or floors drops an unfinished gesture.
  useEffect(() => {
    cancelRef.current?.();
  }, [props.mode, props.tool, props.floorId]);
  return null;
}
