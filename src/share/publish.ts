// Making a home's share link: create it, remember it on this device, then add
// its preview picture (best effort; a link without a picture still works).
// The share sheet and the reel studio both make links this way.
import type { Project } from "../domain/types";
import { createShare, uploadPoster, type ShareOptions } from "./api";
import { fingerprint, saveLink, type ShareLink } from "./links";
import { makePoster } from "./poster";

export async function publishHome(
  project: Project,
  homeId: string,
  options: ShareOptions,
  /** A snapshot of the 3D view for the link's preview picture. */
  capture: () => Promise<Blob | null>,
  onStep?: (text: string) => void,
): Promise<{ ok: true; link: ShareLink } | { ok: false; message: string }> {
  const res = await createShare(project, options);
  if (!res.ok) return { ok: false, message: res.message };
  const link: ShareLink = { id: res.id, token: res.editToken, updatedAt: res.updatedAt, ...options, fingerprint: fingerprint(project) };
  saveLink(homeId, link);
  onStep?.("Adding a picture…");
  await addPicture(project, link, capture);
  return { ok: true, link };
}

/** The preview picture: best effort, never blocks sharing. */
export async function addPicture(project: Project, link: Pick<ShareLink, "id" | "token">, capture: () => Promise<Blob | null>) {
  const poster = await makePoster(project, await capture().catch(() => null)).catch(() => null);
  if (poster) await uploadPoster(link.id, link.token, poster);
}
