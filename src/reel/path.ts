// The reel's shot list, pure and deterministic. For a home, a frame shape, a
// style and a mood it gives every shot's view, light and finish, and how the
// camera moves through it. Moves are kept in orbit terms (target, turn, tilt,
// distance) and eased, so turns stay round and push-ins feel steady.
import { mainDoor } from "../domain/entrance";
import type { Floor, Project, Room } from "../domain/types";
import { DEFAULT_VIEW } from "../editor/state";
import { aerialPose, frameBox, orbitPoint } from "../photo/framing";
import type { MoodId } from "../photo/settings";
import { nearestAngle, type Vec3 } from "../scene/camera/fit";
import { heroPose, homeBox, plotBox, roomBox, roomHeroPose, type Box, type Pose } from "../scene/camera/poses";
import { floorBase } from "../scene/coords";
import type { SceneView } from "../scene/types";
import { REEL_FOV, REEL_MOODS, REEL_STYLES, type ReelMood, type ReelStyle } from "./settings";

const DEG = Math.PI / 180;

export type Orbit = { target: Vec3; azimuth: number; polar: number; distance: number };
export type ShotKind = "establish" | "approach" | "reveal" | "room" | "night" | "end";
export type ReelShot = {
  kind: ShotKind;
  /** Shots with the same scene share a view and light: nothing changes between them. */
  scene: string;
  /** Seconds from the start of the reel. */
  start: number;
  duration: number;
  view: SceneView;
  hour: number;
  /** The photo finish (grade, glow, vignette) for this light. */
  finish: MoodId;
  /** Scales the lamp glow: a lamp a metre away would flood a close-up. */
  glow?: number;
  from: Orbit;
  to: Orbit;
  ease: "inOut" | "out";
  /** Seconds of crossfade from the previous shot's last frame. */
  fadeIn: number;
  room?: { floorId: string; roomId: string; name: string; floorName?: string };
  /** What the progress screen says while filming it. */
  status: string;
};
export type ReelPath = { seconds: number; shots: ReelShot[] };
export type ReelPathOptions = {
  /** Width ÷ height of the video. */
  aspect: number;
  style: ReelStyle;
  mood: ReelMood;
  livedIn: boolean;
  /** Overrides the style's length (all shots scale with it). */
  seconds?: number;
};

const POOJA = /prayer|pooja|puja|mandir/i;
type TourRoom = { floor: Floor; room: Room };

/**
 * The rooms the tour visits: the living room, kitchen, main bedroom and the
 * pooja room if there is one (the biggest of each kind). A quick reel shows
 * two: the living room and the main bedroom (else the kitchen).
 */
export function tourRooms(project: Project, style: ReelStyle): TourRoom[] {
  const all = project.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room })));
  const area = (p: TourRoom) => p.room.bounds.w * p.room.bounds.d;
  const biggest = (test: (r: Room) => boolean) =>
    all.filter((p) => test(p.room)).sort((a, b) => area(b) - area(a) || a.room.id.localeCompare(b.room.id))[0];
  const living = biggest((r) => r.kind === "living") ?? biggest((r) => r.kind === "dining");
  const kitchen = biggest((r) => r.kind === "kitchen");
  const bedroom = biggest((r) => r.kind === "bedroom");
  const pooja = biggest((r) => POOJA.test(r.name));
  const wanted = style === "grand" ? [living, kitchen, bedroom, pooja] : [living, bedroom, kitchen];
  const picks: TourRoom[] = [];
  for (const p of wanted) if (p && !picks.some((q) => q.room.id === p.room.id)) picks.push(p);
  return picks.slice(0, style === "grand" ? 4 : 2);
}

/** Relative lengths of the shots around the rooms (they share what the rooms leave). */
const WEIGHTS: Record<ReelStyle, Partial<Record<ShotKind, number>>> = {
  grand: { establish: 2.5, approach: 1.9, reveal: 1.9, night: 1.8, end: 2.4 },
  quick: { establish: 2.2, reveal: 1.6, end: 2.0 },
};
/** Seconds per room: 2 s each for a short tour, a little less for four rooms. */
const roomSeconds = (style: ReelStyle, count: number) => (style === "quick" ? 1.5 : [2, 2, 2, 1.8, 1.6][count]);
const CROSSFADE = 0.35;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Smoothstep from 0 at `a` to 1 at `b`. */
export const ramp = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};

