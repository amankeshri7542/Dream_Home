// Small HTTP helpers shared by every route: JSON answers, a body reader that
// stops early when a request is too big, the caller's IP and device id, and a
// same-site check for requests that change things.

/** Every environment variable the server reads. All optional. */
export type Env = Partial<
  Record<
    | "ANTHROPIC_API_KEY"
    | "AI_MODEL"
    | "AI_DAILY_BUDGET_USD"
    | "AI_DISABLED"
    | "KV_REST_API_URL"
    | "KV_REST_API_TOKEN"
    | "PUBLIC_ORIGIN"
    | "ALLOWED_ORIGINS"
    | "VERCEL"
    | "VERCEL_GIT_COMMIT_SHA"
    | "BLOB_READ_WRITE_TOKEN"
    | "ADMIN_TOKEN"
    | `LIMIT_${string}`,
    string
  >
>;

export const DEVICE = /^[a-z0-9-]{16,64}$/;

/** On Vercel (preview or production) the server must not fall back to in-memory limits. */
export const onVercel = (env: Env) => env.VERCEL === "1";

const API_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...headers } });

export type FailReason = "limit" | "busy" | "offline" | "invalid" | "forbidden" | "missing" | "too-big";

/** The site's public address: PUBLIC_ORIGIN, or the host this request came to. */
export function publicOrigin(request: Request, env: Env): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
export const fail = (reason: FailReason, message: string, left?: number, status = 200) =>
  json({ ok: false, reason, message, ...(left !== undefined ? { left } : {}) }, status);

export class BodyTooLarge extends Error {}

/** Reads a request body as bytes, giving up as soon as it passes `maxBytes`. */
export async function readBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new BodyTooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
}

/**
 * Reads a request body as text, giving up as soon as it passes `maxBytes`
 * (a lying or missing Content-Length can't make the server buffer more).
 */
export async function readBody(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytes(request, maxBytes));
}

/** Expands an IPv6 address to its eight 16-bit groups, or null if it isn't one. */
function ipv6Groups(ip: string): number[] | null {
  if (!/^[0-9a-f:.]+$/i.test(ip) || !ip.includes(":")) return null;
  const [head, tail, ...rest] = ip.split("::");
  if (rest.length) return null;
  const part = (s: string | undefined) => (s ? s.split(":") : []);
  const left = part(head),
    right = part(tail);
  // An embedded IPv4 tail ("::ffff:1.2.3.4") counts as two groups.
  const last = right.length ? right : left;
  if (last.length && last[last.length - 1].includes(".")) {
    const v4 = last.pop()!.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !(n >= 0 && n <= 255))) return null;
    last.push(((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16));
  }
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill("0"), ...right].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Who is calling, for per-connection limits. IPv6 users get a whole /64 (one
 * home or phone; the low bits rotate freely), IPv4 the exact address.
 */
export function clientIp(request: Request): string {
  const raw = (
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    ""
  ).trim();
  if (!raw) return "local";
  const groups = ipv6Groups(raw);
  if (!groups) return raw.slice(0, 64);
  // IPv4-mapped (::ffff:a.b.c.d) is really IPv4.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff)
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

export const deviceOf = (request: Request) => {
  const device = request.headers.get("x-dream-device") ?? "";
  return DEVICE.test(device) ? device : null;
};

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/**
 * Requests that change things must come from our own pages. A browser always
 * sends Origin on such requests; tools that omit it are still held by the
 * per-device, per-IP and budget limits.
 */
export function sameSite(request: Request, env: Env): boolean {
  if (SAFE.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (host === own) return true;
  const allowed = [env.PUBLIC_ORIGIN, ...(env.ALLOWED_ORIGINS ?? "").split(",")]
    .map((o) => o?.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}
