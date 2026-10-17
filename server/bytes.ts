// Small byte helpers for the share routes: gzip with a size cap, hashing,
// random ids and tokens, and a timing-safe comparison. Web APIs only, so the
// same code runs on Vercel, in Vite's dev server and in tests.

async function pipe(bytes: Uint8Array, stream: GenericTransformStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new RangeError("Too big.");
    }
    chunks.push(value);
  }
  return concat(chunks, total);
}

export function concat(chunks: Uint8Array[], total = chunks.reduce((n, c) => n + c.byteLength, 0)) {
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export const gzip = (text: string) => pipe(new TextEncoder().encode(text), new CompressionStream("gzip"), Infinity);
/** Unzips, refusing anything that would grow past `limit` bytes (no zip bombs). */
export const gunzip = async (bytes: Uint8Array, limit: number) =>
  new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip"), limit));

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** A short unguessable id (10 base-62 characters, about 59 bits). */
export function randomId(length = 10): string {
  const out: string[] = [];
  // Rejection sampling keeps every character equally likely.
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2)))
      if (b < 248 && out.length < length) out.push(BASE62[b % 62]);
  }
  return out.join("");
}

/** A long secret (32 random bytes, base64url). */
export function randomToken(): string {
  let binary = "";
  for (const b of crypto.getRandomValues(new Uint8Array(32))) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares two strings in time that doesn't depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
