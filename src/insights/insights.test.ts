// M5 insights: the real sun (against published geometry), the compass and
// wall names, direct sun per room, every Vastu rule on small fixture homes,
// and the Home score with its badges.
import { describe, expect, it } from "vitest";
import { COMPASS8, COMPASS_ANGLE, homeFacing, northForFacing, roomBearing, sideName, wrapDegrees, type Compass8 } from "../domain/compass";
import { withStylePreset } from "../domain/materials";
import { createPreset, parseProject, swapRoomUses } from "../domain/model";
import { setFacing, setLocation } from "../domain/place";
import type { EditResult, Project, Room } from "../domain/types";
import { TEMPLATES, buildTemplate } from "../onboarding/templates";
import { lighting } from "../scene/environment/timeOfDay";
import cities from "./cities.json";
import { BADGES, homeScore } from "./score";
import { clockLabel, seasonDate, solarPosition, sunTimes, timeZoneFor, type CalendarDate } from "./solar";
import { SLOTS, roomWindows, sunHours, sunPhrase, sunTips, sunnyRuns } from "./sun";
import { vastuReport } from "./vastu";

const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
const DELHI = { lat: 28.61, lon: 77.21 },
  CHENNAI = { lat: 13.08, lon: 80.27 },
  MUMBAI = { lat: 19.08, lon: 72.88 };
const JUNE: CalendarDate = { year: 2026, month: 6, day: 21 },
  DECEMBER: CalendarDate = { year: 2026, month: 12, day: 21 },
  MARCH: CalendarDate = { year: 2026, month: 3, day: 20 };
const at = (place: { lat: number; lon: number }, date: CalendarDate, hour: number) => solarPosition(place.lat, place.lon, date, hour);

