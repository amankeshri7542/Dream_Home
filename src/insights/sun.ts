// How much direct sun each room gets through its windows (pure). For every
// window on an outside wall, every half hour from 6 am to 7 pm, the sun counts
// when it is more than 5° up and in front of the window. Walls and neighbours
// that shade it are left out; the live shadows show those.
import { COMPASS_LABEL, nearestCompass, trueBearing, type Compass8 } from "../domain/compass";
import { floorForGeometry } from "../domain/core";
import { resolveFurniture, roomWalls } from "../domain/furniture";
import { styleDetails } from "../domain/materials";
import type { PlotLocation, Project, Room, RoomKind, Wall } from "../domain/types";
import { deriveWalls, isWindow, touches, wallLine } from "../domain/walls";
import { clockLabel, sunAt, type CalendarDate } from "./solar";

export const SLOT = 0.5;
/** The half hours looked at: 6:00, 6:30 … 18:30 (each counts until the next). */
export const SLOTS = Array.from({ length: 26 }, (_, i) => 6 + i * SLOT);
const MIN_ELEVATION = 5;
const MIN_FACING = 0.15;

export type RoomSun = {
  floorId: string;
  roomId: string;
  name: string;
  kind: RoomKind;
  /** Windows on outside walls. */
  windows: number;
  /** The start of each sunny half hour (6, 6.5 … 18.5). */
  slots: number[];
  hours: number;
  /** Which ways the windows that catch the sun face. */
  sunnyFaces: Compass8[];
  /** Hours of sun after 2 pm through windows facing south-west to north-west. */
  hotAfternoon: number;
  /** Where that hot sun comes from (when it's 1½ hours or more). */
  hotFace: Compass8 | null;
  phrase: string;
};

/** Each window on a room's outside walls and the true direction it faces. */
export function roomWindows(project: Project, floorId: string, room: Room, walls = floorWalls(project, floorId)): number[] {
  const b = room.bounds;
  const out: number[] = [];
  for (const w of walls) {
    if (!w.exterior || !touches(w, b)) continue;
    const line = wallLine(w);
    // Outward: the side of the wall away from the room.
    const plan = w.axis === "x" ? (line === b.z ? 0 : 180) : line === b.x ? 270 : 90;
    for (const o of w.openings) if (isWindow(o.kind)) out.push(trueBearing(project.plot, plan));
  }
  return out;
}

const floorWalls = (project: Project, floorId: string): Wall[] => deriveWalls(floorForGeometry(project, floorId), project.plot.road);

const range = (start: number, end: number) => {
  const noon = (h: number) => (Math.abs(h - 12) < 1e-6 ? "noon" : clockLabel(h));
  const a = noon(start),
    b = noon(end);
  // "7–10 am", "11 am–2 pm": the am/pm once when both ends share it.
  const [na, sa] = a.split(" "),
    [nb, sb] = b.split(" ");
  return sa === sb ? `${na}–${nb} ${sb}` : `${a}–${b}`;
};

/** Runs of consecutive sunny half hours, as [start, end) clock hours. */
export function sunnyRuns(slots: number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const s of [...slots].sort((x, y) => x - y)) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[1] - s) < 1e-6) last[1] = s + SLOT;
    else runs.push([s, s + SLOT]);
  }
  return runs;
}

/** "Morning sun 7–10 am", "Hot afternoon sun 2–5:30 pm (west)", "No direct sun". */
export function sunPhrase(slots: number[], hotFace: Compass8 | null): string {
  if (!slots.length) return "No direct sun";
  if (slots.length * SLOT >= 8) return "Sun most of the day";
  return sunnyRuns(slots)
    .slice(0, 2)
    .map(([start, end]) => {
      if (start >= 12) {
        const hot = hotFace && end >= 15;
        return `${hot ? "Hot afternoon" : "Afternoon"} sun ${range(start, end)}${hot ? ` (${COMPASS_LABEL[hotFace].toLowerCase()})` : ""}`;
      }
      if (end <= 13) return `Morning sun ${range(start, end)}`;
      return `Sun ${range(start, end)}`;
    })
    .join(" · ");
}

