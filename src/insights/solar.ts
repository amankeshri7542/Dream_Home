// Where the sun is, for a place, a date and a clock time (pure). The NOAA
// solar calculator's equations (after Meeus): good to a fraction of a degree
// for years 1901–2099, with atmospheric refraction near the horizon.
import type { PlotLocation } from "../domain/types";

export type CalendarDate = { year: number; month: number; day: number };
/** Elevation above the horizon and compass bearing (90 = east, 180 = south), degrees. */
export type SolarPosition = { elevation: number; bearing: number };

const DEG = Math.PI / 180;
const sin = (d: number) => Math.sin(d * DEG),
  cos = (d: number) => Math.cos(d * DEG),
  tan = (d: number) => Math.tan(d * DEG);
const asinD = (v: number) => Math.asin(Math.max(-1, Math.min(1, v))) / DEG,
  acosD = (v: number) => Math.acos(Math.max(-1, Math.min(1, v))) / DEG;

/** Julian day at 0h UT of a Gregorian date (1901–2099). */
function julianDay({ year: y, month: m, day: d }: CalendarDate): number {
  return 367 * y - Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4) + Math.floor((275 * m) / 9) + d + 1721013.5;
}

/** The sun's declination (degrees) and the equation of time (minutes) at a Julian day. */
function sunCoordinates(jd: number) {
  const t = (jd - 2451545) / 36525;
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre =
    sin(meanAnom) * (1.914602 - t * (0.004817 + 0.000014 * t)) + sin(2 * meanAnom) * (0.019993 - 0.000101 * t) + sin(3 * meanAnom) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const apparentLong = meanLong + centre - 0.00569 - 0.00478 * sin(omega);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * cos(omega);
  const declination = asinD(sin(obliq) * sin(apparentLong));
  const y = tan(obliq / 2) ** 2;
  const eqTime =
    (4 / DEG) *
    (y * sin(2 * meanLong) -
      2 * eccent * sin(meanAnom) +
      4 * eccent * y * sin(meanAnom) * cos(2 * meanLong) -
      0.5 * y * y * sin(4 * meanLong) -
      1.25 * eccent * eccent * sin(2 * meanAnom));
  return { declination, eqTime };
}

/** India keeps one clock (IST, UTC+5:30); elsewhere, the nearest half hour to solar time. */
export function timeZoneFor({ lat, lon }: Pick<PlotLocation, "lat" | "lon">): number {
  const india = lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 97.5;
  return india ? 5.5 : Math.round((lon / 15) * 2) / 2 + 0;
}

/**
 * The sun at `localHour` (clock time in `timeZone` hours from UTC) on `date`
 * at latitude `lat`, longitude `lon` (degrees, east positive).
 */
export function solarPosition(lat: number, lon: number, date: CalendarDate, localHour: number, timeZone = timeZoneFor({ lat, lon })): SolarPosition {
  const { elevation, bearing } = solarGeometry(lat, lon, date, localHour, timeZone);
  // Refraction lifts the sun a little near the horizon (NOAA's approximation).
  const te = tan(elevation);
  const refraction =
    elevation > 85
      ? 0
      : elevation > 5
        ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
        : elevation > -0.575
          ? 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
          : -20.772 / te;
  return { elevation: elevation + refraction / 3600, bearing };
}

/** The sun's geometric position (no refraction). */
function solarGeometry(lat: number, lon: number, date: CalendarDate, localHour: number, timeZone: number): SolarPosition {
  const jd = julianDay(date) + (localHour - timeZone) / 24;
  const { declination, eqTime } = sunCoordinates(jd);
  const solarMinutes = (((localHour * 60 + eqTime + 4 * lon - 60 * timeZone) % 1440) + 1440) % 1440;
  const hourAngle = solarMinutes / 4 < 0 ? solarMinutes / 4 + 180 : solarMinutes / 4 - 180;
  const zenith = acosD(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle));
  const elevation = 90 - zenith;
  const denominator = cos(lat) * sin(zenith);
  let bearing: number;
  if (Math.abs(denominator) < 1e-9) bearing = lat > 0 ? 180 : 0;
  else {
    const a = acosD((sin(lat) * cos(zenith) - sin(declination)) / denominator);
    bearing = hourAngle > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { elevation, bearing };
}

/** The sun for a plot's location at a local clock hour. */
export const sunAt = (location: Pick<PlotLocation, "lat" | "lon">, date: CalendarDate, hour: number) =>
  solarPosition(location.lat, location.lon, date, hour);

/** Sunrise, solar noon and sunset as local clock hours (null when the sun never rises or sets). */
export function sunTimes(location: Pick<PlotLocation, "lat" | "lon">, date: CalendarDate) {
  // Sunrise is when the sun's top edge clears the horizon: its centre 0.833° below (refraction and its radius).
  const zone = timeZoneFor(location);
  const up = (h: number) => solarGeometry(location.lat, location.lon, date, h, zone).elevation + 0.833;
  // Solar noon: the highest point, found by golden-section search around midday.
  let a = 9,
    b = 15;
  for (let i = 0; i < 40; i++) {
    const c = b - (b - a) * 0.618,
      d = a + (b - a) * 0.618;
    if (up(c) > up(d)) b = d;
    else a = c;
  }
  const noon = (a + b) / 2;
  const cross = (lo: number, hi: number) => {
    if (Math.sign(up(lo)) === Math.sign(up(hi))) return null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(up(mid)) === Math.sign(up(lo))) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { sunrise: cross(noon - 12, noon), noon, sunset: cross(noon, noon + 12) };
}

/** Today's date on this device. */
export function today(now = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
export const isoDate = ({ year, month, day }: CalendarDate) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export function parseIsoDate(text: string | undefined): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

export type Season = "today" | "summer" | "monsoon" | "winter";
export const SEASONS: Record<Season, { label: string; month?: number; day?: number }> = {
  today: { label: "Today" },
  summer: { label: "Summer", month: 6, day: 21 },
  monsoon: { label: "Monsoon", month: 8, day: 15 },
  winter: { label: "Winter", month: 12, day: 21 },
};
export const SEASON_ORDER: Season[] = ["today", "summer", "monsoon", "winter"];
/** The date a season stands for, this year. */
export function seasonDate(season: Season, now = new Date()): CalendarDate {
  const s = SEASONS[season];
  return s.month ? { year: now.getFullYear(), month: s.month, day: s.day! } : today(now);
}

/** "6:45 am", "12:30 pm". */
export function clockLabel(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60) % 24,
    m = total % 60;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}
