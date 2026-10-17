// Look card pictures (public/looks/<id>.webp, `npm run looks:thumbs`): the
// same two-storey sample home in each look, photographed with the
// render-quality photo renderer (LabApp's `lookThumb` sets the light and the
// camera), then shrunk to WebP.
import { withStylePreset } from "../../domain/materials";
import { suggestBalcony } from "../../domain/openSpaces";
import type { Project, StylePreset } from "../../domain/types";
import { TEMPLATES, buildTemplate } from "../../onboarding/templates";

/** A two-storey villa with parking, a garden and a front balcony, in a look. */
export function lookSample(look: StylePreset): Project {
  const template = TEMPLATES.find((t) => t.id === "villa")!;
  const built = buildTemplate(template, { floors: 2 });
  if (!built.ok) throw new Error(built.error);
  let home: Project = { ...built.project, name: "Look sample", parking: true, garden: true };
  const balcony = suggestBalcony(home, home.floors[1].id, home.plot.road, 300, 120);
  if (balcony.ok) home = balcony.project;
  return withStylePreset(home, look);
}

/** A JPEG photo → a `width`-pixel-wide WebP data URL. */
export async function toWebp(photo: Blob, width: number, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((bitmap.height / bitmap.width) * width);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", quality);
}
