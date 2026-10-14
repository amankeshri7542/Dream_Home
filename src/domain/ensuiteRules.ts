// The en-suite link reconciler, kept free of command imports so features.ts
// can register it without an import cycle.
import { registerReconciler } from "./edit";
import type { EditIssue, Project } from "./types";
import { ensuiteHost } from "./walls";

/**
 * Keeps links honest: a bathroom whose bedroom is gone, changed use, or no
 * longer shares a wall becomes an ordinary bathroom (with a short notice).
 */
export function reconcileEnsuites(_before: Project, after: Project, notices: EditIssue[]): Project {
  let changed = false;
  const floors = after.floors.map((f) => {
    let touched = false;
    const rooms = f.rooms.map((r) => {
      if (!r.attachedTo || ensuiteHost(f.rooms, r)) return r;
      touched = true;
      const { attachedTo: _gone, ...rest } = r;
      void _gone;
      if (r.kind === "bathroom")
        notices.push({
          code: "ensuite-unlinked",
          severity: "notice",
          message: `${r.name} is no longer attached to a bedroom, so it opens like any room.`,
          source: { kind: "room", id: r.id, floorId: f.id },
          blockers: [],
          floorIds: [f.id],
          fixes: [],
        });
      return rest;
    });
    if (!touched) return f;
    changed = true;
    return { ...f, rooms };
  });
  // Rooms set aside lose their link: they'll be placed somewhere new.
  const stagedRooms = after.stagedRooms?.map((s) => {
    if (!s.room.attachedTo) return s;
    changed = true;
    const { attachedTo: _gone, ...room } = s.room;
    void _gone;
    return { ...s, room };
  });
  if (!changed) return after;
  return { ...after, floors, ...(stagedRooms ? { stagedRooms } : {}) };
}
registerReconciler(reconcileEnsuites);
