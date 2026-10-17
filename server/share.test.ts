import { describe, expect, it } from "vitest";
import { createPreset } from "../src/domain/model";
import type { Project } from "../src/domain/types";
import { memoryBlobs } from "./blob";
import { gunzip, gzip, randomId, randomToken, sameSecret } from "./bytes";
import type { Deps } from "./context";
import { memoryKv } from "./kv";
import { memoryStore } from "./limiter";
import { escapeHtml, ogPage } from "./og";
import { route } from "./router";
import { jpegSize, publicName } from "./share";

const DEVICE = "device-0123456789abcdef";
const ORIGIN = "https://home.example";
const env = { PUBLIC_ORIGIN: ORIGIN, ADMIN_TOKEN: "admin-secret-0123456789abcdef-0123456789abcdef" };
const fresh = (): Deps => ({ kv: memoryKv(), blobs: memoryBlobs(), store: memoryStore() });

const call = (
  deps: Deps,
  path: string,
  init: { method?: string; body?: unknown; raw?: BodyInit; token?: string; ip?: string; type?: string; headers?: Record<string, string> } = {},
) =>
  route(
    new Request(`${ORIGIN}${path}`, {
      method: init.method ?? "GET",
      headers: {
        host: "home.example",
        "x-dream-device": DEVICE,
        "x-forwarded-for": init.ip ?? "1.2.3.4",
        ...(init.body !== undefined || init.raw !== undefined ? { "content-type": init.type ?? "application/json" } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    }),
    env,
    deps,
  );

async function share(deps: Deps, project: Project = createPreset("compact"), extra: Record<string, unknown> = {}) {
  const res = await call(deps, "/api/share", { method: "POST", body: { project, ...extra } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; editToken: string };
}

/** A tiny but well-formed JPEG header with the given size. */
function jpeg(width: number, height: number) {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02,
    0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ]);
}

describe("share links", () => {
  it("shares a home, reads it back cleaned, and never reveals the token", async () => {
    const deps = fresh();
    const home = { ...createPreset("compact"), plot: { ...createPreset("compact").plot, location: { city: "Pune", lat: 18.52, lon: 73.85 } } };
    const { id, editToken } = await share(deps, home);
    expect(id).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(editToken.length).toBeGreaterThanOrEqual(40);
    const res = await call(deps, `/api/share/${id}`);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    const body = await res.json();
    expect(body.meta).toMatchObject({ id, name: home.name, image: false });
    expect(JSON.stringify(body)).not.toContain(editToken);
    expect(body.meta.tokenHash).toBeUndefined();
    // The city is private unless the sharer says otherwise.
    expect(body.project.plot.location).toBeUndefined();
    expect(body.project.floors).toEqual(home.floors);
    const withCity = await share(deps, home, { showCity: true });
    expect((await (await call(deps, `/api/share/${withCity.id}`)).json()).project.plot.location).toEqual(home.plot.location);
    const anonymous = await share(deps, home, { showName: false });
    expect((await (await call(deps, `/api/share/${anonymous.id}`)).json()).project.name).toBe("A Dream Home");
  });

  it("only the token's owner can update, read stats or stop sharing", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps);
    const changed = { ...createPreset("compact"), name: "Our new name" };
    expect((await call(deps, `/api/share/${id}`, { method: "PUT", body: { project: changed } })).status).toBe(403);
    expect((await call(deps, `/api/share/${id}`, { method: "PUT", body: { project: changed }, token: randomToken() })).status).toBe(403);
    expect((await call(deps, `/api/share/${id}`, { method: "PUT", body: { project: changed }, token: editToken })).status).toBe(200);
    expect((await (await call(deps, `/api/share/${id}`)).json()).project.name).toBe("Our new name");
    expect((await call(deps, `/api/share/${id}/stats`)).status).toBe(403);
    expect(await (await call(deps, `/api/share/${id}/stats`, { token: editToken })).json()).toMatchObject({ views: 0, remixes: 0 });
    expect((await call(deps, `/api/share/${id}`, { method: "DELETE" })).status).toBe(403);
    expect((await call(deps, `/api/share/${id}`, { method: "DELETE", token: editToken })).status).toBe(200);
    expect((await call(deps, `/api/share/${id}`)).status).toBe(404);
  });

  it("refuses anything that isn't a valid home, before storing a byte", async () => {
    const deps = fresh();
    const bad: unknown[] = [
      null,
      "home",
      { schemaVersion: 1, name: "Old" },
      { ...createPreset("compact"), floors: "lots" },
      { ...createPreset("compact"), plot: { width: "big" } },
      { ...createPreset("compact"), name: "" },
      JSON.parse('{"schemaVersion":2,"__proto__":{"polluted":true}}'),
    ];
    for (const project of bad) expect((await call(deps, "/api/share", { method: "POST", body: { project } })).status).toBe(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((await call(deps, "/api/share", { method: "POST", raw: "{}", type: "text/plain" })).status).toBe(415);
    expect((await call(deps, "/api/share", { method: "POST", raw: `{"project":"${"x".repeat(1_100_000)}"}` })).status).toBe(413);
    // Other sites can't share in a visitor's name.
    expect(
      (await call(deps, "/api/share", { method: "POST", body: { project: createPreset("compact") }, headers: { origin: "https://evil.example" } }))
        .status,
    ).toBe(403);
  });

  it("strips links and phone numbers from names shown to the world", () => {
    expect(publicName("Sharma Niwas")).toBe("Sharma Niwas");
    expect(publicName("Plot 12 - 2024")).toBe("Plot 12 - 2024");
    expect(publicName("KYC expired call +91 98765 43210 now")).toBe("KYC expired call now");
    expect(publicName("Win at http://scam.example/x")).toBe("Win at");
    expect(publicName("visit www.bad.in today")).toBe("visit today");
    expect(publicName("write to me@x.co")).toBe("write to");
    expect(publicName('"><script>alert(1)</script>')).not.toMatch(/[<>]/);
    expect(publicName("https://only.a.link")).toBe("A Dream Home");
    // Digits in any script, and anything shaped like a web address.
    expect(publicName("Call ९८७६५४३२१० now")).toBe("Call now");
    expect(publicName("win at scam.shop/win")).toBe("win at");
    expect(publicName("see example.dev today")).toBe("see today");
    expect(publicName("Plot No. 12.5, Sector 4")).toBe("Plot No. 12.5, Sector 4");
  });

  it("cleans the remixed-from name too", async () => {
    const deps = fresh();
    const remix = { ...createPreset("compact"), remixOf: { id: "AbCdEfGhIj", name: "Call +91 98765 43210" } };
    const { id } = await share(deps, remix);
    expect((await (await call(deps, `/api/share/${id}`)).json()).meta.remixOf).toEqual({ id: "AbCdEfGhIj", name: "Call" });
  });

  it("an owner's update can't undo a hide or bring back a stopped share", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps);
    const owner = await share(deps);
    expect((await call(deps, `/api/share/${id}/hide`, { method: "POST", token: env.ADMIN_TOKEN })).status).toBe(200);
    // The owner updates and adds a picture after the hide: it stays hidden.
    expect((await call(deps, `/api/share/${id}`, { method: "PUT", token: editToken, body: { project: createPreset("family") } })).status).toBe(200);
    expect((await call(deps, `/api/share/${id}/image`, { method: "PUT", raw: jpeg(1200, 630) as BodyInit, type: "image/jpeg", token: editToken })).status).toBe(200);
    expect((await call(deps, `/api/share/${id}`)).status).toBe(404);
    // A share stopped while a write is on its way (right after the handler read
    // it) doesn't come back: the write finds it gone and tidies up.
    const base = deps.kv!;
    const key = `dh:v1:share:${owner.id}`;
    let stopNext = false;
    const racing: Deps = {
      ...deps,
      kv: {
        ...base,
        async get(k) {
          const value = await base.get(k);
          if (stopNext && k === key) {
            stopNext = false;
            await base.del(k);
          }
          return value;
        },
      },
    };
    stopNext = true;
    const late = await call(racing, `/api/share/${owner.id}/image`, { method: "PUT", raw: jpeg(1200, 630) as BodyInit, type: "image/jpeg", token: owner.editToken });
    expect(late.status).toBe(404);
    expect(await base.get(key)).toBeNull();
    expect(await deps.blobs!.get(`shares/${owner.id}.jpg`)).toBeNull();
  });

  it("limits picture uploads per device and connection", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps);
    const put = () => call(deps, `/api/share/${id}/image`, { method: "PUT", raw: jpeg(1200, 630) as BodyInit, type: "image/jpeg", token: editToken });
    for (let i = 0; i < 40; i++) expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(429);
  });

  it("counts reports and views per network: one person's IPv6 range is one voice", async () => {
    const deps = fresh();
    const { id } = await share(deps);
    for (const ip of ["2001:db8:1:1::1", "2001:db8:1:2::1", "2001:db8:1:3::1", "2001:db8:1:4::1"])
      await call(deps, `/api/share/${id}/report`, { method: "POST", ip });
    expect((await call(deps, `/api/share/${id}`)).status).toBe(200);
  });

  it("counts views and remixes once per connection", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps);
    for (let i = 0; i < 3; i++) await call(deps, `/api/share/${id}/view`, { method: "POST" });
    await call(deps, `/api/share/${id}/view`, { method: "POST", ip: "5.6.7.8" });
    await call(deps, `/api/share/${id}/remix`, { method: "POST" });
    await call(deps, `/api/share/${id}/remix`, { method: "POST" });
    expect(await (await call(deps, `/api/share/${id}/stats`, { token: editToken })).json()).toMatchObject({ views: 2, remixes: 1 });
  });

  it("hides a home reported from several connections, and an admin can bring it back", async () => {
    const deps = fresh();
    const { id } = await share(deps);
    await call(deps, `/api/share/${id}/report`, { method: "POST", ip: "1.1.1.1" });
    await call(deps, `/api/share/${id}/report`, { method: "POST", ip: "1.1.1.1" });
    await call(deps, `/api/share/${id}/report`, { method: "POST", ip: "2.2.2.2" });
    expect((await call(deps, `/api/share/${id}`)).status).toBe(200);
    await call(deps, `/api/share/${id}/report`, { method: "POST", ip: "3.3.3.3" });
    expect((await call(deps, `/api/share/${id}`)).status).toBe(404);
    expect((await call(deps, `/api/share/${id}/unhide`, { method: "POST" })).status).toBe(403);
    // A short admin secret isn't accepted at all.
    expect((await route(new Request(`${ORIGIN}/api/share/${id}/unhide`, { method: "POST", headers: { host: "home.example", authorization: "Bearer short-secret-0123456789abc" } }), { ...env, ADMIN_TOKEN: "short-secret-0123456789abc" }, deps)).status).toBe(403);
    expect((await call(deps, `/api/share/${id}/unhide`, { method: "POST", token: env.ADMIN_TOKEN })).status).toBe(200);
    expect((await call(deps, `/api/share/${id}`)).status).toBe(200);
    expect((await call(deps, `/api/share/${id}/hide`, { method: "POST", token: env.ADMIN_TOKEN })).status).toBe(200);
    expect((await call(deps, `/api/share/${id}`)).status).toBe(404);
    // An admin can remove it entirely.
    expect((await call(deps, `/api/share/${id}`, { method: "DELETE", token: env.ADMIN_TOKEN })).status).toBe(200);
  });

  it("accepts only sensible JPEG pictures, and serves them sandboxed", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps);
    const put = (raw: Uint8Array, type = "image/jpeg", token = editToken) =>
      call(deps, `/api/share/${id}/image`, { method: "PUT", raw: raw as BodyInit, type, token });
    expect((await call(deps, `/api/share/${id}/image`)).status).toBe(404);
    expect((await put(jpeg(1200, 630), "image/jpeg", "")).status).toBe(403);
    expect((await put(new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(400);
    expect((await put(jpeg(1200, 630), "image/png")).status).toBe(415);
    expect((await put(jpeg(5000, 630))).status).toBe(400);
    expect((await put(new Uint8Array(400_000).fill(0xff))).status).toBe(413);
    expect((await put(jpeg(1200, 630))).status).toBe(200);
    const res = await call(deps, `/api/share/${id}/image`);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(jpegSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  });

  it("gives link-preview robots a tiny, escaped page", async () => {
    const deps = fresh();
    const { id, editToken } = await share(deps, { ...createPreset("compact"), name: 'Nest "&" <b>' });
    await call(deps, `/api/share/${id}/image`, { method: "PUT", raw: jpeg(1200, 630) as BodyInit, type: "image/jpeg", token: editToken });
    const res = await call(deps, `/api/og?id=${id}`);
    const html = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/h/${id}">`);
    expect(html).toContain(`content="${ORIGIN}/api/share/${id}/image?v=`);
    expect(html).toContain('summary_large_image');
    expect(html).not.toMatch(/<b>|<script/);
    expect(html).toContain("&quot;&amp;&quot;");
    // Unknown links get a generic page, not an error.
    expect(await (await call(deps, "/api/og?id=nothing123")).text()).toContain("Dream Home — design your home in 3D");
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(ogPage({ title: "x", url: "https://h" })).not.toContain("og:image");
  });

  it("refuses to run without storage on Vercel", async () => {
    const res = await route(new Request(`${ORIGIN}/api/share/abcdefghij`), { VERCEL: "1" }, {});
    expect(res.status).toBe(503);
  });

  it("has helpers that are safe by construction", async () => {
    expect(randomId()).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(new Set(Array.from({ length: 200 }, () => randomId())).size).toBe(200);
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
    const big = await gzip("a".repeat(2_000_000));
    await expect(gunzip(big, 1_000_000)).rejects.toThrow();
    expect(await gunzip(await gzip("hello"), 100)).toBe("hello");
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
