// M4 reel: the shot list is deterministic, visits the chosen rooms, keeps the
// camera on the diorama and never inside the house; the music is the right
// length and never clips; the QR code is well formed.
import { describe, expect, it } from "vitest";
import { buildHome } from "../ai/buildHome";
import { plannerHomePlan } from "../ai/planner";
import type { HomeBrief } from "../ai/brief";
import { createBlueprint } from "../domain/blueprints";
import { createPreset } from "../domain/model";
import type { EditResult, Project } from "../domain/types";
import { TEMPLATES, buildTemplate } from "../onboarding/templates";
import { homeBox, plotBox, roomBox } from "../scene/camera/poses";
import { PEAK, SAMPLE_RATE, makeMusic, swara } from "./music";
import { insideBox, overlayAlpha, reelPath, scrimAt, shotCamera, tourRooms, type ReelPath } from "./path";
import { qrModules } from "./qr";
import { MOOD_ORDER, MUSIC_ORDER, REEL_STYLES, reelCaption, reelQuality, type ReelStyle } from "./settings";

const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
const STORY = 9 / 16;

/** Every template on one and two floors, roads on every side, and AI homes with a pooja room. */
function homes(): Project[] {
  const out: Project[] = [];
  for (const t of TEMPLATES)
    for (const floors of [1, 2]) {
      const r = buildTemplate(t, { floors });
      if (r.ok) out.push(r.project);
    }
  for (const road of ["north", "east", "west"] as const)
    out.push(ok(createBlueprint({ widthCm: 1219, depthCm: 1829, marginCm: 60, road, kind: "home", floors: 2, bedrooms: 3, unitsPerFloor: 2, bedroomsPerUnit: 2, shopsPerFloor: 2 })));
  for (const facing of ["east", "west"] as const) {
    const brief: HomeBrief = {
      plot: { w: 30, d: 50 },
      facing,
      family: "young-family",
      bedrooms: 3,
      floors: "auto",
      musts: ["ensuite", "pooja", "parking", "garden"],
      vibe: "indian-modern",
    };
    out.push(buildHome(brief, plannerHomePlan(brief))!.project);
  }
  out.push(createPreset("family"), createPreset("compact"), createPreset("courtyard"));
  return out;
}
const HOMES = homes();
const paths = (style: ReelStyle) => HOMES.map((p) => ({ project: p, path: reelPath(p, { aspect: STORY, style, mood: "golden", livedIn: true }) }));

/** Camera samples through every shot. */
function* samples(path: ReelPath) {
  for (const shot of path.shots) for (let i = 0; i <= 10; i++) yield { shot, ...shotCamera(shot, i / 10) };
}

