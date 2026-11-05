import { describe, expect, it } from "vitest";
import { editorReducer as reducer, initialEditorState as initialState } from "../editor/state";
import { createPreset } from "../domain/model";
import { lighting } from "../scene/environment/timeOfDay";
import { lightRooms, lightSky } from "../scene/roomlight/input";
import { solveLightGrid } from "../scene/roomlight/solve";
import { dateOfDay, dayOfYear, shortDate, sunCalendar } from "./solar";
import { CENTRAL_INDIA } from "./score";

describe("any day of the year", () => {
  it("counts days and back, leap years included", () => {
    expect(dayOfYear({ year: 2026, month: 1, day: 1 })).toBe(1);
    expect(dayOfYear({ year: 2026, month: 6, day: 21 })).toBe(172);
    expect(dayOfYear({ year: 2024, month: 12, day: 31 })).toBe(366);
    for (const n of [1, 59, 60, 172, 200, 355, 365]) expect(dayOfYear(dateOfDay(2026, n))).toBe(n);
    expect(shortDate(dateOfDay(2026, 172))).toBe("21 Jun");
  });

  it("follows the season until a day is chosen, and a season clears the day again", () => {
    const now = new Date(2026, 10, 6);
    expect(sunCalendar("winter", null, now)).toEqual({ year: 2026, month: 12, day: 21 });
    expect(sunCalendar("winter", 172, now)).toEqual({ year: 2026, month: 6, day: 21 });
    const state = initialState();
    const picked = reducer(state, { type: "sun-day", day: 200 });
    expect(picked.sunDay).toBe(200);
    expect(reducer(picked, { type: "season", season: "summer" }).sunDay).toBeNull();
    expect(reducer(state, { type: "sun-day", day: 999 }).sunDay).toBe(366);
  });

  it("moves the real sun with the day, at the same hour", () => {
    const june = lighting(9, 0, { ...CENTRAL_INDIA, date: dateOfDay(2026, 172) });
    const december = lighting(9, 0, { ...CENTRAL_INDIA, date: dateOfDay(2026, 355) });
    expect(june.elevation).toBeGreaterThan(december.elevation + 8);
  });
});

describe("a room's light through the day", () => {
  const project = createPreset("compact");
  const floor = project.floors[0];
  const warmthAt = (hour: number) => {
    const light = lighting(hour, project.plot.north, { ...CENTRAL_INDIA, date: dateOfDay(2026, 300) });
    const { rooms, spec } = lightRooms(project, floor.id, light.palette.windowGlow >= 0.3);
    const grid = solveLightGrid(rooms, lightSky(light), spec);
    let sum = 0,
      n = 0;
    for (let id = 0; id < grid.nx * grid.ny * grid.nz; id++)
      if (grid.signed[id * 4 + 3] === 1) {
        sum += grid.total[id * 4 + 3];
        n++;
      }
    return sum / n;
  };

  it("is cooler in the morning and warmer in the evening", () => {
    const morning = warmthAt(7.5);
    const evening = warmthAt(18);
    expect(evening).toBeGreaterThan(morning + 0.05);
  });

  it("lamplight at night is the warmest of all", () => {
    expect(warmthAt(21)).toBeGreaterThan(warmthAt(12.5));
  });
});
