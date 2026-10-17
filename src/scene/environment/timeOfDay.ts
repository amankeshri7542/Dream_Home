// Time of day (pure). Sun path: sunrise 6, sunset 19, d = (h − 6)/13,
// elevation = 62°·sin(πd), bearing = 90 + 180d (E → S → W), rotated by the
// plot's north (clockwise degrees from plan-up −z to true north). At night a
// cool, dim moon sits opposite at 35°. Palettes interpolate in linear space.
// With a place and a date the sun is the real one (NOAA); the palette and the
// night then follow its true height, so a winter 5:15 pm in Delhi is dusk.
import { Color } from "three";
import { solarPosition, type CalendarDate } from "../../insights/solar";

export type Palette = {
  zenith: Color;
  horizon: Color;
  /** Backdrop / hemisphere ground tint. */
  ground: Color;
  sun: Color;
  sunIntensity: number;
  windowGlow: number;
  hemiSky: Color;
  hemiIntensity: number;
  fill: Color;
  fillIntensity: number;
  envIntensity: number;
  exposure: number;
};

type Key = {
  hour: number;
  zenith: string;
  horizon: string;
  ground: string;
  sun: string;
  sunIntensity: number;
  windowGlow: number;
  hemiSky: string;
  hemiIntensity: number;
  fill: string;
  fillIntensity: number;
  envIntensity: number;
  exposure: number;
};

const NIGHT: Omit<Key, "hour"> = {
  zenith: "#10182e",
  horizon: "#2b3552",
  ground: "#1b2236",
  sun: "#a8bcff",
  sunIntensity: 0.55,
  windowGlow: 1,
  hemiSky: "#4a5c90",
  hemiIntensity: 0.55,
  fill: "#6f86c8",
  fillIntensity: 0.16,
  envIntensity: 0.2,
  exposure: 1.15,
};
export const KEYFRAMES: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT },
  {
    hour: 6,
    zenith: "#9fb6d8",
    horizon: "#f6c9a0",
    ground: "#cdb9a2",
    sun: "#ffb37a",
    sunIntensity: 1.6,
    windowGlow: 0.3,
    hemiSky: "#c9d3e6",
    hemiIntensity: 0.42,
    fill: "#a9bde0",
    fillIntensity: 0.2,
    envIntensity: 0.32,
    exposure: 1.05,
  },
  {
    hour: 8.5,
    zenith: "#8fb8e0",
    horizon: "#f3e3c8",
    ground: "#d9cdb6",
    sun: "#ffe2b8",
    sunIntensity: 3.1,
    windowGlow: 0,
    hemiSky: "#dfe8f2",
    hemiIntensity: 0.5,
    fill: "#b8cbe6",
    fillIntensity: 0.24,
    envIntensity: 0.36,
    exposure: 1,
  },
  {
    hour: 12.5,
    zenith: "#7fb0e3",
    horizon: "#e9eef0",
    ground: "#d7d2c2",
    sun: "#fff4e2",
    sunIntensity: 3.4,
    windowGlow: 0,
    hemiSky: "#e6eef6",
    hemiIntensity: 0.52,
    fill: "#bfd0ea",
    fillIntensity: 0.24,
    envIntensity: 0.36,
    exposure: 0.96,
  },
  {
    hour: 17,
    zenith: "#94a9cf",
    horizon: "#f8c78f",
    ground: "#d8bf9c",
    sun: "#ffb46b",
    sunIntensity: 2.9,
    windowGlow: 0.1,
    hemiSky: "#d9d6e2",
    hemiIntensity: 0.44,
    fill: "#9fb4dc",
    fillIntensity: 0.3,
    envIntensity: 0.32,
    exposure: 1.02,
  },
  {
    hour: 19,
    zenith: "#4b5a8a",
    horizon: "#e89a7a",
    ground: "#8c7a83",
    sun: "#ff8a5c",
    sunIntensity: 1.0,
    windowGlow: 0.8,
    hemiSky: "#8d93b8",
    hemiIntensity: 0.4,
    fill: "#7f90c8",
    fillIntensity: 0.2,
    envIntensity: 0.25,
    exposure: 1.05,
  },
  { hour: 21, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const SUNRISE = 6,
  SUNSET = 19;
const DEG = Math.PI / 180;

export const normalizeHour = (h: number) => ((h % 24) + 24) % 24;

export type SunPosition = {
  /** Degrees above the horizon (negative = below). */
  elevation: number;
  /** Compass bearing, degrees (90 = east, 180 = south). */
  bearing: number;
};

/** True sun position for an hour (elevation may be ≤ 0 outside daylight). */
export function sunPosition(hour: number): SunPosition {
  const h = normalizeHour(hour);
  const d = (h - SUNRISE) / (SUNSET - SUNRISE);
  return { elevation: 62 * Math.sin(Math.PI * d), bearing: 90 + 180 * d };
}

/** Unit direction toward a light at (bearing, elevation), rotated by plot north. */
export function directionFrom(bearing: number, elevation: number, north: number): [number, number, number] {
  const a = (north + bearing) * DEG,
    e = elevation * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 by day … 1 at night (moon key light weight). */
export function nightFactor(hour: number): number {
  const h = normalizeHour(hour);
  if (h >= 12) return smooth(18.6, 20.2, h);
  return 1 - smooth(4.8, 6.4, h);
}

export type Lighting = {
  hour: number;
  /** Direction toward the key light (sun or moon), world space. */
  keyDir: [number, number, number];
  /** Direction toward the true sun (for the sky disc). */
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  elevation: number;
  night: number;
  palette: Palette;
};

function interpolate(hour: number): Palette {
  const h = normalizeHour(hour);
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1].hour <= h) i++;
  const a = KEYFRAMES[i],
    b = KEYFRAMES[i + 1];
  const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
  // Smooth the blend so the keyframes are gentle plateaus.
  const s = t * t * (3 - 2 * t);
  const col = (x: string, y: string) => new Color(x).lerp(new Color(y), s);
  const num = (x: number, y: number) => x + (y - x) * s;
  return {
    zenith: col(a.zenith, b.zenith),
    horizon: col(a.horizon, b.horizon),
    ground: col(a.ground, b.ground),
    sun: col(a.sun, b.sun),
    sunIntensity: num(a.sunIntensity, b.sunIntensity),
    windowGlow: num(a.windowGlow, b.windowGlow),
    hemiSky: col(a.hemiSky, b.hemiSky),
    hemiIntensity: num(a.hemiIntensity, b.hemiIntensity),
    fill: col(a.fill, b.fill),
    fillIntensity: num(a.fillIntensity, b.fillIntensity),
    envIntensity: num(a.envIntensity, b.envIntensity),
    exposure: num(a.exposure, b.exposure),
  };
}