function toOrbit({ position, target }: { position: Vec3; target: Vec3 }): Orbit {
  const dx = position[0] - target[0],
    dy = position[1] - target[1],
    dz = position[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  return { target, azimuth: Math.atan2(dx, dz), polar: Math.acos(Math.max(-1, Math.min(1, dy / distance))), distance };
}
const framed = (box: Box, pose: Pose, aspect: number, margin?: number) => toOrbit(frameBox(box, pose, REEL_FOV, aspect, 1, margin));
const further = (o: Orbit, k: number): Orbit => ({ ...o, distance: o.distance * k });

/** Where the camera is a fraction `u` (0–1) of the way through a shot. */
export function shotCamera(shot: Pick<ReelShot, "from" | "to" | "ease">, u: number): { position: Vec3; target: Vec3 } {
  const t = clamp01(u);
  const e = shot.ease === "out" ? 1 - (1 - t) ** 3 : 0.5 - 0.5 * Math.cos(Math.PI * t);
  const a = shot.from,
    b = shot.to;
  const target: Vec3 = [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e)];
  const azimuth = lerp(a.azimuth, nearestAngle(a.azimuth, b.azimuth), e);
  const polar = lerp(a.polar, b.polar, e);
  // Distances change by ratios (a push-in from 13 m to 5 m), so ease them in log space.
  const distance = Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), e));
  return { target, position: orbitPoint(target, azimuth, polar, distance) };
}

/** Is a point inside a box grown by `pad` metres? */
export const insideBox = (p: Vec3, box: Box, pad = 0) =>
  p.every((v, i) => v > box.min[i] - pad && v < box.max[i] + pad);

/** Moves both ends of a shot out until the camera never passes through the box. */
function keepClear<T extends Pick<ReelShot, "from" | "to" | "ease">>(shot: T, box: Box): T {
  let out = shot;
  for (let tries = 0; tries < 12; tries++) {
    let blocked = false;
    for (let i = 0; i <= 12 && !blocked; i++) blocked = insideBox(shotCamera(out, i / 12).position, box, 0.3);
    if (!blocked) return out;
    out = { ...out, from: further(out.from, 1.12), to: further(out.to, 1.12) };
  }
  return out;
}

/** The text "your living room" from a room's name (first letter lowered, unless it's an acronym). */
const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);

