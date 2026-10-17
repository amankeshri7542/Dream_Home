// The compass (pure). Plan "up" is −z; `plot.north` is how far true north is
// turned clockwise from plan-up. Until the homeowner says which way their home
// faces (`plot.compass`), north is only a guess, so sides are named from the
// road (Front, Back, Left, Right) rather than North or East.
import { mainDoor } from "./entrance";
import type { EdgeSide, Project, Room } from "./types";

export type Compass8 = "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";
export const COMPASS8: readonly Compass8[] = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const COMPASS_ANGLE: Record<Compass8, number> = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
};
export const COMPASS_LABEL: Record<Compass8, string> = {
  north: "North",
  northeast: "North-east",
  east: "East",
  southeast: "South-east",
  south: "South",
  southwest: "South-west",
  west: "West",
  northwest: "North-west",
};
export const COMPASS_SHORT: Record<Compass8, string> = {
  north: "N",
  northeast: "NE",
  east: "E",
  southeast: "SE",
  south: "S",
  southwest: "SW",
  west: "W",
  northwest: "NW",
};
/** A ninth of the footprint: the eight directions and the middle. */
export type Zone = Compass8 | "centre";

/** Plan bearing of each plot edge, clockwise from plan-up. */
export const EDGE_BEARING: Record<EdgeSide, number> = { north: 0, east: 90, south: 180, west: 270 };

export const wrapDegrees = (deg: number) => ((deg % 360) + 360) % 360;
type Plot = Pick<Project["plot"], "north" | "road" | "compass">;

/** The true compass bearing of a direction on the plan. */
export const trueBearing = (plot: Pick<Plot, "north">, planBearing: number) => wrapDegrees(planBearing - plot.north);
export const nearestCompass = (bearing: number): Compass8 => COMPASS8[Math.round(wrapDegrees(bearing) / 45) % 8];

/** Which way the home faces on the plan: its main door's outward side, else the road's. */
export function facingPlanBearing(project: Project): number {
  const door = mainDoor(project);
  if (door) return door.axis === "x" ? (door.out > 0 ? 180 : 0) : door.out > 0 ? 90 : 270;
  return EDGE_BEARING[project.plot.road];
}
/** The `plot.north` that makes the home face `facing`. */
export const northForFacing = (project: Project, facing: Compass8) => wrapDegrees(facingPlanBearing(project) - COMPASS_ANGLE[facing]);
/** Which way the home faces, once the homeowner has said (else null). */
export function homeFacing(project: Project): Compass8 | null {
  return project.plot.compass ? nearestCompass(trueBearing(project.plot, facingPlanBearing(project))) : null;
}

/**
 * A plan side's name: its true direction once the homeowner has set the
 * compass ("North-east"), else where it is from the road ("Front", "Left").
 */
export function sideName(plot: Plot, side: EdgeSide): string {
  if (plot.compass) return COMPASS_LABEL[nearestCompass(trueBearing(plot, EDGE_BEARING[side]))];
  const rel = wrapDegrees(EDGE_BEARING[side] - EDGE_BEARING[plot.road]);
  // Standing on the road, looking at the house.
  return rel === 0 ? "Front" : rel === 180 ? "Back" : rel === 90 ? "Left" : "Right";
}

/** A room's compass bearing from its floor's centre (0 = north), and how far out it sits (0–1). */
export function roomBearing(p: Project, floorId: string, room: Room): { angle: number; reach: number } {
  const fp = p.floors.find((f) => f.id === floorId)!.footprint;
  return pointBearing(p, fp, room.bounds.x + room.bounds.w / 2, room.bounds.z + room.bounds.d / 2);
}
/** The same for any plan point (cm), measured from a footprint's centre. */
export function pointBearing(p: Pick<Project, "plot">, fp: Room["bounds"], x: number, z: number): { angle: number; reach: number } {
  const u = (x - (fp.x + fp.w / 2)) / (fp.w / 2);
  const v = (z - (fp.z + fp.d / 2)) / (fp.d / 2);
  const t = (p.plot.north * Math.PI) / 180;
  // Plan +x/+z → true north/east components (plan north is −z when north = 0).
  const northness = u * Math.sin(t) - v * Math.cos(t);
  const eastness = u * Math.cos(t) + v * Math.sin(t);
  const angle = wrapDegrees((Math.atan2(eastness, northness) * 180) / Math.PI);
  return { angle, reach: Math.min(1, Math.hypot(northness, eastness)) };
}
const zoneOf = ({ angle, reach }: { angle: number; reach: number }): Zone => (reach < 0.3 ? "centre" : nearestCompass(angle));
/** Which ninth of its floor a room sits in. */
export const roomZone = (p: Project, floorId: string, room: Room): Zone => zoneOf(roomBearing(p, floorId, room));
export const pointZone = (p: Pick<Project, "plot">, fp: Room["bounds"], x: number, z: number): Zone => zoneOf(pointBearing(p, fp, x, z));
