// Friendly, non-blocking advice: warnings with one-tap fixes, and the "Home
// checklist" (essentials plus playful quests) derived from project data.
import { balconyBounds, floorForGeometry } from "./core";
import { furnitureDoorConflicts, furnitureLabel } from "./furniture";
import { makeIssue } from "./issues";
import { openingSide, roomHasPassage } from "./openings";
import type { ComponentRef, EditIssue, IssueFix, Project } from "./types";
import {
  deriveWallSegments,
  deriveWalls,
  isPassable,
  isWindow,
  resolveFloorOpenings,
  segmentAt,
  touches,
} from "./walls";

const WINDOW_KINDS = new Set(["bedroom", "living"]);

/**
 * Advisory warnings for one floor (or all): rooms without a door, bedrooms and
 * living rooms without a window, upper-floor doors that open onto a drop, and
 * furniture standing in a doorway. Each carries fixes where one exists.
 */
export function projectAdvisories(
  project: Project,
  floorId?: string,
): EditIssue[] {
  const out: EditIssue[] = [];
  for (const floor of project.floors) {
    if (floorId !== undefined && floor.id !== floorId) continue;
    const floorIds = [floor.id];
    const geo = floorForGeometry(project, floor.id);
    const segments = deriveWallSegments(geo);
    const openings = resolveFloorOpenings(geo, project.plot.road, segments);
    for (const room of floor.rooms) {
      const source: ComponentRef = { kind: "room", id: room.id, floorId: floor.id };
      if (!roomHasPassage(room, openings))
        out.push(
          makeIssue("room-no-door", `${room.name} has no door.`, {
            severity: "warning",
            source,
            floorIds,
            fixes: [{ kind: "add-door", floorId: floor.id, roomId: room.id }],
          }),
        );
      if (
        WINDOW_KINDS.has(room.kind) &&
        !openings.some((o) => isWindow(o.kind) && openingSide(o, room.bounds))
      ) {
        const outside = segments.some(
          (w) => w.exterior && touches(w, room.bounds),
        );
        out.push(
          makeIssue(
            "room-no-window",
            outside
              ? `${room.name} has no window.`
              : `${room.name} has no window and no outside wall for one.`,
            {
              severity: "warning",
              source,
              floorIds,
              fixes: outside
                ? [{ kind: "add-window", floorId: floor.id, roomId: room.id }]
                : [{ kind: "edit", target: source, focus: "move" }],
            },
          ),
        );
      }
    }
    if (floor.elevation > 0) {
      const fp = floor.footprint;
      const onBalcony = (o: (typeof openings)[number]) =>
        floor.balconies.some((b) => {
          const r = balconyBounds(floor, b);
          const [start, span, line] =
            b.edge === "north" || b.edge === "south"
              ? [r.x, r.w, b.edge === "north" ? fp.z : fp.z + fp.d]
              : [r.z, r.d, b.edge === "west" ? fp.x : fp.x + fp.w];
          return (
            o.axis === (b.edge === "north" || b.edge === "south" ? "x" : "z") &&
            o.line === line &&
            o.center - o.width / 2 >= start &&
            o.center + o.width / 2 <= start + span
          );
        });
      for (const o of openings) {
        if (!isPassable(o.kind)) continue;
        const wall = segmentAt(segments, o.axis, o.line, o.center);
        if (!wall?.exterior || onBalcony(o)) continue;
        const target: ComponentRef = { kind: "opening", id: o.id, floorId: floor.id };
        out.push(
          makeIssue(
            "door-to-drop",
            `A door on ${floor.name} opens onto a drop. Add a balcony or move the door.`,
            {
              severity: "warning",
              source: target,
              floorIds,
              fixes: [{ kind: "edit", target, focus: "move" }],
            },
          ),
        );
      }
    }
    if (floor.rooms.some((r) => r.furniture?.length)) {
      const walls = deriveWalls(geo, project.plot.road);
      for (const room of floor.rooms)
        for (const item of furnitureDoorConflicts(room, walls)) {
          const target: ComponentRef = {
            kind: "furniture",
            id: item.id,
            floorId: floor.id,
            roomId: room.id,
          };
          out.push(
            makeIssue(
              "furniture-blocks-door",
              `${furnitureLabel(item)} blocks a doorway in ${room.name}.`,
              {
                severity: "warning",
                source: target,
                floorIds,
                fixes: [{ kind: "edit", target, focus: "move" }],
              },
            ),
          );
        }
    }
  }
  return out;
}

export type HomeCheck = {
  id: string;
  label: string;
  done: boolean;
  /** A one-tap fix for the first thing still missing, when there is one. */
  fix?: IssueFix;
};
/** Shops and markets skip the household essentials (kitchen, bathroom, bedroom windows). */
export function isCommercialOnly(project: Project): boolean {
  const rooms = project.floors.flatMap((f) => f.rooms);
  return (
    rooms.some((r) => r.kind === "shop") &&
    rooms.every((r) => r.kind === "shop" || r.kind === "utility" || r.kind === "bathroom")
  );
}
/**
 * The Home checklist: essentials every home needs, then quests that invite
 * the player to make it their own. Derived from project data only.
 */
export function homeChecks(project: Project): {
  essentials: HomeCheck[];
  quests: HomeCheck[];
} {
  const advice = projectAdvisories(project);
  const first = (code: string, keep?: (issue: EditIssue) => boolean) =>
    advice.find((i) => i.code === code && (!keep || keep(i)));
  const rooms = project.floors.flatMap((f) => f.rooms);
  const kindOf = new Map(rooms.map((r) => [r.id, r.kind]));
  const commercial = isCommercialOnly(project);
  const check = (
    id: string,
    label: string,
    done: boolean,
    issue?: EditIssue,
  ): HomeCheck => ({
    id,
    label,
    done,
    ...(!done && issue?.fixes[0] ? { fix: issue.fixes[0] } : {}),
  });
  const noDoor = first("room-no-door");
  const noWindow = first(
    "room-no-window",
    (i) => kindOf.get(i.source?.id ?? "") === "bedroom",
  );
  const ids = project.floors.map((f) => f.id);
  const stairs = ids.every(
    (id, i) =>
      i === 0 ||
      project.verticalSpaces.some(
        (v) => v.kind === "stairs" && v.floorIds.includes(ids[i - 1]) && v.floorIds.includes(id),
      ),
  );
  const essentials: HomeCheck[] = [
    check("doors", "Every room has a door", !noDoor, noDoor),
    ...(commercial
      ? []
      : [check("windows", "Every bedroom has a window", !noWindow, noWindow)]),
    check("stairs", "Stairs connect every floor", stairs),
    ...(commercial
      ? []
      : [
          check("kitchen", "There’s a kitchen", rooms.some((r) => r.kind === "kitchen")),
          check("bathroom", "There’s a bathroom", rooms.some((r) => r.kind === "bathroom")),
        ]),
    check("tray", "No rooms waiting in the tray", !project.stagedRooms?.length),
  ];
  const allRooms = [...rooms, ...(project.stagedRooms ?? []).map((s) => s.room)];
  const quests: HomeCheck[] = [
    check("furnish", "Furnish a room your way", allRooms.some((r) => !!r.furniture?.length)),
    check("paint", "Paint a wall", allRooms.some((r) => r.wallColor !== undefined)),
    check("roof", "Choose a roof", project.style?.roof !== undefined),
    check(
      "garden",
      "Plant a tree",
      !!project.landscape?.some((l) => l.kind.startsWith("tree-")),
    ),
  ];
  return { essentials, quests };
}
