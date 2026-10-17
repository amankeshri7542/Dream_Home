// Share links: a home anyone with the link can see in 3D.
//
//   POST   /api/share                  {project, showName?, showCity?} → {id, editToken}
//   GET    /api/share/:id              → {meta, project}          (public, cacheable)
//   PUT    /api/share/:id              update (Authorization: Bearer <editToken>)
//   DELETE /api/share/:id              stop sharing (edit token, or ADMIN_TOKEN)
//   PUT    /api/share/:id/image        the preview picture, JPEG (edit token)
//   GET    /api/share/:id/image        the preview picture (public)
//   GET    /api/share/:id/stats        views and remixes (edit token)
//   POST   /api/share/:id/view|remix   counted once per connection
//   POST   /api/share/:id/report       a visitor reports the home
//   POST   /api/share/:id/hide|unhide  ADMIN_TOKEN only
//
// Every shared home is re-validated with the app's own parser and stored in
// its cleaned-up form, never as sent. Links are unguessable; editing needs the
// secret token only the sharer's device keeps (stored here as a hash).
import { parseProject } from "../src/domain/model";
import { SHARE_ID } from "../src/domain/persist";
import type { Project } from "../src/domain/types";
import type { BlobStore } from "./blob";
import { gunzip, gzip, randomId, randomToken, sameSecret, sha256 } from "./bytes";
import { blobsFor, kvFor, limiterFor, type Deps } from "./context";
import { BodyTooLarge, clientIp, deviceOf, fail, json, readBody, readBytes, type Env } from "./http";
import type { KeyValue } from "./kv";

export const LIMITS = {
  /** A home as JSON, as sent. */
  projectBytes: 1_000_000,
  /** The same home gzipped, as stored. */
  storedBytes: 200_000,
  /** The preview picture. */
  imageBytes: 300_000,
  imageSide: 1600,
};
const DAY = 24 * 3600;

export type ShareMeta = {
  tokenHash: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bytes: number;
  appVersion: string;
  image: boolean;
  hidden: boolean;
  hiddenReason?: "reports" | "admin";
  remixOf?: { id: string; name: string };
};

const keys = (id: string) => ({
  meta: `dh:v1:share:${id}`,
  views: `dh:v1:share:${id}:views`,
  remixes: `dh:v1:share:${id}:remixes`,
  reports: `dh:v1:share:${id}:reports`,
  seen: (what: string, ip: string) => `dh:v1:share:${id}:seen:${what}:${ip}`,
});
const files = (id: string) => ({ project: `shares/${id}.json.gz`, image: `shares/${id}.jpg` });

/**
 * A name that's safe to show anyone: no links, phone numbers or e-mail
 * addresses (a shared home must never become a scam advert on our domain).
 */
export function publicName(name: string, fallback = "A Dream Home"): string {
  const cleaned = name
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "")
    .replace(/\b[\w-]+\.(?:com|in|net|org|io|co|me|ly|app|xyz|info|biz)\b\S*/gi, "")
    // Phone numbers: runs of 8 or more digits (spaces and dashes allowed), not "Plot 12 - 2024".
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (run) => (run.replace(/\D/g, "").length >= 8 ? "" : run))
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned.length >= 2 ? cleaned : fallback;
}

/** Width and height from a JPEG's start-of-frame marker, or null if it isn't a JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

type Prepared = { project: Project; gz: Uint8Array };
/** Validates a home exactly as the app would load it, then applies the sharer's privacy choices. */
async function prepare(request: Request): Promise<Prepared | Response> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return fail("invalid", "Send the home as JSON.", undefined, 415);
  let text: string;
  try {
    text = await readBody(request, LIMITS.projectBytes + 2_000);
  } catch (error) {
    return error instanceof BodyTooLarge
      ? fail("too-big", "This home is too big to share.", undefined, 413)
      : fail("invalid", "That request isn't readable.", undefined, 400);
  }
  let body: { project?: unknown; showName?: unknown; showCity?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail("invalid", "That request isn't readable.", undefined, 400);
  }
  const raw = body.project as { schemaVersion?: unknown } | undefined;
  // Old-format files are migrated on a person's own device, never from strangers here.
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 2)
    return fail("invalid", "That isn't a Dream Home home.", undefined, 400);
  let project: Project;
  try {
    project = parseProject(JSON.stringify(raw));
  } catch (error) {
    return fail("invalid", `That home couldn’t be shared: ${error instanceof Error ? error.message : "it isn’t valid"}`, undefined, 400);
  }
  const plot = { ...project.plot };
  if (body.showCity !== true) delete plot.location;
  project = { ...project, plot, name: body.showName === false ? "A Dream Home" : publicName(project.name) };
  const gz = await gzip(JSON.stringify(project));
  if (gz.byteLength > LIMITS.storedBytes) return fail("too-big", "This home is too big to share.", undefined, 413);
  return { project, gz };
}

