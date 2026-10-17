// The shared server platform: HTTP helpers, routing, limits, pricing and the
// security headers that vercel.json ships.
import { describe, expect, it, vi } from "vitest";
import vercel from "../vercel.json" with { type: "json" };
import { plannerHomePlan } from "../src/ai/planner";
import type { HomeBrief } from "../src/ai/brief";
import Anthropic from "@anthropic-ai/sdk";
import { BilledError, DesignRefused, billOf, costOf, priceOf, supportsFallback, type CallClaude } from "./claude";
import { limiterFor } from "./context";
import { handleDesign } from "./design";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS, vercelHeaders } from "./headers";
import { BodyTooLarge, clientIp, readBody, sameSite } from "./http";
import { DEFAULT_RULES, Limiter, RESERVE_SCRIPT, memoryStore, restStore, rulesFrom } from "./limiter";
import { route, routeName } from "./router";

const DEVICE = "device-0123456789abcdef";
const brief: HomeBrief = {
  plot: { w: 30, d: 50 },
  facing: "east",
  family: "couple",
  bedrooms: 2,
  floors: "auto",
  musts: [],
  vibe: "indian-modern",
};
const env = { ANTHROPIC_API_KEY: "test-key" };
const ok: CallClaude = async () => ({ json: plannerHomePlan(brief), costUsd: 0.05, model: "claude-opus-5-5" });
const request = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(`https://home.example${path}`, {
    ...init,
    headers: { "x-dream-device": DEVICE, host: "home.example", ...init.headers },
  });
const design = (headers: Record<string, string> = {}) =>
  request("/api/design", { method: "POST", headers, body: JSON.stringify({ kind: "home", brief }) });

describe("HTTP helpers", () => {
  it("stops reading a body as soon as it is too big", async () => {
    const small = new Request("https://x/", { method: "POST", body: "hello" });
    expect(await readBody(small, 10)).toBe("hello");
    // Declared too big: refused before reading.
    const declared = new Request("https://x/", { method: "POST", body: "x", headers: { "content-length": "999" } });
    await expect(readBody(declared, 10)).rejects.toBeInstanceOf(BodyTooLarge);
    // No length header: counted while streaming.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(4));
        c.close();
      },
    });
    const streamed = new Request("https://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readBody(streamed, 10)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("groups IPv6 callers by /64 and unwraps IPv4-mapped addresses", () => {
    const ip = (value: string) => clientIp(new Request("https://x/", { headers: { "x-forwarded-for": value } }));
    expect(ip("1.2.3.4, 10.0.0.1")).toBe("1.2.3.4");
    expect(ip("2405:201:abcd:12ab:1:2:3:4")).toBe("2405:201:abcd:12ab::/64");
    expect(ip("2405:201:abcd:12ab:ffff::9")).toBe("2405:201:abcd:12ab::/64");
    expect(ip("2405:201::1")).toBe("2405:201:0:0::/64");
    expect(ip("::ffff:5.6.7.8")).toBe("5.6.7.8");
    expect(ip("not-an-ip")).toBe("not-an-ip");
    expect(clientIp(new Request("https://x/"))).toBe("local");
  });

  it("only lets our own pages change things", () => {
    const at = (method: string, origin?: string) =>
      sameSite(
        new Request("https://home.example/api/design", {
          method,
          headers: { host: "home.example", ...(origin ? { origin } : {}) },
        }),
        { PUBLIC_ORIGIN: "https://home.amankeshri.com", ALLOWED_ORIGINS: "https://dream.example" },
      );
    expect(at("GET", "https://evil.example")).toBe(true);
    expect(at("POST")).toBe(true);
    expect(at("POST", "https://home.example")).toBe(true);
    expect(at("POST", "https://home.amankeshri.com")).toBe(true);
    expect(at("POST", "https://dream.example")).toBe(true);
    expect(at("POST", "https://evil.example")).toBe(false);
    expect(at("POST", "null")).toBe(false);
  });
});