/** A place and a date: the sun is the real one. */
export type SunContext = { lat: number; lon: number; date: CalendarDate };

/**
 * The stylised hour whose sun stands as high as the real one, on the same
 * side of noon: it picks the sky colours and how much night it is.
 */
export function paletteHour(elevation: number, morning: boolean): number {
  const x = Math.asin(Math.max(-1, Math.min(1, elevation / 62))) / Math.PI;
  return morning ? SUNRISE + (SUNSET - SUNRISE) * x : SUNSET - (SUNSET - SUNRISE) * x;
}

export function lighting(hour: number, north = 0, place?: SunContext | null): Lighting {
  const clock = normalizeHour(hour);
  const real = place ? solarPosition(place.lat, place.lon, place.date, clock) : null;
  const sun = real ?? sunPosition(clock);
  // East of the meridian is morning; around midnight the clock decides.
  const east = Math.sin(sun.bearing * DEG);
  const h = real ? paletteHour(real.elevation, Math.abs(east) > 0.2 ? east > 0 : clock < 12) : clock;
  const sunDir = directionFrom(sun.bearing, sun.elevation, north);
  // Clamp the key light above 7° so dawn/dusk shadows stay readable.
  const keySun = directionFrom(sun.bearing, Math.max(7, sun.elevation), north);
  // Moon: opposite bearing to where the sun would be, 35° up.
  const moonDir = directionFrom(sun.bearing + 180, 35, north);
  const night = nightFactor(h);
  const mix: [number, number, number] = [
    keySun[0] * (1 - night) + moonDir[0] * night,
    keySun[1] * (1 - night) + moonDir[1] * night,
    keySun[2] * (1 - night) + moonDir[2] * night,
  ];
  const len = Math.hypot(...mix) || 1;
  const keyDir: [number, number, number] = [mix[0] / len, mix[1] / len, mix[2] / len];
  if (keyDir[1] < 0.12) {
    keyDir[1] = 0.12;
    const l2 = Math.hypot(...keyDir);
    keyDir[0] /= l2;
    keyDir[1] /= l2;
    keyDir[2] /= l2;
  }
  return { hour: clock, keyDir, sunDir, moonDir, elevation: sun.elevation, night, palette: interpolate(h) };
}

/** 15-minute bucket used to rebuild the environment map sparingly. */
export const envBucket = (hour: number) => Math.round(normalizeHour(hour) * 4);
