// Music for the reel, made from scratch by simple synthesis: no samples and
// no borrowed tunes, so it is royalty-free by construction. It is pure and
// deterministic (seeded noise), sounds the same on every device, and returns
// plain sample arrays; the reel wraps them in an AudioBuffer for the encoder.
//
// Every melody uses raag Bhupali's five notes (Sa Re Ga Pa Dha).
//  - Warm morning: a tanpura-like drone, a soft pad and a bell melody.
//  - Festive: dholak-like drums, bright plucked strings and handclaps.
//  - Calm night: a slow pad, a quiet drone and slow bells.
import type { ReelMusic } from "./settings";

export const SAMPLE_RATE = 48000;
export type Track = { sampleRate: number; left: Float32Array; right: Float32Array };

/** Sa, the tonic: D3. */
const SA = 146.83;
const BHUPALI = [0, 2, 4, 7, 9];
/** The frequency of a Bhupali degree (0 = Sa, 5 = upper Sa, −1 = lower Dha…). */
export function swara(degree: number): number {
  const i = ((degree % 5) + 5) % 5;
  const octave = Math.floor(degree / 5);
  return SA * 2 ** ((BHUPALI[i] + 12 * octave) / 12);
}

/** A small seeded random generator (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mix = { left: Float32Array; right: Float32Array; rate: number; random: () => number };

/** Equal-power pan: −1 left … 1 right. */
const gains = (pan: number): [number, number] => {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

/**
 * A sine partial with an attack and an exponential decay, added in place. A
 * recursive oscillator (one multiply-add a sample) keeps long notes cheap.
 */
function partial(mix: Mix, start: number, freq: number, amp: number, decay: number, pan: number, attack = 0.004, length = decay * 5) {
  const { rate, left, right } = mix;
  const s0 = Math.max(0, Math.round(start * rate));
  const s1 = Math.min(left.length, Math.round((start + length) * rate));
  if (freq >= rate / 2 || s1 <= s0) return;
  const w = (2 * Math.PI * freq) / rate;
  const k = 2 * Math.cos(w);
  let y1 = 0,
    y2 = -Math.sin(w);
  const fall = Math.exp(-1 / (decay * rate));
  const rise = Math.max(1, attack * rate);
  const [gl, gr] = gains(pan);
  let env = amp;
  for (let n = s0, i = 0; n < s1; n++, i++) {
    const y = k * y1 - y2;
    y2 = y1;
    y1 = y;
    const a = i < rise ? i / rise : 1;
    const v = y * env * a;
    left[n] += v * gl;
    right[n] += v * gr;
    env *= fall;
  }
}

/** A tanpura-like pluck: many harmonics, the higher ones fading first. */
function tanpura(mix: Mix, start: number, freq: number, amp: number, pan: number) {
  for (let h = 1; h <= 8; h++) {
    // A hair of detune between harmonics gives the string its shimmer.
    partial(mix, start, freq * h * (1 + 0.0007 * h), (amp / h ** 0.9) * (h === 1 ? 0.8 : 1), 2.2 / (1 + 0.18 * h), pan, 0.01, 4.5);
  }
}

/** A bell: inharmonic partials, the high ones short. */
function bell(mix: Mix, start: number, freq: number, amp: number, pan: number, ring = 1) {
  const ratios = [1, 2, 2.76, 5.4, 8.93];
  const levels = [1, 0.32, 0.45, 0.2, 0.1];
  const decays = [1.6, 1.1, 0.8, 0.45, 0.25];
  ratios.forEach((r, i) => partial(mix, start, freq * r, amp * levels[i], decays[i] * ring, pan, 0.002, decays[i] * ring * 5));
}

/** A soft pad: two slightly detuned sines per note that swell in and out. */
function pad(mix: Mix, start: number, end: number, freqs: number[], amp: number) {
  const { rate, left, right } = mix;
  const s0 = Math.max(0, Math.round(start * rate));
  const s1 = Math.min(left.length, Math.round(end * rate));
  const swell = 1.4 * rate;
  freqs.forEach((f, j) => {
    for (const [detune, pan] of [
      [0.9975, -0.5],
      [1.0025, 0.5],
    ]) {
      const w = (2 * Math.PI * f * detune) / rate;
      const k = 2 * Math.cos(w);
      let y1 = Math.sin(j),
        y2 = Math.sin(j - w);
      const [gl, gr] = gains(pan);
      for (let n = s0; n < s1; n++) {
        const y = k * y1 - y2;
        y2 = y1;
        y1 = y;
        const e = Math.min(1, (n - s0) / swell, (s1 - n) / swell);
        const v = y * amp * e * e;
        left[n] += v * gl;
        right[n] += v * gr;
      }
    }
  });
}

/** A plucked string (Karplus–Strong) from seeded noise. */
function pluck(mix: Mix, start: number, freq: number, amp: number, pan: number, length = 0.9) {
  const { rate, left, right, random } = mix;
  const period = Math.max(2, Math.round(rate / freq));
  const line = new Float32Array(period);
  let prev = 0;
  for (let i = 0; i < period; i++) {
    // Slightly smoothed noise: bright, not harsh.
    prev = prev * 0.4 + (random() * 2 - 1) * 0.6;
    line[i] = prev;
  }
  const s0 = Math.max(0, Math.round(start * rate));
  const s1 = Math.min(left.length, Math.round((start + length) * rate));
  const [gl, gr] = gains(pan);
  for (let n = s0, i = 0; n < s1; n++, i++) {
    const j = i % period;
    const v = line[j];
    line[j] = 0.5 * (v + line[(j + 1) % period]) * 0.997;
    const fade = Math.min(1, (s1 - n) / (0.05 * rate));
    left[n] += v * amp * gl * fade;
    right[n] += v * amp * gr * fade;
  }
}

/** Seeded noise through a two-pole resonator: the slap of a hand on a drum or a clap. */
function noiseHit(mix: Mix, start: number, centre: number, q: number, amp: number, decay: number, pan: number) {
  const { rate, left, right, random } = mix;
  const s0 = Math.max(0, Math.round(start * rate));
  const s1 = Math.min(left.length, s0 + Math.round(decay * 6 * rate));
  const w = (2 * Math.PI * centre) / rate;
  const r = Math.exp(-w / (2 * q));
  const a1 = 2 * r * Math.cos(w),
    a2 = -r * r;
  let y1 = 0,
    y2 = 0;
  const fall = Math.exp(-1 / (decay * rate));
  const [gl, gr] = gains(pan);
  let env = amp * (1 - r);
  for (let n = s0; n < s1; n++) {
    const y = (random() * 2 - 1) * env + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    left[n] += y * gl;
    right[n] += y * gr;
    env *= fall;
  }
}

/** The dholak's bass side: a thump whose pitch falls. */
function thump(mix: Mix, start: number, amp: number, from = 150, to = 72) {
  const { rate, left, right } = mix;
  const s0 = Math.max(0, Math.round(start * rate));
  const s1 = Math.min(left.length, s0 + Math.round(0.42 * rate));
  let phase = 0;
  for (let n = s0, i = 0; n < s1; n++, i++) {
    const t = i / rate;
    const f = to + (from - to) * Math.exp(-t / 0.045);
    phase += (2 * Math.PI * f) / rate;
    const v = Math.sin(phase) * amp * Math.exp(-t / 0.12) * Math.min(1, i / 48);
    left[n] += v;
    right[n] += v;
  }
}

function warmMorning(mix: Mix, seconds: number) {
  // A tanpura cycle: Pa (low) – Sa – Sa – Sa (low), unhurried.
  const cycle = 3.2;
  for (let c = 0; c * cycle < seconds; c++) {
    const t = c * cycle;
    tanpura(mix, t, swara(-2), 0.11, -0.3);
    tanpura(mix, t + 0.8, swara(0), 0.09, 0.2);
    tanpura(mix, t + 1.6, swara(0), 0.09, 0.25);
    tanpura(mix, t + 2.4, swara(-5), 0.12, -0.2);
  }
  pad(mix, 0, seconds, [swara(0), swara(3), swara(5)], 0.018);
  // Bells in the upper octave, phrases rising and settling home to Sa.
  const beat = 60 / 76;
  const phrases = [
    [[2, 1], [3, 1], [4, 1], [3, 0.5], [2, 0.5], [1, 1], [2, 1], [0, 2]],
    [[3, 1], [4, 1], [5, 1], [4, 0.5], [3, 0.5], [2, 1], [1, 1], [0, 2]],
  ];
  let t = 1.6;
  for (let p = 0; t < seconds - 1; p++)
    for (const [degree, beats] of phrases[p % 2]) {
      if (t >= seconds - 1) break;
      bell(mix, t, swara(degree + 10), 0.07, (degree - 2) * 0.12);
      t += beats * beat;
    }
}

function festive(mix: Mix, seconds: number) {
  const step = 60 / 112 / 2;
  // A keherwa-like eight-step pattern: bass, treble, or both.
  const bass = [1, 1, 0, 0, 0, 0, 1, 0];
  const treble = [1, 0, 1, 0.5, 1, 0.5, 1, 1];
  const arp = [0, 2, 3, 5, 3, 2, 4, 3];
  for (let i = 0; i * step < seconds; i++) {
    const t = i * step,
      s = i % 8,
      bar = Math.floor(i / 8);
    if (bass[s]) thump(mix, t, 0.34);
    if (treble[s]) {
      noiseHit(mix, t, 2400, 6, 0.5 * treble[s], 0.035, 0.25);
      partial(mix, t, 520, 0.08 * treble[s], 0.06, 0.25, 0.001, 0.3);
    }
    // Handclaps on the two and the four, after the first bar.
    if (bar >= 1 && (s === 2 || s === 6)) for (const d of [0, 0.011, 0.023]) noiseHit(mix, t + d, 1500, 1.4, 0.55, 0.03, -0.2);
    pluck(mix, t, swara(arp[s] + 5 + (bar % 4 === 3 && s > 3 ? 1 : 0)), 0.16, s % 2 ? 0.35 : -0.35, 0.7);
    if (s === 0) bell(mix, t, swara(bar % 2 ? 12 : 10), 0.05, 0, 0.7);
  }
  pad(mix, 0, seconds, [swara(0), swara(3)], 0.012);
}

function calmNight(mix: Mix, seconds: number) {
  pad(mix, 0, seconds, [swara(0), swara(2), swara(3)], 0.022);
  const cycle = 4.2;
  for (let c = 0; c * cycle < seconds; c++) {
    tanpura(mix, c * cycle, swara(-2), 0.05, -0.3);
    tanpura(mix, c * cycle + 1.05, swara(0), 0.045, 0.3);
    tanpura(mix, c * cycle + 2.1, swara(0), 0.045, 0.25);
    tanpura(mix, c * cycle + 3.15, swara(-5), 0.06, -0.25);
  }
  const notes = [5, 4, 2, 3, 5, 2, 3, 4];
  for (let i = 0, t = 0.9; t < seconds - 1.2; i++, t += 1.8) bell(mix, t, swara(notes[i % notes.length] + 5), 0.06, i % 2 ? 0.3 : -0.3, 1.8);
}

/** Peak after normalising: −1 dBFS. */
export const PEAK = 0.891;

/**
 * `seconds` of the chosen music at 48 kHz stereo: faded in and out and
 * normalised to −1 dBFS, so it never clips. "none" is silence.
 */
export function makeMusic(kind: ReelMusic, seconds: number, rate = SAMPLE_RATE): Track {
  const length = Math.max(1, Math.round(seconds * rate));
  const mix: Mix = { left: new Float32Array(length), right: new Float32Array(length), rate, random: seeded(0x6d68) };
  if (kind === "morning") warmMorning(mix, seconds);
  else if (kind === "festive") festive(mix, seconds);
  else if (kind === "night") calmNight(mix, seconds);
  const fadeIn = Math.min(0.25, seconds / 8) * rate,
    fadeOut = Math.min(1.5, seconds / 4) * rate;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const g = Math.min(1, n / fadeIn, (length - 1 - n) / fadeOut);
    mix.left[n] *= g;
    mix.right[n] *= g;
    peak = Math.max(peak, Math.abs(mix.left[n]), Math.abs(mix.right[n]));
  }
  if (peak > 0) {
    const k = PEAK / peak;
    for (let n = 0; n < length; n++) {
      mix.left[n] *= k;
      mix.right[n] *= k;
    }
  }
  return { sampleRate: rate, left: mix.left, right: mix.right };
}
