// Rendered pixels → a JPEG, with an optional small "Dream Home" mark.
import type { PhotoPixels } from "./render";

/** Draws the Dream Home mark and name in the bottom-right corner. */
function watermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = Math.max(18, Math.round(Math.min(w, h) * 0.035));
  const pad = Math.round(s * 0.9);
  ctx.font = `650 ${Math.round(s * 0.62)}px "Fraunces Variable", Georgia, serif`;
  const label = "Dream Home";
  const textW = ctx.measureText(label).width;
  const x = w - pad - s - s * 0.35 - textW,
    y = h - pad - s;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = s * 0.4;
  ctx.fillStyle = "#b5562f";
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fbf5ec";
  ctx.beginPath();
  ctx.moveTo(x + s * 0.22, y + s * 0.54);
  ctx.lineTo(x + s * 0.5, y + s * 0.28);
  ctx.lineTo(x + s * 0.78, y + s * 0.54);
  ctx.lineTo(x + s * 0.78, y + s * 0.8);
  ctx.lineTo(x + s * 0.22, y + s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = s * 0.3;
  ctx.fillStyle = "#fffaf3";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + s * 1.35, y + s * 0.52);
  ctx.restore();
}

export async function toJpeg({ width, height, pixels }: PhotoPixels, { mark }: { mark: boolean }): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // GPU rows come bottom-up.
  const image = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  ctx.putImageData(image, 0, 0);
  if (mark) {
    await document.fonts?.ready.catch(() => undefined);
    watermark(ctx, width, height);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/** The fallback: the live picture, cropped to the shape, as a JPEG. */
export async function cropToJpeg(source: Blob, aspect: number, { mark }: { mark: boolean }): Promise<Blob | null> {
  const bitmap = await createImageBitmap(source);
  let w = bitmap.width,
    h = Math.round(w / aspect);
  if (h > bitmap.height) {
    h = bitmap.height;
    w = Math.round(h * aspect);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, w, h);
  bitmap.close();
  if (mark) watermark(ctx, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
