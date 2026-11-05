// A home's floor and the hour → what the room-light solver needs (pure).
import { floorForGeometry } from "../../domain/core";
import { furnitureBaseY, furnitureCatalogItem, resolveFurniture } from "../../domain/furniture";
import { CEILING_FINISHES, FLOOR_MATERIALS, roomCeiling, roomFloorMaterial, stylePreset } from "../../domain/materials";
import { COVE_COLOUR, falseCeilings } from "../building/geometry/ceiling";
import type { Project, Room } from "../../domain/types";
import { deriveWalls, isWindow, wallStart } from "../../domain/walls";
import { rgb } from "../building/geometry/QuadBuilder";
import { facePaint } from "../building/geometry/walls";
import { FLOOR_SURFACE, floorBase, plotOffset } from "../coords";
import type { Lighting } from "../environment/timeOfDay";
import { kelvinRgb, lightTemperature } from "../../insights/warmth";
import type { LightGridSpec, LightLamp, LightOpening, LightRoom, LightSky, RGB, V3 } from "./solve";

/** Inner face from a wall's centreline (a wall's half-thickness, near enough). */
const INSET = 0.075;
/** The underside of the slab above (see WalkCeiling). */
const CEILING_DROP = 0.18;
const CELL = 0.22;
const CELL_Y = 0.42;

/** Ceiling tube light for rooms with no lamp of their own. */
const TUBE: RGB = rgb("#fff1d8");
const DOWNLIGHT: RGB = rgb("#ffe6c4");
const COVE: RGB = rgb(COVE_COLOUR);

/** The floor's rooms in world metres, with every opening and lamp that lights them. */
export function lightRooms(project: Project, floorId: string, lampsOn: boolean): { rooms: LightRoom[]; spec: LightGridSpec } {
  const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
  const geo = floorForGeometry(project, floor.id);
  const walls = deriveWalls(geo, project.plot.road);
  const look = stylePreset(project);
  const [ox, , oz] = plotOffset(project);
  const y0 = floorBase(floor) + FLOOR_SURFACE;
  const y1 = floorBase(floor) + floor.height / 100 - CEILING_DROP;
  const baseY = floorBase(floor);
  // False ceilings light their rooms with downlights and the cove instead of a tube light.
  const falses = new Map(falseCeilings(project, floor.id).map((c) => [c.roomId, c]));
  const rooms: LightRoom[] = geo.rooms.map((room) => {
    const b = room.bounds;
    const min: V3 = [b.x / 100 + ox + INSET, y0, b.z / 100 + oz + INSET],
      max: V3 = [(b.x + b.w) / 100 + ox - INSET, y1, (b.z + b.d) / 100 + oz - INSET];
    const paint = (axis: number, side: number, plane: number) => rgb(facePaint(geo, room.id, axis, side, plane, look));
    const openings: LightOpening[] = [];
    for (const wall of walls) {
      const line = wall.axis === "x" ? wall.z : wall.x;
      const onZMin = wall.axis === "x" && Math.abs(line - b.z) < 2,
        onZMax = wall.axis === "x" && Math.abs(line - (b.z + b.d)) < 2,
        onXMin = wall.axis === "z" && Math.abs(line - b.x) < 2,
        onXMax = wall.axis === "z" && Math.abs(line - (b.x + b.w)) < 2;
      if (!onZMin && !onZMax && !onXMin && !onXMax) continue;
      for (const o of wall.openings) {
        const centre = wallStart(wall) + o.offset;
        const [lo, hi] = wall.axis === "x" ? [b.x, b.x + b.w] : [b.z, b.z + b.d];
        if (centre < lo - 1 || centre > hi + 1) continue;
        const a0 = Math.max(lo, centre - o.width / 2) / 100,
          a1 = Math.min(hi, centre + o.width / 2) / 100;
        if (a1 - a0 < 0.1) continue;
        const openY0 = baseY + o.sill / 100,
          openY1 = Math.min(y1, baseY + (o.sill + o.height) / 100);
        const p: V3 =
          wall.axis === "x"
            ? [a0 + ox, openY0, onZMin ? min[2] : max[2]]
            : [onXMin ? min[0] : max[0], openY0, a0 + oz];
        const u: V3 = wall.axis === "x" ? [a1 - a0, 0, 0] : [0, 0, a1 - a0];
        const v: V3 = [0, openY1 - openY0, 0];
        const inward: V3 = onZMin ? [0, 0, 1] : onZMax ? [0, 0, -1] : onXMin ? [1, 0, 0] : [-1, 0, 0];
        if (wall.exterior) {
          openings.push({ p, u, v, inward, kind: isWindow(o.kind) ? "window" : "door-out" });
          continue;
        }
        // Inside the home: a door or internal window leads to the room over the wall.
        const next = centre / 100;
        const other = geo.rooms.find((r: Room) => {
          if (r.id === room.id) return false;
          const q = r.bounds;
          if (wall.axis === "x") return (Math.abs(q.z - line) < 2 || Math.abs(q.z + q.d - line) < 2) && next * 100 >= q.x - 1 && next * 100 <= q.x + q.w + 1;
          return (Math.abs(q.x - line) < 2 || Math.abs(q.x + q.w - line) < 2) && next * 100 >= q.z - 1 && next * 100 <= q.z + q.d + 1;
        });
        if (other) openings.push({ p, u, v, inward, kind: "portal", to: other.id });
      }
    }
    const lamps: LightLamp[] = [];
    if (lampsOn) {
      const items = resolveFurniture(room, walls);
      for (const item of items) {
        const light = furnitureCatalogItem(item.catalogId)?.light;
        if (!light) continue;
        lamps.push({
          position: [(b.x + item.x) / 100 + ox, y0 + (furnitureBaseY(item, items) + light.y) / 100, (b.z + item.z) / 100 + oz],
          color: rgb(light.color),
          intensity: light.intensity,
        });
      }
      const fc = falses.get(room.id);
      if (fc) {
        for (const d of fc.downlights) lamps.push({ position: [d[0] + ox, d[1] - 0.04, d[2] + oz], color: DOWNLIGHT, intensity: 0.1 });
        // The LED strip: a soft row of warm sources tucked under the lip.
        for (const run of fc.cove) {
          const len = Math.hypot(run.to[0] - run.from[0], run.to[2] - run.from[2]);
          const n = Math.max(1, Math.round(len / 0.9));
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            lamps.push({ position: [run.from[0] + (run.to[0] - run.from[0]) * t + ox, run.from[1] + 0.02, run.from[2] + (run.to[2] - run.from[2]) * t + oz], color: COVE, intensity: 0.045 });
          }
        }
      } else if (!lamps.length) {
        // Every Indian room has its tube light; it's the lamps that are optional.
        lamps.push({ position: [(min[0] + max[0]) / 2, y1 - 0.06, (min[2] + max[2]) / 2], color: TUBE, intensity: 0.9 });
      } else lamps.push({ position: [(min[0] + max[0]) / 2, y1 - 0.06, (min[2] + max[2]) / 2], color: TUBE, intensity: 0.28 });
    }
    return {
      id: room.id,
      min,
      max,
      walls: {
        xMin: paint(0, 1, b.x / 100),
        xMax: paint(0, -1, (b.x + b.w) / 100),
        zMin: paint(2, 1, b.z / 100),
        zMax: paint(2, -1, (b.z + b.d) / 100),
      },
      floor: rgb(FLOOR_MATERIALS[roomFloorMaterial(room, look)].color),
      ceiling: rgb(CEILING_FINISHES[roomCeiling(room, look)].color),
      openings,
      lamps,
    };
  });
  const f = floor.footprint;
  const pad = 0.5;
  const spec: LightGridSpec = {
    min: [f.x / 100 + ox - pad, y0 - CELL_Y, f.z / 100 + oz - pad],
    max: [(f.x + f.w) / 100 + ox + pad, y1 + CELL_Y, (f.z + f.d) / 100 + oz + pad],
    cell: CELL,
    cellY: CELL_Y,
  };
  return { rooms, spec };
}