describe("router", () => {
  it("finds routes by path or by the rewrite's query", () => {
    expect(routeName(new URL("https://x/api/design"))).toBe("design");
    expect(routeName(new URL("https://x/api/design/"))).toBe("design");
    expect(routeName(new URL("https://x/api?__route=design"))).toBe("design");
    expect(routeName(new URL("https://x/api"))).toBe("");
  });

  it("serves the design API, refuses other sites, and hides failures", async () => {
    const deps = { store: memoryStore(), callClaude: ok };
    expect((await route(design(), env, deps)).status).toBe(200);
    const viaRewrite = request("/api?__route=design", { method: "POST", body: JSON.stringify({ kind: "home", brief }) });
    expect(await (await route(viaRewrite, env, deps)).json()).toMatchObject({ ok: true });
    const evil = await route(design({ origin: "https://evil.example" }), env, deps);
    expect(evil.status).toBe(403);
    expect(await evil.json()).toMatchObject({ ok: false, reason: "forbidden" });
    expect((await route(request("/api/nope"), env, deps)).status).toBe(404);
    expect((await route(request("/api/__proto__"), env, deps)).status).toBe(404);
    const broken = await route(design(), env, {
      store: {
        ...memoryStore(),
        reserve: () => {
          throw new Error("boom");
        },
      },
      callClaude: ok,
    });
    expect(broken.status).toBeLessThan(500);
    const res = await route(design(), env, deps);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("never runs paid AI on Vercel without a shared limit store", async () => {
    const call = vi.fn(ok);
    const onVercel = { ...env, VERCEL: "1" };
    expect(limiterFor(onVercel, {})).toBeNull();
    const res = await route(design(), onVercel, { callClaude: call });
    expect(await res.json()).toMatchObject({ ok: false, reason: "offline" });
    const credits = await route(request("/api/design"), onVercel, {});
    expect(await credits.json()).toMatchObject({ ok: true, live: false });
    expect(call).not.toHaveBeenCalled();
    // With KV configured it would use it.
    expect(limiterFor({ ...onVercel, KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "t" }, {})).not.toBeNull();
  });

  it("has a kill switch", async () => {
    const call = vi.fn(ok);
    const res = await route(design(), { ...env, AI_DISABLED: "1" }, { store: memoryStore(), callClaude: call });
    expect(await res.json()).toMatchObject({ ok: false, reason: "offline" });
    expect(call).not.toHaveBeenCalled();
  });

  it("counts refused calls against the daily budget", async () => {
    const store = memoryStore();
    const refused: CallClaude = async () => {
      throw new DesignRefused("no", 0.6);
    };
    const budget = { ...env, AI_DAILY_BUDGET_USD: "1" };
    for (let i = 0; i < 2; i++)
      await handleDesign(design({ "x-dream-device": `device-${String(i).padStart(16, "0")}` }), budget, {
        store,
        callClaude: refused,
      });
    const next = await handleDesign(design({ "x-dream-device": "device-ffffffffffffffff" }), budget, {
      store,
      callClaude: ok,
    });
    expect(await next.json()).toMatchObject({ ok: false, reason: "busy" });
  });
});

describe("limiter", () => {
  const day = (iso: string) => () => new Date(iso);

  it("reserves atomically: a full counter changes nothing", async () => {
    const store = memoryStore();
    const limiter = new Limiter(store, 10, { ...DEFAULT_RULES, plan: { device: 1, window: "life", ip: 3, costly: true } });
    expect(await limiter.reserve("plan", DEVICE, "1.1.1.1")).toEqual({ ok: true, left: 0 });
    expect(await limiter.reserve("plan", DEVICE, "1.1.1.1")).toMatchObject({ ok: false, reason: "limit" });
    // The refused attempt didn't use up the connection's allowance.
    const today = new Date().toISOString().slice(0, 10);
    expect(await store.get(`dh:v1:ip:1.1.1.1:plan:${today}`)).toBe(1);
    await limiter.refund("plan", DEVICE, "1.1.1.1");
    expect(await limiter.left("plan", DEVICE)).toBe(1);
  });

  it("limits a connection without touching each device's allowance", async () => {
    const store = memoryStore();
    const limiter = new Limiter(store, 10, { ...DEFAULT_RULES, command: { device: 15, window: "day", ip: 2, costly: true } });
    for (const d of ["a", "b"]) expect((await limiter.reserve("command", `device-${d.repeat(16)}`, "9.9.9.9")).ok).toBe(true);
    const third = await limiter.reserve("command", `device-${"c".repeat(16)}`, "9.9.9.9");
    expect(third).toMatchObject({ ok: false, reason: "busy", left: 15 });
  });

  it("resets daily allowances the next day and keeps lifetime ones", async () => {
    const store = memoryStore();
    const rules = { ...DEFAULT_RULES, command: { device: 1, window: "day" as const, ip: 99, costly: true } };
    const monday = new Limiter(store, 10, rules, day("2026-10-19T10:00:00Z"));
    const tuesday = new Limiter(store, 10, rules, day("2026-10-20T10:00:00Z"));
    expect((await monday.reserve("command", DEVICE, "ip")).ok).toBe(true);
    expect((await monday.reserve("command", DEVICE, "ip")).ok).toBe(false);
    expect((await tuesday.reserve("command", DEVICE, "ip")).ok).toBe(true);
    expect((await monday.reserve("home", DEVICE, "ip")).ok).toBe(true);
    expect(await tuesday.left("home", DEVICE)).toBe(DEFAULT_RULES.home.device - 1);
  });

  it("stops AI work once the day's budget is spent, but not sharing", async () => {
    const limiter = new Limiter(memoryStore(), 1);
    await limiter.spend(1.2);
    expect(await limiter.reserve("command", DEVICE, "ip")).toMatchObject({ ok: false, reason: "busy" });
    expect((await limiter.reserve("share", DEVICE, "ip")).ok).toBe(true);
    // Reads have no device limit, only a per-connection one.
    expect(await limiter.left("read", DEVICE)).toBe(Infinity);
  });

  it("charges a call's worst case up front, so calls at the same time can't overshoot the budget", async () => {
    const store = memoryStore();
    const limiter = new Limiter(store, 1);
    // Three calls of up to $0.40 each: the third would take the day past $1.
    expect((await limiter.reserve("home", "device-aaaaaaaaaaaaaaaa", "1.1.1.1", 0.4)).ok).toBe(true);
    expect((await limiter.reserve("home", "device-bbbbbbbbbbbbbbbb", "1.1.1.2", 0.4)).ok).toBe(true);
    expect(await limiter.reserve("home", "device-cccccccccccccccc", "1.1.1.3", 0.4)).toMatchObject({ ok: false, reason: "busy" });
    // The first two cost $0.05 each in the end: room again.
    await limiter.settle(0.4, 0.05);
    await limiter.settle(0.4, 0.05);
    expect((await limiter.reserve("home", "device-cccccccccccccccc", "1.1.1.3", 0.4)).ok).toBe(true);
  });

  it("after a failed call: the device gets its use back; the connection only when nothing was spent", async () => {
    const store = memoryStore();
    const limiter = new Limiter(store, 10, { ...DEFAULT_RULES, plan: { device: 1, window: "life", ip: 2, costly: true } });
    const spent = () => store.get(`dh:v1:spend:${new Date().toISOString().slice(0, 10)}`);
    // Billed (a refusal): its real cost stays; the connection's use too.
    await limiter.reserve("plan", DEVICE, "ip", 0.2);
    await limiter.failed("plan", DEVICE, "ip", 0.2, 0.03);
    expect(await spent()).toBe(300);
    expect(await limiter.left("plan", DEVICE)).toBe(1);
    // Never reached the model: everything comes back.
    await limiter.reserve("plan", DEVICE, "ip", 0.2);
    await limiter.failed("plan", DEVICE, "ip", 0.2, 0);
    expect(await spent()).toBe(300);
    // Unknown (a timeout): the worst case stays charged.
    await limiter.reserve("plan", DEVICE, "ip", 0.2);
    await limiter.failed("plan", DEVICE, "ip", 0.2, null);
    expect(await spent()).toBe(2300);
    // Two uses of the connection's two are gone (the billed one and the timeout), so a loop stops here.
    expect(await limiter.reserve("plan", DEVICE, "ip", 0.2)).toMatchObject({ ok: false, reason: "busy" });
  });

  it("reads limit overrides from the environment", () => {
    const rules = rulesFrom({ LIMIT_COMMAND_DEVICE: "40", LIMIT_PLAN_IP: "0", LIMIT_SHARE_DEVICE: "-3", LIMIT_ROOM_IP: "x" });
    expect(rules.command.device).toBe(40);
    expect(rules.plan.ip).toBe(0);
    expect(rules.share.device).toBe(DEFAULT_RULES.share.device);
    expect(rules.room.ip).toBe(DEFAULT_RULES.room.ip);
    expect(DEFAULT_RULES.command.device).toBe(15);
  });

  it("reserves on Upstash with one atomic script", async () => {
    const answers = [[0, 1, 1], [1], [2, 2]];
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ result: answers.shift() }])));
    const store = restStore("https://kv.example", "token", fetcher as unknown as typeof fetch);
    const counters = [
      { key: "dev", max: 3, ttl: 60 },
      { key: "ip", max: 8, ttl: 30 },
    ];
    expect(await store.reserve({ key: "spend", max: 100, charge: 7 }, counters)).toEqual({ ok: true, values: [1, 1] });
    expect(await store.reserve({ key: "spend", max: 100 }, counters)).toEqual({ ok: false, blocked: "budget" });
    expect(await store.reserve(null, counters)).toEqual({ ok: false, blocked: 1 });
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual([["EVAL", RESERVE_SCRIPT, 3, "spend", "dev", "ip", 100, 7, 3, 60, 8, 30]]);
    const noBudget = JSON.parse((fetcher.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(noBudget[0].slice(6)).toEqual([-1, 0, 3, 60, 8, 30]);
    // The script charges the budget in the same step as the counters.
    expect(RESERVE_SCRIPT).toContain("spent + charge > budget");
    expect(RESERVE_SCRIPT).toContain("redis.call('INCRBY', KEYS[1], charge)");
  });

  it("surfaces Upstash errors instead of guessing", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ error: "ERR script" }])));
    const store = restStore("https://kv.example", "token", fetcher as unknown as typeof fetch);
    await expect(store.reserve(null, [{ key: "k", max: 1, ttl: 1 }])).rejects.toThrow("ERR script");
  });
});

