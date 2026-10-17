// The plan photo, ready to send: turned upright (EXIF orientation), redrawn
// (which leaves every bit of metadata, GPS included, behind), at most 2000 px
// on its long edge and 1.5 MB as a JPEG.
import { IMAGE } from "./reading";

export type PlanPhoto = { blob: Blob; url: string; width: number; height: number };
export class PhotoProblem extends Error {}

export async function preparePhoto(file: Blob): Promise<PlanPhoto> {
  if (!file.type.startsWith("image/"))
    throw new PhotoProblem("Choose a photo or a screenshot of the plan. For a PDF, take a screenshot of the page.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProblem("That picture couldn't be opened. Try a JPEG or PNG photo.");
  }
  const scale = Math.min(1, IMAGE.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)),
    height = Math.max(1, Math.round(bitmap.height * scale));
  if (Math.min(width, height) < 200) {
    bitmap.close();
    throw new PhotoProblem("That picture is too small to read. Use a bigger, sharper photo.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= IMAGE.maxBytes) break;
  }
  if (!blob || blob.size > IMAGE.maxBytes) throw new PhotoProblem("That photo is too big. Try a smaller one.");
  return { blob, url: URL.createObjectURL(blob), width, height };
}
