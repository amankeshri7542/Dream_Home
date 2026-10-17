// Little sounds and buzzes that make edits feel physical: a soft pop when
// something changes, a click for undo, a low "bonk" when something won't fit,
// a chime for celebrations. All generated with WebAudio (no files to load),
// quiet by design, and off when the "Sounds & vibration" setting is off.

let enabled = true;
let context: AudioContext | null = null;

export function setFeedbackEnabled(on: boolean) {
  enabled = on;
  if (!on) void context?.suspend().catch(() => undefined);
}

function audio(): AudioContext | null {
  if (!enabled || typeof AudioContext === "undefined") return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

type Tone = { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number };
function tone(frequency: number, seconds: number, { type = "sine", gain = 0.035, slideTo, delay = 0 }: Tone = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
  // A quick rise and a soft tail, so nothing clicks.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

function buzz(pattern: number | number[]) {
  if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* Some browsers refuse vibration without a recent tap; that's fine. */
  }
}

export const feedback = {
  /** Something changed. */
  pop() {
    tone(620, 0.09, { slideTo: 880 });
    buzz(8);
  },
  /** Undo, redo, small navigation. */
  click() {
    tone(420, 0.05, { type: "triangle", gain: 0.025 });
  },
  /** That didn't work. */
  error() {
    tone(230, 0.16, { type: "triangle", slideTo: 170, gain: 0.04 });
    buzz([18, 40, 18]);
  },
  /** A celebration. */
  success() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.16, { delay: i * 0.09, gain: 0.03 }));
    buzz(15);
  },
};
