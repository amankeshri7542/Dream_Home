// The real-look bench (`npm run bench:look`, eval/look/README.md): one fixed
// home through ten fixed shots at phone settings, so each run can be compared
// with the last. Dev-only, like the rest of the lab. Pure: shots are worked out
// from the home, so they follow it when the home's layout changes.
import { floorForGeometry } from "../../domain/core";
import { mainDoor } from "../../domain/entrance";
import { deriveWalls, isWindow, wallStart } from "../../domain/walls";
import type { Floor, Project, Room } from "../../domain/types";
import { DEFAULT_VIEW } from "../../editor/state";
import type { Framing, MoodId } from "../../photo/settings";
import { REEL_FOV } from "../../reel/settings";
import { reelPath, shotCamera } from "../../reel/path";
import { floorBase } from "../coords";
import { ROAD_BAND, roadFrame } from "../props/site";
import type { SceneView } from "../types";
import type { Vec3 } from "../camera/fit";

export type BenchShot = {
  id: string;
  /** What to judge it on, for the critic. */
  label: string;
  group: "eye" | "street" | "aerial" | "night" | "reel";
  hour: number;
  mood: MoodId;
  /** Width ÷ height. */
  aspect: number;
  samples: number;
  framing: Framing;
  view: SceneView;
  /** Eye level: walk to this spot and look this way. */
  walk?: { floorId: string; start: { x: number; z: number }; yaw: number };
  /** An exact camera, in world metres. */
  camera?: { position: Vec3; target: Vec3; fov: number };
};

/** As a phone makes them (docs/ROADMAP-V5.md, M2). */
export const BENCH_PHOTO = { longEdge: 1600, samples: 16, shadowSize: 2048 } as const;
const POST = 4 / 5;
const EYE_M = 1.6;
const STREET_FOV = 62;
/** Standing this far from the walls in a room's corner, in cm. */
const CORNER_INSET = 45;
const WINDOW_BACK = 140;

const inside = (view: Partial<SceneView> & { walkFloorId: string }): SceneView => ({
  ...DEFAULT_VIEW,
  world: true,
  floor: "all",
  stage: 5,
  roof: true,
  cutaway: false,
  labels: false,
  walls: true,
  furnishings: true,
  streetLife: false,
  livedIn: true,
  ...view,
});
const outside: SceneView = { ...DEFAULT_VIEW, world: true, floor: "all", stage: 5, roof: true, cutaway: false, labels: false, walls: true, streetLife: false, livedIn: true };

const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/**
 * The way a photographer shoots a room: from a corner, across to the opposite
 * one. Corners go clockwise from the north-west, and each shot's was chosen by
 * eye for this fixed home, so the bench judges the room and not a bad angle.
 */
export function acrossRoom(floor: Floor, room: Room, corner: number) {
  const b = room.bounds;
  const corners = [
    { x: b.x + CORNER_INSET, z: b.z + CORNER_INSET },
    { x: b.x + b.w - CORNER_INSET, z: b.z + CORNER_INSET },
    { x: b.x + b.w - CORNER_INSET, z: b.z + b.d - CORNER_INSET },
    { x: b.x + CORNER_INSET, z: b.z + b.d - CORNER_INSET },
  ];
  const start = corners[corner % corners.length];
  const opposite = { x: 2 * (b.x + b.w / 2) - start.x, z: 2 * (b.z + b.d / 2) - start.z };
  return { floorId: floor.id, start, yaw: yawTo(start, opposite) };
}

/** A room's widest window on an outside wall: standing back from it, looking out. */
function lookingOut(project: Project, floor: Floor, room: Room) {
  const b = room.bounds;
  const windows = deriveWalls(floorForGeometry(project, floor.id), project.plot.road)
    .filter((w) => w.exterior)
    .flatMap((w) =>
      w.openings
        .filter((o) => isWindow(o.kind))
        .map((o) => {
          const along = wallStart(w) + o.offset;
          return { width: o.width, at: w.axis === "x" ? { x: along, z: w.z } : { x: w.x, z: along } };
        })
        .filter(({ at }) => at.x >= b.x - 1 && at.x <= b.x + b.w + 1 && at.z >= b.z - 1 && at.z <= b.z + b.d + 1),
    )
    .sort((p, q) => q.width - p.width);
  const win = windows[0]?.at;
  if (!win) return null;
  const middle = { x: b.x + b.w / 2, z: b.z + b.d / 2 };
  // Straight back from the wall, not towards the room's middle.
  const onX = Math.abs(win.z - b.z) < 2 || Math.abs(win.z - b.z - b.d) < 2;
  const start = onX ? { x: win.x, z: win.z + Math.sign(middle.z - win.z) * WINDOW_BACK } : { x: win.x + Math.sign(middle.x - win.x) * WINDOW_BACK, z: win.z };
  return { floorId: floor.id, start, yaw: yawTo(start, win) };
}

