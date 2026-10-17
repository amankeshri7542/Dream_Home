// Films the reel (lazy: this module, mediabunny and the QR encoder load only
// when a video is made).
//
// For each shot the editor shows the shot's view and light (`setScene`) and
// the scene settles. Then every frame: idle life (fans, the cat, street life)
// steps on the video's own clock, the photo pipeline draws the frame offline
// from the shot's moving camera, the compositor adds the dissolve and the
// words, and the pixels go to the live thumbnail, which is also the H.264
// encoder's canvas. The music goes in as AAC alongside. Frames are never kept,
// so memory stays flat. Nothing is drawn on screen while filming.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { DirectionalLight, PerspectiveCamera, type Object3D, type Scene, type WebGLRenderer } from "three";
import type { Project } from "../domain/types";
import { createPipeline, type Pipeline } from "../photo/render";
import { MOODS } from "../photo/settings";
import type { SceneStore } from "../scene/store";
import { createCompositor } from "./compositor";
import { SAMPLE_RATE, makeMusic } from "./music";
import { loadFonts, paintWords } from "./overlay";
import { overlayAlpha, ramp, reelPath, scrimAt, shotCamera, type ReelShot } from "./path";
import { FPS, REEL_FOV, reelTestHook, type ReelJobRequest, type ReelProgress, type ReelScene } from "./settings";

export type FilmContext = {
  gl: WebGLRenderer;
  scene: Scene;
  store: SceneStore;
  /** R3F's advance: runs every frame callback without drawing on screen. */
  advance: (timestamp: number) => void;
  project: Project;
  job: ReelJobRequest;
  /** Shows a shot's view and light in the editor. */
  setScene: (scene: ReelScene) => void;
  /** The scene the canvas has caught up with. */
  shownScene: () => string | null;
  onProgress: (progress: ReelProgress) => void;
  /** Cancelled, or the graphics context was lost. */
  stopped: () => boolean;
};
export type FilmResult = { blob: Blob; audio: boolean; seconds: number; ms: number } | { error: "cancelled" | "failed" | "unsupported" };

class FilmStopped extends Error {
  override name = "FilmStopped";
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Resolves once the page is visible again (filming pauses while it's hidden). */
const visible = () =>
  new Promise<void>((resolve) => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", check);
      resolve();
    };
    document.addEventListener("visibilitychange", check);
    check();
  });
/** Keeps the screen on while filming (where the browser allows it). */
const wakeLock = async () => (await navigator.wakeLock?.request("screen").catch(() => null)) ?? null;

/** A bitrate that keeps a 15 s reel between about 6 and 12 MB. */
const bitrateFor = (width: number) => (width >= 1000 ? 6e6 : width >= 700 ? 4.5e6 : 1.5e6);

/** The biggest video size this browser can encode as H.264, or null. */
async function videoSize(job: ReelJobRequest) {
  if (reelTestHook()?.noVideo) return null;
  const sizes = [[job.width, job.height]];
  if (job.width > 720) sizes.push([720, 1280]);
  for (const [width, height] of sizes) {
    const bitrate = bitrateFor(width);
    if (await canEncodeVideo("avc", { width, height, frameRate: FPS, quality: new Quality({ bitrate }) }).catch(() => false))
      return { width, height, bitrate };
  }
  return null;
}

function findSun(scene: Scene): DirectionalLight | null {
  let sun: DirectionalLight | null = null;
  scene.traverse((o: Object3D) => {
    if (!sun && o instanceof DirectionalLight && o.castShadow) sun = o;
  });
  return sun;
}