describe("the real sun", () => {
  it("stands as high at noon as the textbooks say (90° − |latitude − declination|)", () => {
    const cases: [typeof DELHI, CalendarDate, number][] = [
      [DELHI, JUNE, 23.44],
      [DELHI, DECEMBER, -23.44],
      [DELHI, MARCH, -0.05],
      [CHENNAI, JUNE, 23.44],
      [CHENNAI, DECEMBER, -23.44],
      [MUMBAI, JUNE, 23.44],
      [MUMBAI, DECEMBER, -23.44],
      [MUMBAI, MARCH, -0.05],
    ];
    for (const [place, date, declination] of cases) {
      const noon = sunTimes(place, date).noon;
      expect(at(place, date, noon).elevation).toBeCloseTo(90 - Math.abs(place.lat - declination), 0);
      expect(Math.abs(at(place, date, noon).elevation - (90 - Math.abs(place.lat - declination)))).toBeLessThan(0.5);
    }
  });

  it("is south at noon, except in June in Chennai and Mumbai, where it's north of overhead", () => {
    const bearing = (place: typeof DELHI, date: CalendarDate) => at(place, date, sunTimes(place, date).noon).bearing;
    expect(bearing(DELHI, JUNE)).toBeCloseTo(180, -1);
    expect(bearing(DELHI, DECEMBER)).toBeCloseTo(180, -1);
    expect(bearing(CHENNAI, DECEMBER)).toBeCloseTo(180, -1);
    for (const place of [CHENNAI, MUMBAI]) {
      const b = bearing(place, JUNE);
      expect(Math.min(b, 360 - b)).toBeLessThan(10);
    }
  });

  it("keeps India's clock: solar noon follows longitude and the equation of time", () => {
    // 4 minutes per degree west of 82.5° E, less the equation of time
    // (about −1.7 min on 21 June, +16.4 min on 3 November, −14.2 min on 11 February).
    const expected = (lon: number, eot: number) => 12 + (4 * (82.5 - lon) - eot) / 60;
    for (const [date, eot] of [
      [JUNE, -1.7],
      [{ year: 2026, month: 11, day: 3 }, 16.4],
      [{ year: 2026, month: 2, day: 11 }, -14.2],
    ] as [CalendarDate, number][]) {
      expect(Math.abs(sunTimes(DELHI, date).noon - expected(DELHI.lon, eot)) * 60).toBeLessThan(1.5);
      expect(Math.abs(sunTimes(MUMBAI, date).noon - expected(MUMBAI.lon, eot)) * 60).toBeLessThan(1.5);
    }
  });

  it("gives Delhi its long June day and short December day, and an equinox sunrise due east", () => {
    const length = (date: CalendarDate) => {
      const t = sunTimes(DELHI, date);
      return (t.sunset! - t.sunrise!) * 60;
    };
    expect(Math.abs(length(JUNE) - (13 * 60 + 58))).toBeLessThan(4);
    expect(Math.abs(length(DECEMBER) - (10 * 60 + 19))).toBeLessThan(4);
    const rise = sunTimes(CHENNAI, MARCH).sunrise!;
    expect(at(CHENNAI, MARCH, rise).bearing).toBeCloseTo(90, -0.3);
    expect(Math.abs(at(CHENNAI, MARCH, rise).bearing - 90)).toBeLessThan(1.5);
  });

  it("uses IST across India, and the nearest half hour of solar time elsewhere", () => {
    expect(timeZoneFor(DELHI)).toBe(5.5);
    expect(timeZoneFor({ lat: 34.15, lon: 77.58 })).toBe(5.5);
    expect(timeZoneFor({ lat: 51.5, lon: -0.1 })).toBe(0);
    expect(clockLabel(6.75)).toBe("6:45 am");
    expect(clockLabel(12.5)).toBe("12:30 pm");
    expect(clockLabel(19)).toBe("7 pm");
    expect(seasonDate("winter", new Date(2026, 3, 1))).toEqual({ year: 2026, month: 12, day: 21 });
  });

  it("lights the scene with it: true direction, and colours that follow its real height", () => {
    const june = { ...DELHI, date: JUNE },
      december = { ...DELHI, date: DECEMBER };
    // Without a place, nothing changes.
    expect(lighting(10.5, 0, null)).toEqual(lighting(10.5, 0));
    // A June noon in Delhi: almost overhead, full day.
    const noon = lighting(12.4, 0, june);
    expect(noon.elevation).toBeGreaterThan(80);
    expect(noon.night).toBe(0);
    // 5:15 pm in December is nearly sunset: darker and glowing windows, unlike the stylised sun.
    const dusk = lighting(17.25, 0, december);
    expect(dusk.elevation).toBeLessThan(5);
    expect(dusk.palette.windowGlow).toBeGreaterThan(lighting(17.25, 0).palette.windowGlow);
    expect(lighting(21.5, 0, december).night).toBe(1);
    // A March morning: the sun is in the east (+x) and a little south (+z).
    const morning = lighting(8, 0, { ...DELHI, date: MARCH });
    expect(morning.sunDir[0]).toBeGreaterThan(0.5);
    expect(morning.sunDir[2]).toBeGreaterThan(0);
    // The compass turns it: with true north to plan-east, true east is plan-south.
    const turned = lighting(8, 90, { ...DELHI, date: MARCH });
    expect(turned.sunDir[2]).toBeGreaterThan(0.5);
  });

  it("knows about 200 Indian cities, each with a state and real coordinates", () => {
    expect(cities.length).toBeGreaterThanOrEqual(150);
    const names = new Set<string>();
    for (const c of cities) {
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.state.length).toBeGreaterThan(1);
      expect(c.lat).toBeGreaterThan(6);
      expect(c.lat).toBeLessThan(36);
      expect(c.lon).toBeGreaterThan(68);
      expect(c.lon).toBeLessThan(98);
      expect(names.has(c.name)).toBe(false);
      names.add(c.name);
    }
    expect(cities.find((c) => c.name === "Bengaluru")?.aka).toContain("Bangalore");
  });
});