const area = (r: Room) => r.bounds.w * r.bounds.d;

/** The ten shots for a home. */
export function benchShots(project: Project): BenchShot[] {
  const rooms = project.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room })));
  const biggest = (kind: Room["kind"]) => rooms.filter((p) => p.room.kind === kind).sort((a, b) => area(b.room) - area(a.room))[0];
  const living = biggest("living") ?? biggest("dining") ?? rooms[0];
  const eye = (id: string, label: string, pick: { floor: Floor; room: Room } | undefined, corner: number, hour: number, mood: MoodId, group: BenchShot["group"] = "eye"): BenchShot[] =>
    pick
      ? [
          {
            id,
            label,
            group,
            hour,
            mood,
            aspect: POST,
            samples: BENCH_PHOTO.samples,
            framing: "view",
            view: inside({ walkFloorId: pick.floor.id }),
            walk: acrossRoom(pick.floor, pick.room, corner),
          },
        ]
      : [];

  const out = lookingOut(project, living.floor, living.room);
  const windowShot: BenchShot[] = out
    ? [
        {
          id: "05-eye-window",
          label: "Eye level, looking out of the living room window, morning. Judge what's outside.",
          group: "eye",
          hour: 8.5,
          mood: "morning",
          aspect: POST,
          samples: BENCH_PHOTO.samples,
          framing: "view",
          view: inside({ walkFloorId: living.floor.id }),
          walk: out,
        },
      ]
    : [];

  // From the street: world metres, centred on the plot.
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  const door = mainDoor(project);
  const y = floorBase(ground) + EYE_M;
  const frame = roadFrame(project);
  const world = (x: number, z: number, height = y): Vec3 => [x - project.plot.width / 200, height, z - project.plot.depth / 200];
  const doorAt = door ? (door.axis === "x" ? [door.along / 100, door.line / 100] : [door.line / 100, door.along / 100]) : [project.plot.width / 200, project.plot.depth / 200];
  const along = frame.horizontal ? doorAt[0] : doorAt[1];
  const street = (id: string, label: string, out: number, lookHeight: number, hour: number, mood: MoodId): BenchShot => {
    const [sx, sz] = frame.toPlot(along, out);
    return {
      id,
      label,
      group: "street",
      hour,
      mood,
      aspect: POST,
      samples: BENCH_PHOTO.samples,
      framing: "view",
      view: outside,
      camera: { position: world(sx, sz), target: world(doorAt[0], doorAt[1], floorBase(ground) + lookHeight), fov: STREET_FOV },
    };
  };

  const reel = reelPath(project, { aspect: 9 / 16, style: "grand", mood: "golden", livedIn: true }).shots.find((s) => s.kind === "room");
  const reelShot: BenchShot[] = reel
    ? [
        {
          id: "10-reel-room",
          label: "A frame of the reel's first room, as filmed: 9:16, few samples.",
          group: "reel",
          hour: reel.hour,
          mood: reel.finish,
          aspect: 9 / 16,
          samples: 3,
          framing: "view",
          view: reel.view,
          camera: { ...shotCamera(reel, 0.5), fov: REEL_FOV },
        },
      ]
    : [];

  return [
    ...eye("01-eye-living", "Eye level, across the living room, golden hour.", living, 1, 17.25, "golden"),
    ...eye("02-eye-bedroom", "Eye level, across the main bedroom, morning.", biggest("bedroom"), 1, 8.5, "morning"),
    ...eye("03-eye-kitchen", "Eye level, across the kitchen, noon.", biggest("kitchen"), 3, 12.5, "noon"),
    ...eye("04-eye-bathroom", "Eye level, across the bathroom, morning.", biggest("bathroom"), 3, 8.5, "morning"),
    ...windowShot,
    street("06-street-front", "From across the road at eye height, golden hour. Judge the home in its street.", ROAD_BAND - 0.4, 2.6, 17.25, "golden"),
    street("07-street-gate", "From just inside the gate at eye height, morning. Judge the arrival.", -0.6, 2, 8.5, "morning"),
    {
      id: "08-aerial",
      label: "The whole home from above, opened up, golden hour. Judge it as an architect's model.",
      group: "aerial",
      hour: 17.25,
      mood: "golden",
      aspect: POST,
      samples: BENCH_PHOTO.samples,
      framing: "aerial",
      view: { ...DEFAULT_VIEW, floor: "all", labels: false, streetLife: false, livedIn: true },
    },
    ...eye("09-night-living", "Eye level, across the living room, at night. Judge the lamps.", living, 1, 21.5, "night", "night"),
    ...reelShot,
  ];
}