async function readMeta(kv: KeyValue, id: string): Promise<ShareMeta | null> {
  const text = await kv.get(keys(id).meta);
  if (!text) return null;
  try {
    return JSON.parse(text) as ShareMeta;
  } catch {
    return null;
  }
}
const writeMeta = (kv: KeyValue, id: string, meta: ShareMeta) => kv.set(keys(id).meta, JSON.stringify(meta));

const bearer = (request: Request) => request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
const isAdmin = (request: Request, env: Env) =>
  !!env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24 && sameSecret(bearer(request), env.ADMIN_TOKEN);
async function isOwner(request: Request, meta: ShareMeta) {
  const token = bearer(request);
  return token.length >= 32 && sameSecret(await sha256(token), meta.tokenHash);
}

/** What the public may know about a share. */
const publicMeta = (id: string, m: ShareMeta) => ({
  id,
  name: m.name,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  appVersion: m.appVersion,
  image: m.image,
  ...(m.remixOf ? { remixOf: m.remixOf } : {}),
});

const missing = () => fail("missing", "This home isn’t available.", undefined, 404);
const offline = () => fail("offline", "Sharing isn’t switched on yet.", undefined, 503);

export async function handleShare(request: Request, env: Env, deps: Deps, params: string[] = []): Promise<Response> {
  const kv = kvFor(env, deps);
  const blobs = blobsFor(env, deps);
  if (!kv || !blobs) return offline();
  const [id, action, ...rest] = params;
  if (rest.length) return missing();
  if (id === undefined) {
    if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
    return create(request, env, deps, kv, blobs);
  }
  if (!SHARE_ID.test(id)) return missing();
  const now = (deps.now ?? (() => new Date()))().getTime();

  switch (action) {
    case undefined: {
      if (request.method === "GET") return read(request, env, deps, kv, blobs, id);
      const meta = await readMeta(kv, id);
      if (!meta) return missing();
      if (request.method === "DELETE") {
        if (!(isAdmin(request, env) || (await isOwner(request, meta))))
          return fail("forbidden", "Only the person who shared this home can stop sharing it.", undefined, 403);
        await blobs.remove(files(id).project, files(id).image).catch(() => undefined);
        const k = keys(id);
        await kv.del(k.meta, k.views, k.remixes, k.reports);
        return json({ ok: true });
      }
      if (request.method !== "PUT") return fail("invalid", "Use GET, PUT or DELETE.", undefined, 405);
      if (!(await isOwner(request, meta)))
        return fail("forbidden", "Only the person who shared this home can update it.", undefined, 403);
      const limited = await reserve(request, env, deps, "share");
      if (limited) return limited;
      const prepared = await prepare(request);
      if (prepared instanceof Response) return prepared;
      await blobs.put(files(id).project, prepared.gz, "application/gzip");
      await writeMeta(kv, id, { ...meta, name: prepared.project.name, updatedAt: now, bytes: prepared.gz.byteLength });
      return json({ ok: true, id, updatedAt: now });
    }
    case "image":
      return image(request, kv, blobs, id);
    case "stats": {
      const meta = await readMeta(kv, id);
      if (!meta) return missing();
      if (!(await isOwner(request, meta))) return fail("forbidden", "Only the sharer can see this.", undefined, 403);
      const [views, remixes] = await kv.counts(keys(id).views, keys(id).remixes);
      return json({ ok: true, views, remixes, hidden: meta.hidden });
    }
    case "view":
    case "remix": {
      if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
      const meta = await readMeta(kv, id).catch(() => null);
      if (!meta || meta.hidden) return missing();
      // Once per connection per few hours, so a reload storm doesn't count.
      const first = await kv
        .set(keys(id).seen(action, clientIp(request)), "1", { ttl: action === "view" ? 6 * 3600 : DAY, onlyIfNew: true })
        .catch(() => false);
      if (first) await kv.incr(action === "view" ? keys(id).views : keys(id).remixes).catch(() => undefined);
      return json({ ok: true });
    }
    case "report":
      return report(request, env, deps, kv, id);
    case "hide":
    case "unhide": {
      if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
      if (!isAdmin(request, env)) return fail("forbidden", "Admins only.", undefined, 403);
      const meta = await readMeta(kv, id);
      if (!meta) return missing();
      const hidden = action === "hide";
      await writeMeta(kv, id, { ...meta, hidden, ...(hidden ? { hiddenReason: "admin" as const } : { hiddenReason: undefined }) });
      if (!hidden) await kv.del(keys(id).reports);
      return json({ ok: true, hidden });
    }
    default:
      return missing();
  }
}