describe("the compass", () => {
  it("turns north so the home faces the way the homeowner says, and remembers it", () => {
    const p = createPreset("compact");
    expect(homeFacing(p)).toBeNull();
    for (const facing of COMPASS8) {
      const q = ok(setFacing(p, facing));
      expect(q.plot.compass).toBe(true);
      expect(q.plot.north).toBe(northForFacing(p, facing));
      expect(homeFacing(q)).toBe(facing);
    }
  });

  it("names sides from the road until then, and by the compass after", () => {
    const plot = { north: 0, road: "south" as const };
    expect(sideName(plot, "south")).toBe("Front");
    expect(sideName(plot, "north")).toBe("Back");
    expect(sideName(plot, "west")).toBe("Left");
    expect(sideName(plot, "east")).toBe("Right");
    expect(sideName({ north: 0, road: "east" }, "east")).toBe("Front");
    // From a road on the east, looking west at the house, south is on the left.
    expect(sideName({ north: 0, road: "east" }, "south")).toBe("Left");
    expect(sideName({ north: 0, road: "east" }, "north")).toBe("Right");
    expect(sideName({ ...plot, compass: true }, "north")).toBe("North");
    expect(sideName({ north: 45, road: "south", compass: true }, "north")).toBe("North-west");
  });

  it("saves the compass flag through a reload, and refuses a bad one", () => {
    const p = ok(setFacing(createPreset("compact"), "northeast"));
    const again = parseProject(JSON.stringify(p));
    expect(again.plot.compass).toBe(true);
    expect(again.plot.north).toBe(p.plot.north);
    expect(parseProject(JSON.stringify(createPreset("compact"))).plot.compass).toBeUndefined();
    expect(() => parseProject(JSON.stringify({ ...p, plot: { ...p.plot, compass: "yes" } }))).toThrow();
  });

  it("keeps the city rounded and can forget it", () => {
    const p = ok(setLocation(createPreset("compact"), { city: "Pune", lat: 18.5204, lon: 73.8567 }));
    expect(p.plot.location).toEqual({ city: "Pune", lat: 18.52, lon: 73.86 });
    expect(ok(setLocation(p, null)).plot.location).toBeUndefined();
    expect(setLocation(p, { city: " ", lat: 1, lon: 1 }).ok).toBe(false);
  });
});

