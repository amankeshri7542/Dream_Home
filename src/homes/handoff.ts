// Moving homes to Dream Home's new address. Homes live in the browser, which
// keeps them per website, so the old address hands the open home to the new
// one inside the link's #fragment (fragments never reach any server). The new
// address offers to add it to My homes.
import { parseProject } from "../domain/model";
import type { Project } from "../domain/types";

/** The app's public address, set at build time (VITE_PUBLIC_ORIGIN). */
export const NEW_ORIGIN: string = (import.meta.env?.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";

/** Links longer than this don't survive every browser; a backup file is offered instead. */
export const MAX_LINK = 1_500_000;
const IMPORT = "#import=";

/** Only the old vercel.app address offers the move, and only once the new one is set. */
export function offersMove(location: { origin: string; hostname: string }, target = NEW_ORIGIN): boolean {
  return !!target && location.origin !== target && location.hostname.endsWith(".vercel.app");
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};
/** Runs bytes through a (de)compression stream, stopping once the output passes `limit`. */
async function pipe(bytes: Uint8Array, stream: GenericTransformStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // A tiny link can't be allowed to unpack into gigabytes.
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error("That home is too big to open.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A home packed for a link: gzip where the browser can, plain JSON otherwise. */
export async function packHome(project: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(project));
  if (typeof CompressionStream !== "undefined")
    return `g.${toBase64Url(await pipe(json, new CompressionStream("gzip")))}`;
  return `j.${toBase64Url(json)}`;
}

/** Unpacks and fully validates a home from a link. Throws on anything unexpected. */
export async function unpackHome(packed: string): Promise<Project> {
  if (packed.length > MAX_LINK) throw new Error("That home is too big to move by link.");
  const [kind, data] = [packed.slice(0, 2), packed.slice(2)];
  let bytes: Uint8Array = fromBase64Url(data);
  if (kind === "g.") bytes = await pipe(bytes, new DecompressionStream("gzip"), 1_000_000);
  else if (kind !== "j.") throw new Error("That link doesn't hold a home.");
  if (bytes.length > 1_000_000) throw new Error("That home is too big to open.");
  return parseProject(new TextDecoder().decode(bytes));
}

export const moveLink = (packed: string, target = NEW_ORIGIN) => `${target}/${IMPORT}${packed}`;

/** The packed home in this page's address, if it arrived by a move link. */
export const importFragment = (hash: string) => (hash.startsWith(IMPORT) ? hash.slice(IMPORT.length) : null);
