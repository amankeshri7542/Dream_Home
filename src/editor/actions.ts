// Selection-generic actions shared by the action dock, inspectors and keys.
import { useCallback, useMemo } from "react";
import { duplicateRoom, rotateRoom } from "../domain/builder";
import {
  removeBalcony,
  removeRoom,
  removeVerticalSpace,
  swapRoomUses,
  transformComponent,
  updateRoom,
} from "../domain/model";
import { removeStagedRoom, setAsideRoom } from "../domain/tray";
import { addAttachedBathroom, ensuiteOf } from "../domain/ensuite";
import { useEditor } from "./EditorProvider";
import type { SelectionTarget } from "./types";

export function useSelectionActions() {
  const editor = useEditor();
  const { project, selected, dispatch, run } = editor;
  const target = selected?.target ?? null;
  const floorId = selected?.floor?.id;

  const nudge = useCallback(
    (dx: number, dz: number) => {
      if (!selected?.bounds || !floorId || !target) return;
      const b = selected.bounds;
      run(
        transformComponent(
          project,
          floorId,
          target.id,
          { ...b, x: b.x + dx, z: b.z + dz },
          "move",
          { intent: "strict" },
        ),
        `Move ${selected.name}`,
        { quietError: true },
      );
    },
    [project, selected, floorId, target, run],
  );
  const rotate = useCallback(() => {
    if (target?.kind !== "room" || !floorId) return;
    run(rotateRoom(project, floorId, target.id), `Rotate ${selected!.name}`, {
      notice: "Room rotated a quarter turn.",
      quietError: true,
    });
  }, [project, target, floorId, selected, run]);
  const duplicate = useCallback(() => {
    if (target?.kind !== "room" || !floorId) return;
    const result = duplicateRoom(project, floorId, target.id);
    const copy = result.ok
      ? result.project.floors.find((f) => f.id === floorId)!.rooms.at(-1)
      : undefined;
    run(result, `Duplicate ${selected!.name}`, {
      select: copy ? { kind: "room", floorId, id: copy.id } : undefined,
      notice: "Room duplicated. Move it anywhere it fits.",
      quietError: true,
    });
  }, [project, target, floorId, selected, run]);
  const setAside = useCallback(() => {
    if (target?.kind !== "room" || !floorId) return;
    if (
      run(setAsideRoom(project, floorId, target.id), `Set aside ${selected!.name}`, {
        select: null,
        quietError: true,
      })
    ) {
      dispatch({ type: "open-panel", panel: "tray" });
      dispatch({
        type: "notify",
        text: `${selected!.name} is waiting in the tray. Place it back whenever you like.`,
        tone: "success",
        undo: true,
      });
    }
  }, [project, target, floorId, selected, run, dispatch]);
  const remove = useCallback(
    (t: SelectionTarget | null = target) => {
      if (!t) return;
      const name = selected?.name ?? "this space";
      if (t.kind === "room" && floorId)
        run(removeRoom(project, floorId, t.id), `Remove ${name}`, {
          select: null,
          notice: `${name} removed. Undo brings it back.`,
        });
      else if (t.kind === "balcony" && floorId)
        run(removeBalcony(project, floorId, t.id), `Remove ${name}`, {
          select: null,
        });
      else if (t.kind === "vertical")
        run(removeVerticalSpace(project, t.id), `Remove ${name}`, {
          select: null,
        });
      else if (t.kind === "staged")
        run(removeStagedRoom(project, t.id), `Remove ${name}`, { select: null });
    },
    [project, target, floorId, selected, run],
  );
  const requestRemove = useCallback(() => {
    if (!target) return;
    const name = selected?.name ?? "this space";
    dispatch({
      type: "confirm",
      confirm: {
        title: `Remove ${name}?`,
        body:
          target.kind === "room"
            ? "Setting it aside keeps its size, furniture and finishes in the tray so you can place it again later."
            : target.kind === "vertical"
              ? "This removes it from every floor it connects. Undo brings it back."
              : "Undo brings it back.",
        confirmLabel: `Remove ${target.kind === "room" ? "room" : "space"}`,
        ...(target.kind === "room"
          ? { safeLabel: "Set aside instead", safeAction: "set-aside" }
          : {}),
        action: "remove",
      },
    });
  }, [target, selected, dispatch]);
  const swapWith = useCallback(
    (otherId: string) => {
      if (target?.kind !== "room" || !floorId) return;
      run(swapRoomUses(project, floorId, target.id, otherId), "Swap room uses", {
        notice: "Room uses exchanged. Walls and sizes stay in place.",
        quietError: true,
      });
    },
    [project, target, floorId, run],
  );
  const focus = useCallback(() => {
    if (!target || !floorId) return;
    dispatch({ type: "choose-floor", floor: floorId });
    dispatch({ type: "view", patch: { cutaway: true, roof: false, stage: 4 } });
    dispatch({
      type: "camera",
      command: {
        type: "fit",
        subject: target.kind === "room" ? "room" : "floor",
        floorId,
        roomId: target.id,
        view: "keep",
      },
    });
  }, [target, floorId, dispatch]);
  const patchRoom = useCallback(
    (patch: Parameters<typeof updateRoom>[3], label: string, coalesceKey?: string) => {
      if (target?.kind !== "room" || !floorId) return false;
      return run(updateRoom(project, floorId, target.id, patch), label, {
        coalesceKey,
      });
    },
    [project, target, floorId, run],
  );
  /** A bedroom without its own bathroom, with space for one (a ~1 ms dry run). */
  const ensuiteFloorId = target?.kind === "room" && selected?.room?.kind === "bedroom" ? floorId : null;
  const ensuiteRoomId = target?.kind === "room" ? target.id : null;
  const canAddEnsuite = useMemo(() => {
    if (!ensuiteFloorId || !ensuiteRoomId) return false;
    const floor = project.floors.find((f) => f.id === ensuiteFloorId);
    if (!floor || ensuiteOf(floor.rooms, ensuiteRoomId)) return false;
    return addAttachedBathroom(project, ensuiteFloorId, ensuiteRoomId).ok;
  }, [project, ensuiteFloorId, ensuiteRoomId]);
  const addEnsuite = useCallback(() => {
    if (target?.kind !== "room" || !floorId) return;
    run(addAttachedBathroom(project, floorId, target.id), `Add a bathroom to ${selected!.name}`, {
      notice: `${selected!.name} has its own bathroom now — its door opens into the bedroom.`,
      quietError: true,
    });
  }, [project, target, floorId, selected, run]);
  return {
    target,
    canAddEnsuite,
    addEnsuite,
    nudge,
    rotate,
    duplicate,
    setAside,
    remove,
    requestRemove,
    swapWith,
    focus,
    patchRoom,
  };
}