/** Turns the compass so a room lands in a zone of its floor. */
function inZone(project: Project, floorId: string, roomId: string, zone: Compass8): Project {
  const room = project.floors.find((f) => f.id === floorId)!.rooms.find((r) => r.id === roomId)!;
  const flat = { ...project, plot: { ...project.plot, north: 0 } };
  const angle = roomBearing(flat, floorId, room).angle;
  return { ...project, plot: { ...project.plot, north: wrapDegrees(angle - COMPASS_ANGLE[zone]), compass: true } };
}
const findRoom = (p: Project, test: (r: Room) => boolean) => {
  for (const f of p.floors) for (const r of f.rooms) if (test(r)) return { floorId: f.id, room: r };
  throw new Error("no such room");
};
const rename = (p: Project, id: string, patch: Partial<Room>): Project => ({
  ...p,
  floors: p.floors.map((f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
});
const rule = (p: Project, id: string) => vastuReport(p)!.rules.find((r) => r.id === id)!;

describe("direct sun per room", () => {
  const home = createPreset("family");
  const ground = home.floors[0];

  it("only counts sun in front of a window and well above the horizon", () => {
    const delhi = ok(setLocation(home, { city: "Delhi", ...DELHI }));
    for (const date of [JUNE, MARCH, DECEMBER])
      for (const r of sunHours(delhi, ground.id, DELHI, date)) {
        const room = ground.rooms.find((x) => x.id === r.roomId)!;
        const windows = roomWindows(delhi, ground.id, room);
        expect(r.windows).toBe(windows.length);
        if (!windows.length) expect(r.slots).toEqual([]);
        for (const t of r.slots) {
          const sun = at(DELHI, date, t + 0.25);
          expect(sun.elevation).toBeGreaterThan(5);
          expect(windows.some((n) => Math.cos((sun.elevation * Math.PI) / 180) * Math.cos(((sun.bearing - n) * Math.PI) / 180) > 0.15)).toBe(true);
        }
        expect(r.hours).toBe(r.slots.length / 2);
      }
  });

  it("east windows get the morning, west windows the hot afternoon, north windows only summer edges", () => {
    // Turn the home so a room's windows all face one way, then check its sun.
    const room = ground.rooms.find((r) => {
      const w = roomWindows(home, ground.id, r);
      return w.length > 0 && w.every((n) => n === w[0]);
    })!;
    const facing = roomWindows(home, ground.id, room)[0];
    const facingTo = (bearing: number) => ({ ...home, plot: { ...home.plot, north: wrapDegrees(facing - bearing), compass: true } });
    const of = (p: Project, date: CalendarDate) => sunHours(p, ground.id, DELHI, date).find((r) => r.roomId === room.id)!;
    const east = of(facingTo(90), MARCH);
    expect(east.slots.length).toBeGreaterThan(6);
    expect(Math.max(...east.slots)).toBeLessThan(12);
    expect(east.phrase).toMatch(/^Morning sun (6|7)(:30)? am–(noon|1[01](:30)? am)$/);
    const west = of(facingTo(270), MARCH);
    expect(Math.min(...west.slots)).toBeGreaterThanOrEqual(12.5);
    expect(west.hotFace).toBe("west");
    expect(west.phrase).toMatch(/^Hot afternoon sun .* pm \(west\)$/);
    expect(of(facingTo(0), MARCH).slots).toEqual([]);
    expect(of(facingTo(0), MARCH).phrase).toBe("No direct sun");
    // In June the sun rises and sets north of east and west, so a north window catches the edges.
    expect(of(facingTo(0), JUNE).slots.length).toBeGreaterThan(0);
    expect(of(facingTo(180), DECEMBER).hours).toBeGreaterThan(of(facingTo(180), JUNE).hours);
  });

  it("speaks in plain phrases and offers one-tap help for hot rooms", () => {
    expect(sunPhrase([], null)).toBe("No direct sun");
    expect(sunPhrase([7, 7.5, 8, 8.5, 9, 9.5], null)).toBe("Morning sun 7–10 am");
    expect(sunPhrase([14, 14.5, 15, 15.5, 16, 16.5], "west")).toBe("Hot afternoon sun 2–5 pm (west)");
    expect(sunPhrase([11, 11.5, 12, 12.5, 13, 13.5], null)).toBe("Sun 11 am–2 pm");
    expect(sunPhrase(SLOTS, null)).toBe("Sun most of the day");
    expect(sunnyRuns([6, 6.5, 9, 9.5, 10])).toEqual([
      [6, 7],
      [9, 10.5],
    ]);
    const hot = sunTips(home, [
      { floorId: ground.id, roomId: ground.rooms[0].id, name: "Bedroom 1", kind: "bedroom", windows: 1, slots: [14, 14.5, 15, 15.5], hours: 2, sunnyFaces: ["west"], hotAfternoon: 2, hotFace: "west", phrase: "" },
      { floorId: ground.id, roomId: ground.rooms[1].id, name: "Bedroom 2", kind: "bedroom", windows: 1, slots: [], hours: 0, sunnyFaces: [], hotAfternoon: 0, hotFace: null, phrase: "" },
      { floorId: ground.id, roomId: ground.rooms[2].id, name: "Kitchen", kind: "kitchen", windows: 1, slots: [], hours: 0, sunnyFaces: [], hotAfternoon: 0, hotFace: null, phrase: "" },
    ]);
    expect(hot[0].text).toBe("Bedroom 1 gets hot afternoon sun from the west. Curtains or a chhajja help.");
    expect(hot[0].fix?.kind).toMatch(/curtains|chhajja/);
    expect(hot[1].text).toMatch(/^Bedroom 2 gets no direct sun/);
    expect(hot).toHaveLength(2);
  });
});

describe("Vastu", () => {
  const base = createPreset("family");
  const kitchen = findRoom(base, (r) => r.kind === "kitchen");
  const bedroom = findRoom(base, (r) => r.kind === "bedroom");
  const living = findRoom(base, (r) => r.kind === "living");

  it("waits for the compass, then scores out of 100 with tips", () => {
    expect(vastuReport(base)).toBeNull();
    const report = vastuReport(ok(setFacing(base, "east")))!;
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    for (const r of report.rules) if (r.status !== "na") expect(r.tip.length).toBeGreaterThan(10);
  });

  it("main door: north, east and north-east welcome; north-west and south-east are fair; others miss", () => {
    const status = (facing: Compass8) => rule(ok(setFacing(base, facing)), "entrance").status;
    expect(["north", "east", "northeast"].map((f) => status(f as Compass8))).toEqual(["pass", "pass", "pass"]);
    expect(status("northwest")).toBe("partial");
    expect(status("southeast")).toBe("partial");
    expect(status("south")).toBe("fail");
    expect(status("southwest")).toBe("fail");
  });

  it("kitchen in the south-east (or north-west)", () => {
    expect(rule(inZone(base, kitchen.floorId, kitchen.room.id, "southeast"), "kitchen").status).toBe("pass");
    expect(rule(inZone(base, kitchen.floorId, kitchen.room.id, "northwest"), "kitchen").status).toBe("partial");
    expect(rule(inZone(base, kitchen.floorId, kitchen.room.id, "north"), "kitchen").status).toBe("fail");
  });

  it("main bedroom in the south-west; living room to the north, east or north-east", () => {
    const main = findRoom(base, (r) => r.kind === "bedroom" && r.bounds.w * r.bounds.d === Math.max(...base.floors.flatMap((f) => f.rooms).filter((x) => x.kind === "bedroom").map((x) => x.bounds.w * x.bounds.d)));
    expect(rule(inZone(base, main.floorId, main.room.id, "southwest"), "main-bedroom").status).toBe("pass");
    expect(rule(inZone(base, main.floorId, main.room.id, "west"), "main-bedroom").status).toBe("partial");
    expect(rule(inZone(base, main.floorId, main.room.id, "northeast"), "main-bedroom").status).toBe("fail");
    expect(rule(inZone(base, living.floorId, living.room.id, "northeast"), "living").status).toBe("pass");
    expect(rule(inZone(base, living.floorId, living.room.id, "southwest"), "living").status).toBe("fail");
  });

  it("pooja room in the north-east (east or north are fine); none means nothing to score", () => {
    const withPooja = rename(base, bedroom.room.id, { name: "Pooja room", kind: "utility" });
    expect(rule(inZone(withPooja, bedroom.floorId, bedroom.room.id, "northeast"), "pooja").status).toBe("pass");
    expect(rule(inZone(withPooja, bedroom.floorId, bedroom.room.id, "east"), "pooja").status).toBe("partial");
    expect(rule(inZone(withPooja, bedroom.floorId, bedroom.room.id, "south"), "pooja").status).toBe("fail");
    expect(rule(ok(setFacing(base, "east")), "pooja").status).toBe("na");
  });

  it("no bathroom in the north-east; children's and guest rooms to the west", () => {
    const bath = findRoom(base, (r) => r.kind === "bathroom");
    expect(rule(inZone(base, bath.floorId, bath.room.id, "northeast"), "bathrooms").status).toBe("fail");
    expect(rule(inZone(base, bath.floorId, bath.room.id, "southwest"), "bathrooms").status).toBe("pass");
    const kids = rename(base, bedroom.room.id, { name: "Kids' room" });
    expect(rule(inZone(kids, bedroom.floorId, bedroom.room.id, "northwest"), "kids").status).toBe("pass");
    expect(rule(inZone(kids, bedroom.floorId, bedroom.room.id, "east"), "kids").status).toBe("fail");
    const guest = rename(base, bedroom.room.id, { name: "Guest room" });
    expect(rule(inZone(guest, bedroom.floorId, bedroom.room.id, "northwest"), "guest").status).toBe("pass");
    expect(rule(inZone(guest, bedroom.floorId, bedroom.room.id, "south"), "guest").status).toBe("fail");
  });

  it("stairs to the south or west, and an open centre", () => {
    const stairs = base.verticalSpaces.find((v) => v.kind === "stairs")!;
    const ground = base.floors.find((f) => stairs.floorIds.includes(f.id))!;
    const fake: Room = { id: "probe", name: "probe", kind: "utility", bounds: stairs.bounds, unitId: null };
    const turned = (zone: Compass8) => {
      const flat = { ...base, plot: { ...base.plot, north: 0 } };
      const angle = roomBearing({ ...flat, floors: [{ ...ground, rooms: [fake] }] }, ground.id, fake).angle;
      return { ...base, plot: { ...base.plot, north: wrapDegrees(angle - COMPASS_ANGLE[zone]), compass: true } };
    };
    expect(rule(turned("southwest"), "stairs").status).toBe("pass");
    expect(rule(turned("northeast"), "stairs").status).toBe("fail");
    expect(rule(turned("east"), "stairs").status).toBe("partial");
    // A bathroom in the very middle of a floor fills the Brahmasthan.
    const home = ok(setFacing(base, "east"));
    const middle = home.floors
      .flatMap((f) => f.rooms.map((r) => ({ floorId: f.id, r })))
      .find(({ floorId, r }) => roomBearing(home, floorId, r).reach < 0.3);
    if (middle) expect(rule(rename(home, middle.r.id, { kind: "bathroom" }), "centre").status).toBe("fail");
    expect(["pass", "fail"]).toContain(rule(home, "centre").status);
  });

  it("bed heads to the south or east; the cook faces east", () => {
    const home = ok(setFacing(base, "south"));
    const withBed = (rotation: 0 | 90 | 180 | 270) =>
      rename(home, bedroom.room.id, { furniture: [{ id: "bed-x", catalogId: "bed-double", x: 100, z: 120, rotation }] });
    // With the home facing south (north = 0), plan directions are true directions.
    const others = (p: Project) => ({
      ...p,
      floors: p.floors.map((f) => ({ ...f, rooms: f.rooms.map((r) => (r.kind === "bedroom" && r.id !== bedroom.room.id ? { ...r, furnishing: "none" as const } : r)) })),
    });
    expect(rule(others(withBed(180)), "bed").status).toBe("pass");
    expect(rule(others(withBed(90)), "bed").status).toBe("pass");
    expect(rule(others(withBed(0)), "bed").status).toBe("fail");
    expect(rule(others(withBed(270)), "bed").status).toBe("partial");
    const cooking = (rotation: 0 | 90 | 180 | 270) =>
      rule(rename(home, kitchen.room.id, { furniture: [{ id: "stove-x", catalogId: "kitchen-stove", x: 60, z: 60, rotation }] }), "cooking").status;
    expect(cooking(90)).toBe("pass");
    expect(cooking(0)).toBe("partial");
    expect(cooking(270)).toBe("fail");
  });

  it("offers swaps that are real, valid edits", () => {
    let swaps = 0;
    for (const facing of COMPASS8) {
      const p = ok(setFacing(base, facing));
      for (const r of vastuReport(p, { withSwaps: true })!.rules)
        if (r.swap) {
          swaps++;
          expect(r.status).toBe("fail");
          expect(ok(swapUses(p, r.swap))).not.toBe(p);
        }
    }
    expect(swaps).toBeGreaterThan(0);
  });
});
// The domain's own swap, as the Vastu card applies it.
const swapUses = (p: Project, s: { floorId: string; sourceId: string; targetId: string }) => swapRoomUses(p, s.floorId, s.sourceId, s.targetId);

describe("the Home score", () => {
  it("is a number out of 100 from the essentials, ideas and sunlight (and Vastu when asked)", () => {
    for (const t of TEMPLATES) {
      const p = ok(buildTemplate(t));
      const s = homeScore(p);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.parts.map((x) => x.id)).toEqual(["essentials", "ideas", "sunlight"]);
      expect(s.vastu).toBeNull();
    }
    const facing = { ...ok(setFacing(createPreset("family"), "east")), vastu: true };
    const vastu = homeScore(facing, { vastu: vastuReport(facing)!.score });
    expect(vastu.parts.map((x) => x.id)).toEqual(["essentials", "ideas", "sunlight", "vastu"]);
    expect(vastu.vastu).not.toBeNull();
    // Opting in without a compass leaves Vastu out until the facing is set.
    expect(homeScore({ ...createPreset("family"), vastu: true }).parts.map((x) => x.id)).not.toContain("vastu");
    // …and a Vastu score is only counted for a home that asked for it.
    expect(homeScore(createPreset("family"), { vastu: 90 }).parts.map((x) => x.id)).not.toContain("vastu");
    expect(homeScore({ ...createPreset("family"), vastu: true }, { vastu: 80 }).badges).toContain("vastu");
  });

  it("drops when an essential is missing and is the same every time", () => {
    const p = createPreset("compact");
    const noBath = { ...p, floors: p.floors.map((f) => ({ ...f, rooms: f.rooms.filter((r) => r.kind !== "bathroom") })) };
    expect(homeScore(noBath).score).toBeLessThan(homeScore(p).score);
    const now = new Date(2026, 9, 17);
    expect(homeScore(p, { now })).toEqual(homeScore(p, { now }));
  });

  it("awards badges for sunlight, Vastu, furnishing, a regional look and sharing", () => {
    const p = createPreset("family");
    const s = homeScore(p);
    expect(s.badges.includes("sunlight")).toBe(
      s.sun.filter((r) => r.kind === "bedroom" || r.kind === "living").every((r) => r.hours > 0),
    );
    expect(homeScore(p, { shared: true }).badges).toContain("shared");
    expect(homeScore(p).badges).not.toContain("shared");
    expect(homeScore(withStylePreset(p, "kerala")).badges).toContain("regional");
    expect(homeScore(p).badges).not.toContain("regional");
    const furnished = {
      ...p,
      floors: p.floors.map((f) => ({
        ...f,
        rooms: f.rooms.map((r) => (["bedroom", "living", "kitchen"].includes(r.kind) ? { ...r, furniture: [{ id: `x-${r.id}`, catalogId: "plant-floor", x: 40, z: 40, rotation: 0 as const }] } : r)),
      })),
    };
    expect(homeScore(furnished).badges).toContain("furnished");
    for (const id of homeScore(furnished, { shared: true }).badges) expect(BADGES[id].label.length).toBeGreaterThan(3);
  });
});