describe("reelPath", () => {
  it("is the same every time for the same home", () => {
    const p = createPreset("family");
    const options = { aspect: STORY, style: "grand" as const, mood: "diwali" as const, livedIn: true };
    expect(reelPath(p, options)).toEqual(reelPath(p, options));
  });

  it("runs 15 seconds for the grand tour and 8 for the quick one, shots back to back", () => {
    for (const style of ["grand", "quick"] as const)
      for (const { path } of paths(style)) {
        expect(path.seconds).toBeCloseTo(REEL_STYLES[style].seconds, 6);
        let t = 0;
        for (const shot of path.shots) {
          expect(shot.start).toBeCloseTo(t, 6);
          expect(shot.duration).toBeGreaterThan(1);
          t += shot.duration;
        }
      }
    // Tests can ask for a one-second reel; everything scales.
    const short = reelPath(createPreset("compact"), { aspect: STORY, style: "quick", mood: "day", livedIn: false, seconds: 1 });
    expect(short.seconds).toBeCloseTo(1, 6);
  });

  it("tells the story in order: outside, the door, the dollhouse, the rooms, night, the end card", () => {
    const { path } = paths("grand")[0];
    const kinds = path.shots.map((s) => s.kind);
    expect(kinds[0]).toBe("establish");
    expect(kinds.at(-1)).toBe("end");
    expect(kinds.at(-2)).toBe("night");
    expect(kinds).toContain("reveal");
    expect(kinds.indexOf("reveal")).toBeLessThan(kinds.indexOf("room"));
    // The end card carries straight on from the night shot; every other cut dissolves.
    for (const [i, shot] of path.shots.entries()) expect(shot.fadeIn === 0).toBe(i === 0 || shot.kind === "end");
    // The quick reel: no approach and no night shot.
    const quick = paths("quick")[0].path.shots.map((s) => s.kind);
    expect(quick).toEqual(["establish", "reveal", "room", "room", "end"]);
  });

  it("visits the living room, kitchen, main bedroom and the pooja room, each as the hero", () => {
    let pooja = 0;
    for (const { project, path } of paths("grand")) {
      const chosen = tourRooms(project, "grand");
      const kinds = chosen.map((c) => c.room.kind);
      if (project.floors.some((f) => f.rooms.some((r) => r.kind === "living"))) expect(kinds[0]).toBe("living");
      if (project.floors.some((f) => f.rooms.some((r) => r.kind === "kitchen"))) expect(kinds).toContain("kitchen");
      if (project.floors.some((f) => f.rooms.some((r) => r.kind === "bedroom"))) expect(kinds).toContain("bedroom");
      if (chosen.some((c) => /pooja|puja|mandir|prayer/i.test(c.room.name))) pooja++;
      expect(chosen.length).toBeLessThanOrEqual(4);
      // Each chosen room has its own shot, with the dollhouse focus on it and its name.
      const rooms = path.shots.filter((s) => s.kind === "room");
      expect(rooms.map((s) => s.room!.roomId)).toEqual(chosen.map((c) => c.room.id));
      for (const shot of rooms) {
        expect(shot.view.focus).toEqual({ floorId: shot.room!.floorId, roomId: shot.room!.roomId });
        expect(shot.view.floor).toBe(shot.room!.floorId);
        expect(shot.duration).toBeGreaterThanOrEqual(1.6);
        expect(shot.duration).toBeLessThanOrEqual(2);
      }
    }
    // The AI homes asked for a pooja room, and the tour finds it.
    expect(pooja).toBeGreaterThanOrEqual(2);
  });

  it("keeps the camera looking at the plot, above ground, and never inside the house", () => {
    for (const style of ["grand", "quick"] as const)
      for (const { project, path } of paths(style)) {
        const plot = plotBox(project);
        for (const { shot, position, target } of samples(path)) {
          // What the camera looks at is on the diorama.
          expect(insideBox(target, { min: [plot.min[0], -1, plot.min[2]], max: [plot.max[0], plot.max[1] + 12, plot.max[2]] }, 0.5)).toBe(true);
          expect(position[1]).toBeGreaterThan(0.5);
          // Never inside the walls (or, in a room shot, below the cut).
          expect(insideBox(position, homeBox(project, shot.view), 0.2)).toBe(false);
          if (shot.kind === "room") {
            const room = roomBox(project, shot.view, shot.room!.floorId, shot.room!.roomId)!;
            expect(position[1]).toBeGreaterThan(room.max[1]);
          }
        }
      }
  });

  it("the room shots frame their room: it sits in the middle of the picture", () => {
    for (const { project, path } of paths("grand").slice(0, 6))
      for (const shot of path.shots.filter((s) => s.kind === "room")) {
        const box = roomBox(project, shot.view, shot.room!.floorId, shot.room!.roomId)!;
        const middle = [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2];
        const { target } = shotCamera(shot, 0.5);
        expect(Math.hypot(target[0] - middle[0], target[2] - middle[1])).toBeLessThan(3);
      }
  });

  it("uses the mood's light, with night falling for the grand tour's ending", () => {
    const p = createPreset("family");
    for (const mood of MOOD_ORDER) {
      const path = reelPath(p, { aspect: STORY, style: "grand", mood, livedIn: true });
      const first = path.shots[0],
        night = path.shots.find((s) => s.kind === "night")!;
      expect(night.hour).toBeGreaterThanOrEqual(21);
      expect(path.shots.every((s) => !!s.view.festive === (mood === "diwali"))).toBe(true);
      if (mood === "day") expect(first.hour).toBeLessThan(12);
      if (mood === "golden") expect(first.finish).toBe("golden");
    }
  });

  it("shows the title, room names and end card only while their shots play", () => {
    const { path } = paths("grand")[0];
    for (const shot of path.shots) {
      const mid = overlayAlpha(shot, shot.duration / 2);
      expect(mid > 0.5).toBe(shot.kind === "establish" || shot.kind === "room" || shot.kind === "end");
      expect(overlayAlpha(shot, 0)).toBe(0);
      expect(scrimAt(shot, shot.duration) > 0).toBe(shot.kind === "end");
    }
  });
});

