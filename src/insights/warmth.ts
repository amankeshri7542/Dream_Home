// The colour of light through the day (pure): cool, bluish daylight in the
// morning, neutral at midday, warm amber in the evening and under the lamps.
// Used to tint a room's light and its lamps, so scrubbing from 6 am to 8 pm
// changes the mood as well as the direction of the light.

/** Kelvin for an hour of the day, given how high the sun is (degrees) and how lit the lamps are (0–1). */
export function lightTemperature(hour: number, elevation: number, lamps: number): number {
  // Daylight: high sun reads near 5800 K; a morning sun is cool (sky-blue fill), an evening one warm.
  const morning = hour < 12.5;
  const low = 1 - Math.min(1, Math.max(0, elevation / 35));
  const day = morning ? 5800 + 700 * low : 5800 - 2600 * low;
  // Lamplight takes over as it gets dark.
  const k = Math.min(1, Math.max(0, lamps));
  return day * (1 - k) + 2700 * k;
}

/**
 * Linear RGB of a black body at `kelvin`, normalised so green is 1 (Tanner
 * Helland's fit, linearised). 6500 K is close to white.
 */
export function kelvinRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const lin = (c: number) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const out: [number, number, number] = [lin(r), lin(g), lin(b)];
  const g1 = out[1] || 1;
  return [out[0] / g1, 1, out[2] / g1];
}

/** How warm a colour is: red over blue (1 is neutral). */
export const warmthOf = (rgb: readonly number[]) => rgb[0] / Math.max(1e-4, rgb[2]);