/** The hour's light as seen from inside. */
export function lightSky(light: Lighting): LightSky {
  const p = light.palette;
  const dayness = 1 - light.night;
  // The sky through a window: much brighter than any wall, as any photographer knows.
  const k = 1.5 + 2.1 * dayness;
  // The light's colour temperature: cool in the morning, warm in the evening and under lamps.
  const kelvin = lightTemperature(light.hour, light.elevation, p.windowGlow);
  const t = kelvinRgb(kelvin);
  const tl = t[0] * 0.2126 + t[1] * 0.7152 + t[2] * 0.0722;
  const tint = (c: number, i: number) => c * (0.7 + (0.3 * t[i]) / tl);
  const sky: RGB = [tint(((p.horizon.r + p.zenith.r) / 2) * k, 0), tint(((p.horizon.g + p.zenith.g) / 2) * k, 1), tint(((p.horizon.b + p.zenith.b) / 2) * k, 2)];
  const sun = light.elevation > 1 && dayness > 0.02 ? { dir: light.sunDir as V3, irradiance: [p.sun.r * p.sunIntensity, p.sun.g * p.sunIntensity, p.sun.b * p.sunIntensity] as RGB } : null;
  // Sunlit ground outside bounces up through the window, warm, onto the ceiling.
  const up = sun ? Math.max(0, sun.dir[1]) : 0;
  const bounce = 0.28;
  const ground: RGB = [
    (p.ground.r * (sky[0] * 0.8 + ((sun?.irradiance[0] ?? 0) * up) / Math.PI) * bounce) / 0.6,
    (p.ground.g * (sky[1] * 0.8 + ((sun?.irradiance[1] ?? 0) * up) / Math.PI) * bounce) / 0.6,
    (p.ground.b * (sky[2] * 0.8 + ((sun?.irradiance[2] ?? 0) * up) / Math.PI) * bounce) / 0.6,
  ];
  return {
    sky,
    ground,
    sun,
    // A white wall reads about 0.75 by day, a touch lower in lamplight.
    target: 2.3 - 0.75 * Math.max(light.night, p.windowGlow),
    // Keep more of a warm light's colour than a neutral one's, as a photographer would.
    balance: 0.22 + 0.3 * Math.min(1, Math.max(0, (kelvin - 3000) / 2800)),
    kelvin,
  };
}
