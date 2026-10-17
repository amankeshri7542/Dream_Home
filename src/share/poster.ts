// The picture WhatsApp, Facebook and others show with a share link: 1200 × 630,
// the home in 3D (or its floor plan, if a 3D snapshot isn't available) with the
// home's name on a warm band. A JPEG kept under the server's 300 KB limit.
import { planImage } from "../domain/export";
import type { Project } from "../domain/types";

export const POSTER = { width: 1200, height: 630, maxBytes: 290_000 };

async function bitmap(blob: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Draws `img` to cover the box, cropping the overflow from its centre. */
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale,
    sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
}
/** Draws `img` whole inside the box, centred. */
function contain(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale,
    dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** `name`: what the link shows (the cleaned name, or "A Dream Home" when the sharer hid it). */
export async function makePoster(project: Project, snapshot: Blob | null, name = project.name): Promise<Blob | null> {
  const { width: W, height: H } = POSTER;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Warm paper, like the app.
  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, "#fbf5ec");
  paper.addColorStop(1, "#efe3d2");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  const shot = snapshot ? await bitmap(snapshot) : null;
  if (shot) cover(ctx, shot, W, H);
  else {
    const plan = await planImage(project, "ft", project.floors[0].id).then(bitmap, () => null);
    if (plan) contain(ctx, plan, 60, 30, W - 120, H - 170);
  }

  // A band along the bottom with the name, readable over any picture.
  const band = ctx.createLinearGradient(0, H - 230, 0, H);
  band.addColorStop(0, "rgba(46, 38, 32, 0)");
  band.addColorStop(0.45, "rgba(46, 38, 32, 0.62)");
  band.addColorStop(1, "rgba(46, 38, 32, 0.82)");
  ctx.fillStyle = band;
  ctx.fillRect(0, H - 230, W, 230);

  // The Dream Home mark: a terracotta tile with a little house.
  const x = 56,
    y = H - 118;
  ctx.fillStyle = "#b5562f";
  ctx.beginPath();
  ctx.roundRect(x, y, 64, 64, 18);
  ctx.fill();
  ctx.fillStyle = "#fbf5ec";
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 34);
  ctx.lineTo(x + 32, y + 17);
  ctx.lineTo(x + 50, y + 34);
  ctx.lineTo(x + 50, y + 50);
  ctx.lineTo(x + 14, y + 50);
  ctx.closePath();
  ctx.fill();

  await document.fonts?.ready.catch(() => undefined);
  ctx.fillStyle = "#fffaf3";
  ctx.textBaseline = "alphabetic";
  ctx.font = '650 46px "Fraunces Variable", Georgia, serif';
  let shown = name;
  while (ctx.measureText(shown).width > W - 200 && shown.length > 4) shown = `${shown.slice(0, -2).trimEnd()}…`;
  ctx.fillText(shown, x + 84, y + 34);
  ctx.font = '600 24px "Figtree Variable", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255, 250, 243, 0.88)";
  ctx.fillText("A 3D home on Dream Home · tap to walk inside", x + 86, y + 66);

  for (const q of [0.86, 0.76, 0.64, 0.5]) {
    const jpeg = await toJpeg(canvas, q);
    if (jpeg && jpeg.size <= POSTER.maxBytes) return jpeg;
  }
  return null;
}