export async function film(context: FilmContext): Promise<FilmResult> {
  const { gl, scene, store, job } = context;
  const begun = performance.now();
  const size = await videoSize(job);
  if (!size) return { error: "unsupported" };
  const { width: W, height: H } = size;
  const music = job.music === "none" ? null : job.music;
  const withMusic =
    !!music &&
    (await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: SAMPLE_RATE, quality: new Quality({ bitrate: 128e3 }) }).catch(
      () => false,
    ));
  const path = reelPath(context.project, { aspect: W / H, style: job.style, mood: job.mood, livedIn: job.livedIn, seconds: job.seconds });
  const total = Math.max(1, Math.round(path.seconds * FPS));
  const words = { title: job.title, link: job.link, appUrl: job.appUrl, score: job.score ?? null };

  // The live thumbnail is the encoder's own canvas.
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const thumb = canvas.getContext("2d")!;
  const image = thumb.createImageData(W, H);
  const pixels = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", quality: new Quality({ bitrate: size.bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: FPS });
  const sound = withMusic ? new AudioBufferSource({ codec: "aac", quality: new Quality({ bitrate: 128e3 }) }) : null;
  if (sound) output.addAudioTrack(sound);
  output.setMetadataTags({ title: job.title });
  const track = sound && music ? makeMusic(music, path.seconds) : null;
  let fed = 0;
  /** Music up to `until` seconds, a second at a time, alongside the frames. */
  const feed = async (until: number) => {
    if (!sound || !track) return;
    const end = Math.min(track.left.length, Math.round(until * track.sampleRate));
    while (fed < end) {
      const n = Math.min(track.sampleRate, end - fed);
      const buffer = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: track.sampleRate });
      buffer.copyToChannel(track.left.slice(fed, fed + n), 0);
      buffer.copyToChannel(track.right.slice(fed, fed + n), 1);
      await sound.add(buffer);
      fed += n;
    }
  };

  const camera = new PerspectiveCamera(REEL_FOV, W / H, 0.1, 900);
  const compositor = createCompositor(gl, W, H);
  // Idle animation runs on the video's clock; R3F's own clock only moves forward.
  let clock = path.shots[0]?.start ?? 0;
  store.setClock(() => clock);
  let stamp = 0;
  const step = () => context.advance((stamp += 1 / FPS));
  let lock = await wakeLock();
  let samples = Math.max(1, Math.round(job.samples));
  const test = reelTestHook();
  const frames: { kind: string; jpeg: string }[] = [];
  let pipeline: Pipeline | null = null;
  let shown: string | null = null;
  let frame = 0;
  let reported = 0;
  const report = (status: string, now = false) => {
    if (!now && performance.now() - reported < 120) return;
    reported = performance.now();
    context.onProgress({ fraction: frame / total, status, canvas });
  };
  const check = () => {
    if (context.stopped()) throw new FilmStopped();
  };

  /** Shows a shot's view and light, then lets it settle (sky, lamps, details still loading). */
  async function show(shot: ReelShot) {
    // Once stopped, the editor's view is the studio's again: never take it back.
    check();
    context.setScene({ key: shot.scene, view: shot.view, hour: shot.hour });
    for (let i = 0; context.shownScene() !== shot.scene; i++) {
      check();
      if (i > 600) throw new Error("The scene never changed for the reel.");
      await nextFrame();
    }
    let quiet = 0;
    for (let i = 0; quiet < 3 && (i < 150 || (store.isLoading() && i < 600)); i++) {
      check();
      step();
      await nextFrame();
      quiet = store.isAnimating() || store.isLoading() ? 0 : quiet + 1;
    }
    shown = shot.scene;
  }

  try {
    await loadFonts();
    await output.start();
    const paced = { since: 0, frames: 0 };
    for (const [index, shot] of path.shots.entries()) {
      const first = Math.round(shot.start * FPS);
      const end = index === path.shots.length - 1 ? total : Math.round((shot.start + shot.duration) * FPS);
      report(shot.status, true);
      clock = shot.start;
      if (shot.scene !== shown) await show(shot);
      pipeline = createPipeline({ gl, scene, camera, width: W, height: H, sun: findSun(scene), shadowSize: job.shadowSize, aoHalfRes: job.aoHalfRes });
      paintWords(compositor.words, shot, words);
      compositor.wordsChanged();
      const finish = MOODS[shot.finish].finish;
      const mood = { exposure: gl.toneMappingExposure, ...finish, bloom: finish.bloom * (shot.glow ?? 1) };
      let finished = null;
      for (let f = first; f < end; f++, frame++) {
        check();
        if (document.visibilityState !== "visible") {
          await visible();
          if (!lock || lock.released) lock = await wakeLock();
        }
        const t = f / FPS,
          tau = t - shot.start;
        clock = t;
        step();
        const at = shotCamera(shot, tau / shot.duration);
        camera.position.set(...at.position);
        camera.lookAt(...at.target);
        camera.updateMatrixWorld();
        // The camera moves but the sun doesn't: shadows are drawn once per shot.
        for (let s = 0; s < samples; s++) pipeline.sample(s, { shadows: f === first && s === 0 });
        finished = pipeline.finish(mood);
        const out = compositor.compose(finished.texture, {
          fade: shot.fadeIn > 0 ? ramp(0, shot.fadeIn, tau) : 1,
          wordsAlpha: overlayAlpha(shot, tau),
          scrim: scrimAt(shot, tau),
        });
        await pipeline.read(out, pixels);
        thumb.putImageData(image, 0, 0);
        await feed(t + 1);
        await video.add(t, 1 / FPS);
        if (test?.capture && f === Math.floor((first + end - 1) / 2)) frames.push({ kind: shot.kind, jpeg: canvas.toDataURL("image/jpeg", 0.85) });
        // Fewer samples if filming would run past its time budget (never more).
        // Only steady frames count: a shot's first few compile shaders and draw shadows.
        if (f - first < 3) {
          paced.since = performance.now();
          paced.frames = 0;
        } else paced.frames++;
        if (samples > 1 && paced.frames >= 12) {
          const perFrame = (performance.now() - paced.since) / paced.frames;
          if (performance.now() - begun + perFrame * (total - frame) > job.budget * 1000) samples--;
          paced.since = performance.now();
          paced.frames = 0;
        }
        report(shot.status);
      }
      if (finished) compositor.keep(finished.texture);
      pipeline.dispose();
      pipeline = null;
    }
    context.onProgress({ fraction: 1, status: "Putting your video together…", canvas });
    await feed(Infinity);
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error("The video came out empty.");
    const ms = Math.round(performance.now() - begun);
    if (test) {
      const g = globalThis as { __dreamHomeReelFrames?: unknown; __dreamHomeReelStats?: unknown };
      g.__dreamHomeReelFrames = frames;
      g.__dreamHomeReelStats = { ms, frames: total, width: W, height: H, samples, audio: !!sound, shots: path.shots.map((s) => s.kind) };
    }
    return { blob: new Blob([buffer], { type: "video/mp4" }), audio: !!sound, seconds: path.seconds, ms };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
    if (error instanceof FilmStopped) return { error: "cancelled" };
    console.error("reel failed", error);
    return { error: "failed" };
  } finally {
    pipeline?.dispose();
    compositor.dispose();
    store.setClock(null);
    void lock?.release().catch(() => undefined);
  }
}