/** Takes one use of `kind` for this device and connection, or answers why not. */
async function reserve(request: Request, env: Env, deps: Deps, kind: "share" | "report"): Promise<Response | null> {
  const device = deviceOf(request);
  if (!device) return fail("invalid", "Missing device id.", undefined, 400);
  const limiter = limiterFor(env, deps);
  if (!limiter) return offline();
  try {
    const verdict = await limiter.reserve(kind, device, clientIp(request));
    if (!verdict.ok) return fail("limit", "That’s a lot of sharing for one day. Try again tomorrow.", 0, 429);
  } catch (error) {
    console.error("share limit store", error);
    return fail("busy", "Sharing is busy right now. Please try again.", undefined, 503);
  }
  return null;
}

async function create(request: Request, env: Env, deps: Deps, kv: KeyValue, blobs: BlobStore) {
  const limited = await reserve(request, env, deps, "share");
  if (limited) return limited;
  const prepared = await prepare(request);
  if (prepared instanceof Response) return prepared;
  const now = (deps.now ?? (() => new Date()))().getTime();
  let id = randomId();
  // Collisions are astronomically unlikely, but never overwrite someone's home.
  for (let i = 0; i < 3 && (await kv.get(keys(id).meta)); i++) id = randomId();
  const token = randomToken();
  await blobs.put(files(id).project, prepared.gz, "application/gzip");
  const meta: ShareMeta = {
    tokenHash: await sha256(token),
    name: prepared.project.name,
    createdAt: now,
    updatedAt: now,
    bytes: prepared.gz.byteLength,
    appVersion: (env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
    image: false,
    hidden: false,
    ...(prepared.project.remixOf ? { remixOf: prepared.project.remixOf } : {}),
  };
  await writeMeta(kv, id, meta);
  return json({ ok: true, id, editToken: token, updatedAt: now }, 201);
}

async function read(request: Request, env: Env, deps: Deps, kv: KeyValue, blobs: BlobStore, id: string) {
  // Reads are limited per connection only, and never blocked by a limits hiccup.
  const limiter = limiterFor(env, deps);
  const verdict = await limiter?.reserve("read", "-", clientIp(request)).catch(() => null);
  if (verdict && !verdict.ok) return fail("busy", "Too many homes opened from here today.", undefined, 429);
  const meta = await readMeta(kv, id);
  if (!meta || meta.hidden) return missing();
  const gz = await blobs.get(files(id).project);
  if (!gz) return missing();
  let project: string;
  try {
    project = await gunzip(gz, LIMITS.projectBytes);
  } catch {
    return missing();
  }
  // The stored home was validated when shared; it goes out as stored.
  return new Response(`{"ok":true,"meta":${JSON.stringify(publicMeta(id, meta))},"project":${project}}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      // A viral link is served by the CDN, not one function call per visitor.
      "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
    },
  });
}

async function image(request: Request, kv: KeyValue, blobs: BlobStore, id: string) {
  const meta = await readMeta(kv, id);
  if (!meta) return missing();
  if (request.method === "GET") {
    if (meta.hidden || !meta.image) return missing();
    const bytes = await blobs.get(files(id).image);
    if (!bytes) return missing();
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  }
  if (request.method !== "PUT") return fail("invalid", "Use GET or PUT.", undefined, 405);
  if (!(await isOwner(request, meta)))
    return fail("forbidden", "Only the person who shared this home can change its picture.", undefined, 403);
  if (!(request.headers.get("content-type") ?? "").startsWith("image/jpeg"))
    return fail("invalid", "Send the picture as a JPEG.", undefined, 415);
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(request, LIMITS.imageBytes);
  } catch {
    return fail("too-big", "That picture is too big.", undefined, 413);
  }
  const size = jpegSize(bytes);
  if (!size || size.width > LIMITS.imageSide || size.height > LIMITS.imageSide || !size.width || !size.height)
    return fail("invalid", "That picture isn’t a JPEG of a sensible size.", undefined, 400);
  await blobs.put(files(id).image, bytes, "image/jpeg");
  await writeMeta(kv, id, { ...meta, image: true });
  return json({ ok: true });
}

async function report(request: Request, env: Env, deps: Deps, kv: KeyValue, id: string) {
  if (request.method !== "POST") return fail("invalid", "Use POST.", undefined, 405);
  const limited = await reserve(request, env, deps, "report");
  if (limited) return limited;
  const meta = await readMeta(kv, id);
  if (!meta) return missing();
  // Distinct connections, not device ids (which anyone can invent).
  const reporters = await kv.addToSet(keys(id).reports, clientIp(request));
  const [views] = await kv.counts(keys(id).views);
  if (!meta.hidden && reporters >= 3 && reporters >= views * 0.05) {
    await writeMeta(kv, id, { ...meta, hidden: true, hiddenReason: "reports" });
    console.warn(JSON.stringify({ share: id, hidden: "reports", reporters, views }));
  }
  return json({ ok: true });
}