describe("what a failed call cost", () => {
  it("reads it from the error", () => {
    expect(billOf(new BilledError("refused", 0.02))).toBe(0.02);
    expect(billOf(new Anthropic.APIConnectionError({ message: "no network" }))).toBe(0);
    expect(billOf(Anthropic.APIError.generate(529, { type: "error" }, "overloaded", new Headers()))).toBe(0);
    expect(billOf(new Anthropic.APIConnectionTimeoutError())).toBeNull();
    expect(billOf(new Anthropic.APIUserAbortError())).toBeNull();
    expect(billOf(new Error("who knows"))).toBeNull();
  });
});

describe("pricing", () => {
  it("prices each model at its own rate", () => {
    const million = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(costOf(million, "claude-opus-5-5")).toBe(24);
    expect(costOf(million, "claude-sonnet-5-5")).toBe(12);
    expect(costOf(million, "claude-haiku-5-5")).toBeCloseTo(0.6);
    // Unknown models are priced high so the budget errs on the safe side.
    expect(priceOf("claude-something-new").output).toBeGreaterThanOrEqual(20);
  });

  it("adds up every attempt when a fallback model served the answer", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 0,
      iterations: [
        { input_tokens: 1_000_000, output_tokens: 0, model: "claude-opus-5-5" },
        { input_tokens: 1_000_000, output_tokens: 0, model: "claude-sonnet-5-5" },
      ],
    };
    expect(costOf(usage, "claude-opus-5-5")).toBe(6);
  });

  it("asks for the server-side fallback only where it exists", () => {
    expect(supportsFallback("claude-opus-5-5")).toBe(true);
    expect(supportsFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsFallback("claude-sonnet-5")).toBe(false);
  });
});

describe("security headers", () => {
  it("vercel.json ships exactly the headers defined in server/headers.ts", () => {
    expect(vercel.headers).toEqual(vercelHeaders());
  });

  it("routes every API request to the one bundled function", () => {
    expect(Object.keys(vercel.functions)).toEqual(["api/index.js"]);
    expect(vercel.rewrites).toContainEqual({ source: "/api/:route*", destination: "/api?__route=:route*" });
  });

  it("keeps the policy strict", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/'unsafe-eval'|\*|https?:/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(SECURITY_HEADERS["Permissions-Policy"]).not.toContain("interest-cohort");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
  });
});
