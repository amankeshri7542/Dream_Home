// The words over the reel: the title, room names and the end card, painted
// on a 2D canvas that the compositor lays over the frames (it fades them).
// Sizes follow the frame's width. Nothing sits in the bottom fifth or against
// the right edge, where Reels, Shorts and Status put their own buttons.
import { brandMark } from "../photo/encode";
import type { ReelShot } from "./path";
import { qrModules } from "./qr";

export type Words = { title: string; link: string | null; appUrl: string; score?: { value: number; badges: string[] } | null };

const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Figtree Variable", system-ui, sans-serif';
const CREAM = "#fffaf3";

/** The app's fonts, before any words are painted. */
export async function loadFonts() {
  await Promise.all([document.fonts?.load(`600 48px ${SERIF}`), document.fonts?.load(`700 24px ${SANS}`)]).catch(() => undefined);
}

/** Splits text into at most two lines that fit, shrinking the font if it must. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, font: (px: number) => string) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let px = size; px >= size * 0.5; px *= 0.94) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxWidth) return { lines: [text], px };
    // The most even break into two lines.
    let best: string[] | null = null,
      widest = Infinity;
    for (let k = 1; k < words.length; k++) {
      const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (w < widest) [best, widest] = [lines, w];
    }
    if (best && widest <= maxWidth) return { lines: best, px };
  }
  ctx.font = font(size * 0.5);
  return { lines: [text], px: size * 0.5 };
}

function shadowed(ctx: CanvasRenderingContext2D, blur: number, draw: () => void) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = blur * 0.15;
  draw();
  ctx.restore();
}

const spaced = (text: string) => text.toUpperCase().split("").join(" ");

function title(ctx: CanvasRenderingContext2D, W: number, H: number, u: number, words: Words) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CREAM;
  const top = H * 0.14;
  shadowed(ctx, 18 * u, () => {
    ctx.font = `700 ${22 * u}px ${SANS}`;
    ctx.fillText(spaced("Our dream home"), W / 2, top);
  });
  const { lines, px } = fit(ctx, words.title, W * 0.84, 78 * u, (p) => `600 ${p}px ${SERIF}`);
  shadowed(ctx, 26 * u, () => lines.forEach((line, i) => ctx.fillText(line, W / 2, top + px * 1.1 * (i + 1))));
}

function roomLabel(ctx: CanvasRenderingContext2D, W: number, H: number, u: number, room: NonNullable<ReelShot["room"]>) {
  const x = 40 * u,
    pad = 22 * u;
  const { lines, px } = fit(ctx, room.name, W * 0.66, 46 * u, (p) => `600 ${p}px ${SERIF}`);
  const eyebrow = room.floorName ? 30 * u : 0;
  const h = pad * 2 + eyebrow + px * 1.12 * lines.length;
  ctx.font = `600 ${px}px ${SERIF}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 120 * u) + pad * 2;
  const y = H * 0.74 - h;
  ctx.fillStyle = "rgba(28, 20, 14, 0.52)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22 * u);
  ctx.fill();
  ctx.fillStyle = "#b5562f";
  ctx.fillRect(x, y + 18 * u, 5 * u, h - 36 * u);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CREAM;
  if (room.floorName) {
    ctx.font = `700 ${19 * u}px ${SANS}`;
    ctx.globalAlpha = 0.82;
    ctx.fillText(spaced(room.floorName), x + pad, y + pad + 18 * u);
    ctx.globalAlpha = 1;
  }
  ctx.font = `600 ${px}px ${SERIF}`;
  lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + eyebrow + px * (0.92 + 1.12 * i)));
}

function endCard(ctx: CanvasRenderingContext2D, W: number, H: number, u: number, words: Words) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CREAM;
  const { lines, px } = fit(ctx, words.title, W * 0.84, 62 * u, (p) => `600 ${p}px ${SERIF}`);
  const titleTop = H * 0.15;
  shadowed(ctx, 22 * u, () => lines.forEach((line, i) => ctx.fillText(line, W / 2, titleTop + px * 1.1 * i)));
  // "Designed on Dream Home", with the mark.
  const by = titleTop + px * 1.1 * (lines.length - 1) + 64 * u;
  ctx.font = `650 ${28 * u}px ${SANS}`;
  const label = "Designed on Dream Home";
  const mark = 40 * u,
    gap = 12 * u;
  const width = mark + gap + ctx.measureText(label).width;
  const left = (W - width) / 2;
  brandMark(ctx, left, by - mark * 0.78, mark);
  ctx.fillStyle = CREAM;
  ctx.textAlign = "left";
  shadowed(ctx, 12 * u, () => ctx.fillText(label, left + mark + gap, by));
  // The Home score: a ring with the number, and up to two badges.
  let below = by;
  if (words.score) {
    const r = 24 * u,
      cy = by + 60 * u;
    ctx.font = `750 ${26 * u}px ${SANS}`;
    const label = `Home score ${words.score.value}`;
    const width = r * 2 + 12 * u + ctx.measureText(label).width;
    const cx = (W - width) / 2 + r;
    ctx.save();
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = "rgba(255, 250, 243, 0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#f4bc55";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * words.score.value) / 100);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = CREAM;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    shadowed(ctx, 12 * u, () => ctx.fillText(label, cx + r + 12 * u, cy));
    ctx.textBaseline = "alphabetic";
    below = cy + r;
    const badges = words.score.badges.slice(0, 2);
    if (badges.length) {
      ctx.textAlign = "center";
      const { px } = fit(ctx, badges.join("  ·  "), W * 0.86, 22 * u, (p) => `650 ${p}px ${SANS}`);
      ctx.font = `650 ${px}px ${SANS}`;
      ctx.fillStyle = "#f4bc55";
      shadowed(ctx, 10 * u, () => ctx.fillText(badges.join("  ·  "), W / 2, below + 34 * u));
      below += 40 * u;
    }
  }
  // The QR code on a white tile, with its quiet zone.
  const target = words.link ?? words.appUrl;
  const modules = qrModules(target);
  const n = modules.length + 8;
  const cell = Math.floor((300 * u) / n);
  const tile = cell * n;
  const tx = Math.round((W - tile) / 2),
    ty = Math.round(below + 48 * u);
  shadowed(ctx, 24 * u, () => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(tx - 6 * u, ty - 6 * u, tile + 12 * u, tile + 12 * u, 22 * u);
    ctx.fill();
  });
  ctx.fillStyle = "#1d1714";
  modules.forEach((row, r) => row.forEach((dark, c) => dark && ctx.fillRect(tx + (c + 4) * cell, ty + (r + 4) * cell, cell, cell)));
  // The link in words, under the code.
  ctx.textAlign = "center";
  ctx.fillStyle = CREAM;
  const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const lead = words.link ? "Walk around it in 3D" : "Design yours at";
  const address = words.link ? bare(words.link) : bare(words.appUrl);
  const ly = ty + tile + 62 * u;
  shadowed(ctx, 12 * u, () => {
    ctx.font = `650 ${26 * u}px ${SANS}`;
    ctx.fillText(lead, W / 2, ly);
    const { px: small } = fit(ctx, address, W * 0.86, 30 * u, (p) => `750 ${p}px ${SANS}`);
    ctx.font = `750 ${small}px ${SANS}`;
    ctx.fillText(address, W / 2, ly + 42 * u);
  });
}

/** Paints a shot's words (or nothing) on a clear canvas of the video's size. */
export function paintWords(ctx: CanvasRenderingContext2D, shot: ReelShot, words: Words) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const u = W / 720;
  if (shot.kind === "establish") title(ctx, W, H, u, words);
  else if (shot.kind === "room" && shot.room) roomLabel(ctx, W, H, u, shot.room);
  else if (shot.kind === "end") endCard(ctx, W, H, u, words);
}
