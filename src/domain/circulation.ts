// Can every room actually be walked to? Project-level checks built on the
// floor grid: rooms nobody can reach from the front door (or the stairs), and
// doors that open onto a wall or a gap too narrow to walk through.
import { floorForGeometry } from "./core";
import { floorGrid, reachableNodes, sideOf } from "./circulationGrid";
import type { PlacedOpening, Project } from "./types";
import { deriveWallSegments, isPassable, resolveFloorOpenings } from "./walls";

export type BlockedDoor = {
  floorId: string;
  opening: PlacedOpening & { auto: boolean };
  /** The room(s) whose door it is. */
  roomIds: string[];
};
export type FloorCirculation = {
  /** Rooms with no walkable way in from the entrance or stairs. */
  unreachable: string[];
  blockedDoors: BlockedDoor[];
};

/** Circulation for one floor (rooms in no-way-in floors are not reported). */
export function floorCirculation(project: Project, floorId: string): FloorCirculation {
  const geo = floorForGeometry(project, floorId);
  const grid = floorGrid(geo);
  const openings = resolveFloorOpenings(geo, project.plot.road, deriveWallSegments(geo));
  const blockedDoors: BlockedDoor[] = [];
  for (const o of openings) {
    if (!isPassable(o.kind)) continue;
    const plus = sideOf(grid, o, 1),
      minus = sideOf(grid, o, -1);
    const roomIds = [plus, minus].flatMap((s) => (s.kind === "room" ? [geo.rooms[s.room].id] : []));
    // A door into a garden or balcony is fine; one onto a wall or a sliver is not.
    if (plus.kind === "blocked" || minus.kind === "blocked")
      blockedDoors.push({ floorId, opening: o, roomIds: roomIds.length ? roomIds : touchingRooms(geo.rooms, o) });
  }
  const reached = reachableNodes(geo, grid, openings);
  const unreachable = reached
    ? geo.rooms.filter((_, k) => !reached.has(`r${k}`)).map((r) => r.id)
    : [];
  return { unreachable, blockedDoors };
}

/** Rooms whose edge an opening sits on (for doors with a blocked room side). */
function touchingRooms(rooms: Project["floors"][number]["rooms"], o: PlacedOpening): string[] {
  return rooms
    .filter((r) => {
      const b = r.bounds;
      return o.axis === "x"
        ? (o.line === b.z || o.line === b.z + b.d) && o.center > b.x && o.center < b.x + b.w
        : (o.line === b.x || o.line === b.x + b.w) && o.center > b.z && o.center < b.z + b.d;
    })
    .map((r) => r.id);
}

/** Every floor's circulation problems. */
export function projectCirculation(project: Project) {
  const unreachable: { floorId: string; roomId: string }[] = [];
  const blockedDoors: BlockedDoor[] = [];
  for (const floor of project.floors) {
    const c = floorCirculation(project, floor.id);
    c.unreachable.forEach((roomId) => unreachable.push({ floorId: floor.id, roomId }));
    blockedDoors.push(...c.blockedDoors);
  }
  return { unreachable, blockedDoors };
}