const westerly = (bearing: number) => bearing > 202.5 && bearing < 337.5;

/** Direct sun for every room on a floor, on one day at one place. */
export function sunHours(project: Project, floorId: string, location: Pick<PlotLocation, "lat" | "lon">, date: CalendarDate): RoomSun[] {
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const sky = SLOTS.map((t) => sunAt(location, date, t + SLOT / 2));
  const walls = floorWalls(project, floorId);
  return floor.rooms.map((room) => {
    const windows = roomWindows(project, floorId, room, walls);
    const slots: number[] = [];
    const sunnyFaces = new Set<Compass8>();
    let hot = 0;
    const hotFaces = new Map<Compass8, number>();
    SLOTS.forEach((t, i) => {
      const sun = sky[i];
      if (sun.elevation <= MIN_ELEVATION) return;
      const lit = windows.filter((n) => Math.cos((sun.elevation * Math.PI) / 180) * Math.cos(((sun.bearing - n) * Math.PI) / 180) > MIN_FACING);
      if (!lit.length) return;
      slots.push(t);
      lit.forEach((n) => sunnyFaces.add(nearestCompass(n)));
      const warm = lit.filter(westerly);
      if (t >= 14 && warm.length) {
        hot += SLOT;
        warm.forEach((n) => hotFaces.set(nearestCompass(n), (hotFaces.get(nearestCompass(n)) ?? 0) + 1));
      }
    });
    const hotFace = hot >= 1.5 ? [...hotFaces].sort((a, b) => b[1] - a[1])[0][0] : null;
    return {
      floorId,
      roomId: room.id,
      name: room.name,
      kind: room.kind,
      windows: windows.length,
      slots,
      hours: slots.length * SLOT,
      sunnyFaces: [...sunnyFaces],
      hotAfternoon: hot,
      hotFace,
      phrase: sunPhrase(slots, hotFace),
    };
  });
}

export type SunFix = { kind: "curtains"; floorId: string; roomId: string } | { kind: "chhajja" };
export type SunTip = { floorId: string; roomId: string; text: string; fix?: SunFix };

const LIVING_KINDS = new Set<RoomKind>(["bedroom", "living"]);

/**
 * Friendly tips for bedrooms and living rooms: hot afternoon sun (curtains or
 * sunshades help, one tap each) and rooms with no direct sun at all.
 */
export function sunTips(project: Project, rooms: RoomSun[]): SunTip[] {
  const tips: SunTip[] = [];
  const shaded = styleDetails(project).chhajja;
  for (const r of rooms) {
    if (!LIVING_KINDS.has(r.kind)) continue;
    if (r.hotFace) {
      const face = r.hotFace;
      const room = project.floors.find((f) => f.id === r.floorId)?.rooms.find((x) => x.id === r.roomId);
      const curtains = !!room && resolveFurniture(room, roomWalls(project, r.floorId)).some((i) => i.catalogId === "curtains");
      const fix: SunFix | undefined = !curtains ? { kind: "curtains", floorId: r.floorId, roomId: r.roomId } : !shaded ? { kind: "chhajja" } : undefined;
      tips.push({
        floorId: r.floorId,
        roomId: r.roomId,
        text: `${r.name} gets hot afternoon sun from the ${COMPASS_LABEL[face].toLowerCase()}. Curtains or a chhajja help.`,
        ...(fix ? { fix } : {}),
      });
    } else if (r.kind === "bedroom" && !r.slots.length)
      tips.push({
        floorId: r.floorId,
        roomId: r.roomId,
        text: r.windows
          ? `${r.name} gets no direct sun. A window facing east would bring soft morning light.`
          : `${r.name} has no window to the outside, so no sunlight.`,
      });
  }
  return tips;
}

/** True when every bedroom and living room gets some direct sun. */
export const everyRoomSunny = (rooms: RoomSun[]) =>
  rooms.filter((r) => LIVING_KINDS.has(r.kind)).every((r) => r.hours >= SLOT);