describe("music", () => {
  it("is the right length, never clips, and fades in and out", () => {
    for (const kind of MUSIC_ORDER.filter((m) => m !== "none")) {
      const track = makeMusic(kind, 15);
      expect(track.sampleRate).toBe(SAMPLE_RATE);
      expect(track.left.length).toBe(15 * SAMPLE_RATE);
      expect(track.right.length).toBe(15 * SAMPLE_RATE);
      let peak = 0,
        energy = 0;
      for (const channel of [track.left, track.right])
        for (const v of channel) {
          peak = Math.max(peak, Math.abs(v));
          energy += v * v;
        }
      expect(peak).toBeLessThanOrEqual(0.98);
      expect(peak).toBeCloseTo(PEAK, 3);
      // Actually audible, not silence.
      expect(Math.sqrt(energy / (2 * track.left.length))).toBeGreaterThan(0.02);
      expect(Math.abs(track.left[0])).toBeLessThan(1e-3);
      expect(Math.abs(track.left.at(-1)!)).toBeLessThan(1e-3);
      expect(Number.isFinite(energy)).toBe(true);
    }
  });

  it("is the same every time (seeded) and silence when there's no music", () => {
    const a = makeMusic("festive", 2),
      b = makeMusic("festive", 2);
    expect(a.left).toEqual(b.left);
    expect(a.right).toEqual(b.right);
    const none = makeMusic("none", 8);
    expect(none.left.length).toBe(8 * SAMPLE_RATE);
    expect(none.left.every((v) => v === 0)).toBe(true);
    // A one-second test reel still gets its full second.
    expect(makeMusic("morning", 1).left.length).toBe(SAMPLE_RATE);
  });

  it("plays raag Bhupali's notes from Sa", () => {
    expect(swara(0)).toBeCloseTo(146.83, 2);
    expect(swara(5)).toBeCloseTo(2 * 146.83, 2);
    expect(swara(3) / swara(0)).toBeCloseTo(2 ** (7 / 12), 6);
    expect(swara(-5)).toBeCloseTo(146.83 / 2, 2);
  });
});

describe("the end card", () => {
  it("encodes the link as a QR code with its three finder squares", () => {
    const link = "https://home.amankeshri.com/h/AbCdEf1234";
    const m = qrModules(link);
    const n = m.length;
    expect((n - 17) % 4).toBe(0);
    expect(n).toBeGreaterThanOrEqual(25);
    expect(m.every((row) => row.length === n)).toBe(true);
    // Finder squares: a dark 7 × 7 ring around a light ring around a dark 3 × 3 heart.
    for (const [r0, c0] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ])
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          expect(m[r0 + r][c0 + c]).toBe(ring !== 2);
        }
    expect(qrModules(link)).toEqual(m);
  });

  it("the caption carries the link when there is one", () => {
    expect(reelCaption("https://x.test/h/abc")).toBe("Designed our dream home on Dream Home 🏠 https://x.test/h/abc #DreamHome #MyDreamHome");
    expect(reelCaption(null)).toBe("Designed our dream home on Dream Home 🏠 #DreamHome #MyDreamHome");
  });

  it("phones film smaller and quicker than desktops", () => {
    expect(reelQuality({ phone: true })).toMatchObject({ width: 720, height: 1280, samples: 1, budget: 90, aoHalfRes: true });
    expect(reelQuality({ phone: false })).toMatchObject({ width: 1080, height: 1920, samples: 3, budget: 30, aoHalfRes: false });
  });
});
