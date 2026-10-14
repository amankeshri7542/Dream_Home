// Walls rise out of the floor when rooms are added/moved/resized (easeOutBack,
// ~420 ms) and furniture pops (0.6 → 1.08 → 1 with a slight drop, 380 ms).
// Construction stage increases grow the whole footprint from the ground.
import { useEffect, useRef } from "react";
import type { Project } from "../../domain/types";
import { SLAB_TOP, easeOutBack, easeOutCubic, floorBase } from "../coords";
import { RISE_SLOTS, popUniforms, riseUniforms } from "../materials/patches";
import type { SceneStore } from "../store";

type RoomSig = Map<string, string>;
const signature = (project: Project) => {
  const map = new Map<string, RoomSig>();
  for (const f of project.floors) {
    const rooms: RoomSig = new Map();
    for (const r of f.rooms) rooms.set(r.id, `${r.bounds.x},${r.bounds.z},${r.bounds.w},${r.bounds.d}`);
    map.set(f.id, rooms);
  }
  return map;
};

/** 0.6 → 1.08 → 1 */
export function popScale(t: number) {
  if (t < 0.6) return 0.6 + 0.48 * easeOutCubic(t / 0.6);
  return 1.08 - 0.08 * easeOutCubic((t - 0.6) / 0.4);
}

let nextSlot = 0;

export function useRiseAnimations(project: Project, stage: number, store: SceneStore, reducedMotion: boolean) {
  const prev = useRef<Map<string, RoomSig> | null>(null);
  const prevStage = useRef(stage);
  useEffect(() => {
    const now = signature(project);
    const before = prev.current;
    prev.current = now;
    if (!before || reducedMotion) return;
    const changed: { floorId: string; roomId: string }[] = [];
    for (const [floorId, rooms] of now) {
      const old = before.get(floorId);
      if (!old) continue;
      for (const [roomId, sig] of rooms) if (old.get(roomId) !== sig) changed.push({ floorId, roomId });
    }
    if (!changed.length || changed.length > 6) return;
    const stops: (() => void)[] = [];
    for (const c of changed.slice(0, RISE_SLOTS)) {
      const floor = project.floors.find((f) => f.id === c.floorId)!;
      const room = floor.rooms.find((r) => r.id === c.roomId)!;
      const slot = nextSlot++ % RISE_SLOTS;
      const rect = riseUniforms.uRise.value[slot];
      const ry = riseUniforms.uRiseY.value[slot];
      const b = room.bounds;
      rect.set(b.x / 100, b.z / 100, (b.x + b.w) / 100, (b.z + b.d) / 100);
      const base = floorBase(floor) + SLAB_TOP;
      ry.set(base, floorBase(floor) + floor.height / 100, 0, 1);
      const stop = store.tween(
        0.42,
        (t) => ry.set(base, floorBase(floor) + floor.height / 100, Math.max(0.001, easeOutBack(t, 1.4)), t < 1 ? 1 : 0),
        () => ry.setW(0),
      );
      stops.push(() => {
        stop();
        ry.setW(0);
      });
    }
    // Furniture pop for the most recent room.
    const last = changed[changed.length - 1];
    const lf = project.floors.find((f) => f.id === last.floorId)!;
    const lr = lf.rooms.find((r) => r.id === last.roomId)!;
    const b = lr.bounds;
    popUniforms.uPop.value.set(b.x / 100, b.z / 100, (b.x + b.w) / 100, (b.z + b.d) / 100);
    const base = floorBase(lf);
    const stopPop = store.tween(
      0.38,
      (t) => popUniforms.uPopY.value.set(base, popScale(t), (1 - easeOutCubic(t)) * 0.25, t < 1 ? 1 : 0),
      () => popUniforms.uPopY.value.setW(0),
    );
    stops.push(() => {
      stopPop();
      popUniforms.uPopY.value.setW(0);
    });
    return () => stops.forEach((s) => s());
  }, [project, reducedMotion, store]);

  // Construction stage increases: the whole footprint grows from the ground.
  useEffect(() => {
    const before = prevStage.current;
    prevStage.current = stage;
    if (reducedMotion || stage <= before) return;
    const slot = nextSlot++ % RISE_SLOTS;
    const rect = riseUniforms.uRise.value[slot];
    const ry = riseUniforms.uRiseY.value[slot];
    rect.set(-1, -1, project.plot.width / 100 + 1, project.plot.depth / 100 + 1);
    const stop = store.tween(
      0.6,
      (t) => ry.set(-0.2, 1000, Math.max(0.001, easeOutBack(t, 1.2)), t < 1 ? 1 : 0),
      () => ry.setW(0),
    );
    return () => {
      stop();
      ry.setW(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, reducedMotion, store]);
}