export function reelPath(project: Project, options: ReelPathOptions): ReelPath {
  const { aspect, style, mood } = options;
  const light = REEL_MOODS[mood];
  const festive = light.festive;
  const life = { livedIn: options.livedIn, festive };
  const outside: SceneView = { ...DEFAULT_VIEW, floor: "all", stage: 5, roof: true, cutaway: false, walls: true, labels: false, streetLife: true, ...life };
  const open: SceneView = { ...DEFAULT_VIEW, floor: "all", labels: false, streetLife: true, ...life };
  const night = mood === "night" || mood === "diwali" ? light : REEL_MOODS.night;
  const road = project.plot.road;
  const hero = heroPose(road);
  const aerial = aerialPose(road, aspect);
  const plot = plotBox(project, outside);
  const house = homeBox(project, outside);
  const opened = homeBox(project, open);
  const sceneKey = (name: string, hour: number) => `${name}@${hour}${festive ? ":diwali" : ""}`;

  type Draft = Omit<ReelShot, "start" | "duration" | "fadeIn"> & { weight?: number; seconds?: number };
  const drafts: Draft[] = [];
  const add = (shot: Draft, box: Box) => drafts.push(keepClear(shot, box));

  // 1. The establishing shot: an aerial turn from the road side; the title fades in.
  add(
    {
      kind: "establish",
      scene: sceneKey("outside", light.hour),
      view: outside,
      hour: light.hour,
      finish: light.finish,
      // A tall frame fits the plot's width with sky to spare: closer, the corners can go.
      from: further(framed(plot, { azimuth: aerial.azimuth - 14 * DEG, polar: aerial.polar + 5 * DEG }, aspect), 0.98),
      to: further(framed(plot, { azimuth: aerial.azimuth + 8 * DEG, polar: aerial.polar - 2 * DEG }, aspect), 0.88),
      ease: "inOut",
      status: "Filming the outside…",
      weight: WEIGHTS[style].establish,
    },
    house,
  );

  // 2. The approach (grand tour): from the street, a push-in to the front door.
  const door = style === "grand" ? mainDoor(project) : null;
  const ground = [...project.floors].sort((a, b) => a.elevation - b.elevation)[0];
  if (door && ground) {
    const [x, z] = door.axis === "x" ? [door.along, door.line] : [door.line, door.along];
    const at: Vec3 = [x / 100 - project.plot.width / 200, floorBase(ground) + 1.05, z / 100 - project.plot.depth / 200];
    const facing = door.axis === "x" ? (door.out > 0 ? 0 : Math.PI) : door.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    // Swing in from the side the aerial shot was on.
    const swing = Math.sign(Math.sin(hero.azimuth - facing)) || 1;
    add(
      {
        kind: "approach",
        scene: sceneKey("outside", light.hour),
        view: outside,
        hour: light.hour,
        finish: light.finish,
        from: { target: [at[0], at[1] + 0.4, at[2]], azimuth: facing + swing * 14 * DEG, polar: 72 * DEG, distance: 13 },
        to: { target: at, azimuth: facing, polar: 84 * DEG, distance: 5.5 },
        ease: "out",
        glow: 0.4,
        status: "Walking up to the front door…",
        weight: WEIGHTS[style].approach,
      },
      house,
    );
  }

  // 3. The dollhouse reveal: the roof is off; a swoop from straight above to the 3/4 view.
  add(
    {
      kind: "reveal",
      scene: sceneKey("open", light.hour),
      view: open,
      hour: light.hour,
      finish: light.finish,
      from: further(framed(opened, { azimuth: aerial.azimuth - 40 * DEG, polar: 7 * DEG }, aspect), 1.08),
      to: framed(opened, aerial, aspect),
      ease: "inOut",
      status: "Opening up your home…",
      weight: WEIGHTS[style].reveal,
    },
    opened,
  );

  // 4. The rooms: each the hero of the dollhouse, with a slow dolly and its name.
  const rooms = tourRooms(project, style);
  const many = project.floors.length > 1;
  for (const { floor, room } of rooms) {
    const view: SceneView = {
      ...open,
      floor: floor.id,
      streetLife: false,
      focus: { floorId: floor.id, roomId: room.id },
    };
    const box = roomBox(project, view, floor.id, room.id)!;
    const diagonal = roomHeroPose(hero).azimuth;
    add(
      {
        kind: "room",
        scene: sceneKey(`room:${room.id}`, light.hour),
        view,
        hour: light.hour,
        finish: light.finish,
        from: further(framed(box, { azimuth: diagonal - 9 * DEG, polar: 46 * DEG }, aspect, 0.06), 1.12),
        to: further(framed(box, { azimuth: diagonal + 7 * DEG, polar: 40 * DEG }, aspect, 0.06), 0.98),
        ease: "inOut",
        room: { floorId: floor.id, roomId: room.id, name: room.name, floorName: many ? floor.name : undefined },
        status: `Filming your ${lowerFirst(room.name)}…`,
        seconds: roomSeconds(style, rooms.length),
      },
      homeBox(project, view),
    );
  }

  // 5. The night pull-back (grand tour): windows glow and the lamps come on.
  if (style === "grand")
    add(
      {
        kind: "night",
        scene: sceneKey("outside", night.hour),
        view: outside,
        hour: night.hour,
        finish: night.finish,
        from: further(framed(house, { azimuth: hero.azimuth + 10 * DEG, polar: 66 * DEG }, aspect), 0.85),
        to: further(framed(plot, { azimuth: hero.azimuth - 4 * DEG, polar: 56 * DEG }, aspect), 0.94),
        ease: "inOut",
        status: "Waiting for the lamps to come on…",
        weight: WEIGHTS[style].night,
      },
      house,
    );

  // 6. The end card: the title, "Designed on Dream Home", the link and its QR code,
  //    over the night view drifting on (grand) or a pull-back in the mood's light (quick).
  const last = drafts[drafts.length - 1];
  const endFrom =
    style === "grand" && last.kind === "night"
      ? last.to
      : further(framed(house, { azimuth: hero.azimuth + 6 * DEG, polar: 62 * DEG }, aspect), 0.96);
  const endLight = style === "grand" ? night : light;
  add(
    {
      kind: "end",
      scene: sceneKey("outside", endLight.hour),
      view: outside,
      hour: endLight.hour,
      finish: endLight.finish,
      from: endFrom,
      to:
        style === "grand"
          ? { ...endFrom, azimuth: endFrom.azimuth + 3 * DEG, distance: endFrom.distance * 1.03 }
          : further(framed(plot, { azimuth: hero.azimuth - 2 * DEG, polar: 56 * DEG }, aspect), 1.02),
      ease: "out",
      status: "Adding your title and link…",
      weight: WEIGHTS[style].end,
    },
    house,
  );

  // Timing: rooms keep their seconds, the other shots share what's left by weight.
  const total = REEL_STYLES[style].seconds;
  const fixed = drafts.reduce((s, d) => s + (d.seconds ?? 0), 0);
  const weights = drafts.reduce((s, d) => s + (d.weight ?? 0), 0);
  const scale = (options.seconds ?? total) / total;
  let start = 0;
  const shots = drafts.map((draft, i): ReelShot => {
    const { weight, seconds, ...shot } = draft;
    const duration = (seconds ?? ((weight ?? 0) / weights) * (total - fixed)) * scale;
    // A cut to a new camera dissolves from the last frame; the end card just carries on.
    const continues = i > 0 && shot.kind === "end" && drafts[i - 1].kind === "night";
    const out = { ...shot, start, duration, fadeIn: i === 0 || continues ? 0 : Math.min(CROSSFADE, duration / 3) };
    start += duration;
    return out;
  });
  return { seconds: start, shots };
}

/** How strongly a shot's words show, `tau` seconds into it. */
export function overlayAlpha(shot: ReelShot, tau: number): number {
  const d = shot.duration;
  if (shot.kind === "establish") return ramp(0.2, 0.8, tau) * (1 - ramp(d - 0.45, d - 0.05, tau));
  if (shot.kind === "room") return ramp(0.15, 0.5, tau) * (1 - ramp(d - 0.35, d - 0.05, tau));
  if (shot.kind === "end") return ramp(0.2, 0.7, tau);
  return 0;
}

/** The dark wash behind the end card's words. */
export const scrimAt = (shot: ReelShot, tau: number) => (shot.kind === "end" ? 0.55 * ramp(0, 0.5, tau) : 0);
