// Room order for stepping between rooms (‹ › in the Room Studio, swipes and
// the [ ] keys): reading order on the plan, top to bottom then left to right,
// floor by floor.
import type { Project } from "../domain/types";

const BAND = 150;

/** Every room as {floorId, roomId}, ground floor first, in reading order. */
export function roomSequence(project: Project): { floorId: string; roomId: string }[] {
  return [...project.floors]
    .sort((a, b) => a.elevation - b.elevation)
    .flatMap((f) =>
      [...f.rooms]
        .sort((a, b) => {
          const za = Math.floor((a.bounds.z + a.bounds.d / 2) / BAND),
            zb = Math.floor((b.bounds.z + b.bounds.d / 2) / BAND);
          return za - zb || a.bounds.x - b.bounds.x;
        })
        .map((r) => ({ floorId: f.id, roomId: r.id })),
    );
}

/** The room before or after this one (wrapping round), or null if it's the only one. */
export function neighbourRoom(project: Project, roomId: string, dir: 1 | -1) {
  const list = roomSequence(project);
  if (list.length < 2) return null;
  const i = list.findIndex((r) => r.roomId === roomId);
  if (i < 0) return list[0];
  return list[(i + dir + list.length) % list.length];
}
