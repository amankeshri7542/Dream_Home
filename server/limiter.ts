// Free-tier limits for every kind of request: per device (a random id the
// browser keeps), per connection per day, and, for anything that calls the AI,
// a global daily spend cap. Counters live in Upstash Redis / Vercel KV over its
// REST API (no extra dependency). The in-memory store is for local development
// and tests only: on Vercel the server refuses to run without KV (see routes).
import { FREE_HOME_DESIGNS, FREE_ROOM_MAKEOVERS } from "../src/ai/brief";
import type { Env } from "./http";

export const KINDS = ["home", "room", "command", "plan", "share", "report", "read"] as const;
export type Kind = (typeof KINDS)[number];

export type Rule = {
  /** Uses per device: over its lifetime ("life") or per day ("day"). 0 = no device limit. */
  device: number;
  window: "life" | "day";
  /** Uses per connection per day. */
  ip: number;
  /** Calls the AI, so it counts against the daily budget. */
  costly: boolean;
};

export const DEFAULT_RULES: Record<Kind, Rule> = {
  home: { device: FREE_HOME_DESIGNS, window: "life", ip: 8, costly: true },
  room: { device: FREE_ROOM_MAKEOVERS, window: "life", ip: 30, costly: true },
  command: { device: 15, window: "day", ip: 60, costly: true },
  plan: { device: 1, window: "life", ip: 3, costly: true },
  share: { device: 20, window: "day", ip: 60, costly: false },
  report: { device: 10, window: "day", ip: 20, costly: false },
  read: { device: 0, window: "day", ip: 600, costly: false },
};

/** `LIMIT_COMMAND_DEVICE=20`, `LIMIT_SHARE_IP=100`… override the defaults. */
export function rulesFrom(env: Env): Record<Kind, Rule> {
  const rules = structuredClone(DEFAULT_RULES);
  for (const kind of KINDS)
    for (const field of ["device", "ip"] as const) {
      const raw = env[`LIMIT_${kind.toUpperCase()}_${field.toUpperCase()}`];
      const n = Number(raw);
      if (raw !== undefined && Number.isInteger(n) && n >= 0) rules[kind][field] = n;
    }
  return rules;
}

export type Counter = { key: string; max: number; ttl: number };
export type Reservation =
  | { ok: true; values: number[] }
  /** `blocked`: "budget", or the index of the counter that was full. */
  | { ok: false; blocked: "budget" | number };

export type Store = {
  /** Adds `by` to a counter (creating it with a time-to-live) and returns the new value. */
  add(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
  /**
   * In one atomic step: unless the budget counter has reached its maximum or
   * any counter is full, add 1 to every counter. Nothing changes otherwise.
   */
  reserve(budget: { key: string; max: number } | null, counters: Counter[]): Promise<Reservation>;
};

export function memoryStore(): Store {
  const values = new Map<string, { n: number; until: number }>();
  const live = (key: string) => {
    const v = values.get(key);
    if (v && v.until < Date.now()) values.delete(key);
    return values.get(key);
  };
  const addNow = (key: string, by: number, ttl: number) => {
    const v = live(key) ?? { n: 0, until: Date.now() + ttl * 1000 };
    v.n += by;
    values.set(key, v);
    return v.n;
  };
  return {
    async add(key, by, ttl) {
      return addNow(key, by, ttl);
    },
    async get(key) {
      return live(key)?.n ?? 0;
    },
    // No await between the checks and the writes, so this is atomic in JS.
    async reserve(budget, counters) {
      if (budget && (live(budget.key)?.n ?? 0) >= budget.max) return { ok: false, blocked: "budget" };
      const full = counters.findIndex((c) => (live(c.key)?.n ?? 0) + 1 > c.max);
      if (full >= 0) return { ok: false, blocked: full };
      return { ok: true, values: counters.map((c) => addNow(c.key, 1, c.ttl)) };
    },
  };
}

/**
 * KEYS[1] = budget counter, KEYS[2..] = counters. ARGV[1] = budget maximum
 * (-1: no budget), then a maximum and a TTL for each counter.
 * Returns {0, v1, v2…} on success, {1} when over budget, {2, i} when counter i
 * (1-based) is full.
 */
export const RESERVE_SCRIPT = `
local budget = tonumber(ARGV[1])
if budget >= 0 and tonumber(redis.call('GET', KEYS[1]) or '0') >= budget then return {1} end
local n = #KEYS - 1
for i = 1, n do
  if tonumber(redis.call('GET', KEYS[i + 1]) or '0') + 1 > tonumber(ARGV[2 * i]) then return {2, i} end
end
local out = {0}
for i = 1, n do
  out[i + 1] = redis.call('INCR', KEYS[i + 1])
  if redis.call('TTL', KEYS[i + 1]) < 0 then redis.call('EXPIRE', KEYS[i + 1], tonumber(ARGV[2 * i + 1])) end
end
return out`;

/** Upstash Redis over its REST API (what Vercel's KV / Upstash integration provides). */
export function restStore(url: string, token: string, fetcher: typeof fetch = fetch): Store {
  const run = async (commands: (string | number)[][]) => {
    const res = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Limit store answered ${res.status}`);
    const results = (await res.json()) as { result?: unknown; error?: string }[];
    const error = results.find((r) => r.error);
    if (error) throw new Error(error.error);
    return results;
  };
  return {
    async add(key, by, ttl) {
      const [incr] = await run([
        ["INCRBY", key, by],
        ["EXPIRE", key, ttl, "NX"],
      ]);
      return Number(incr.result);
    },
    async get(key) {
      const [got] = await run([["GET", key]]);
      return Number(got.result ?? 0) || 0;
    },
    async reserve(budget, counters) {
      const keys = [budget?.key ?? "dh:v1:no-budget", ...counters.map((c) => c.key)];
      const args = [budget ? budget.max : -1, ...counters.flatMap((c) => [c.max, c.ttl])];
      const [answer] = await run([["EVAL", RESERVE_SCRIPT, keys.length, ...keys, ...args]]);
      const out = (answer.result as number[]).map(Number);
      if (out[0] === 0) return { ok: true, values: out.slice(1) };
      if (out[0] === 1) return { ok: false, blocked: "budget" };
      return { ok: false, blocked: out[1] - 1 };
    },
  };
}

const YEAR = 365 * 24 * 3600,
  DAY = 24 * 3600;
const today = (now: Date) => now.toISOString().slice(0, 10);
/** Spend is counted in hundredths of a cent so it stays an integer. */
const UNITS_PER_USD = 10000;

export type Verdict = { ok: true; left: number } | { ok: false; reason: "limit" | "busy"; left: number };

export class Limiter {
  constructor(
    private store: Store,
    private budgetUsd: number,
    private rules: Record<Kind, Rule> = DEFAULT_RULES,
    private now: () => Date = () => new Date(),
  ) {}

  private keys(kind: Kind, device: string, ip: string) {
    const day = today(this.now());
    const rule = this.rules[kind];
    return {
      // Lifetime keys keep the v1 names so existing counters carry over.
      device: rule.window === "life" ? `dh:v1:dev:${device}:${kind}` : `dh:v1:dev:${device}:${kind}:${day}`,
      deviceTtl: rule.window === "life" ? YEAR : DAY,
      ip: `dh:v1:ip:${ip}:${kind}:${day}`,
      spend: `dh:v1:spend:${day}`,
    };
  }

  private counters(kind: Kind, device: string, ip: string): Counter[] {
    const k = this.keys(kind, device, ip);
    const rule = this.rules[kind];
    return [
      ...(rule.device > 0 ? [{ key: k.device, max: rule.device, ttl: k.deviceTtl }] : []),
      { key: k.ip, max: rule.ip, ttl: DAY },
    ];
  }

  /** Uses left today (or ever) for this device; Infinity when only the IP is limited. */
  async left(kind: Kind, device: string): Promise<number> {
    const rule = this.rules[kind];
    if (rule.device <= 0) return Infinity;
    const used = await this.store.get(this.keys(kind, device, "-").device);
    return Math.max(0, rule.device - used);
  }

  /** Takes one use, or says why not. Call `refund` if the work then fails. */
  async reserve(kind: Kind, device: string, ip: string): Promise<Verdict> {
    const rule = this.rules[kind];
    const k = this.keys(kind, device, ip);
    const budget = rule.costly ? { key: k.spend, max: Math.round(this.budgetUsd * UNITS_PER_USD) } : null;
    const counters = this.counters(kind, device, ip);
    const result = await this.store.reserve(budget, counters);
    if (result.ok) return { ok: true, left: rule.device > 0 ? Math.max(0, rule.device - result.values[0]) : Infinity };
    if (result.blocked === "budget") return { ok: false, reason: "busy", left: await this.left(kind, device) };
    const deviceFull = rule.device > 0 && result.blocked === 0;
    return deviceFull
      ? { ok: false, reason: "limit", left: 0 }
      : { ok: false, reason: "busy", left: await this.left(kind, device) };
  }

  async refund(kind: Kind, device: string, ip: string) {
    for (const c of this.counters(kind, device, ip)) await this.store.add(c.key, -1, c.ttl);
  }

  async spend(usd: number) {
    if (!(usd > 0)) return;
    await this.store.add(this.keys("home", "-", "-").spend, Math.ceil(usd * UNITS_PER_USD), 2 * DAY);
  }
}

/** The daily AI budget in US dollars (AI_DAILY_BUDGET_USD, default 10). */
export function budgetFrom(env: Env): number {
  const budget = Number(env.AI_DAILY_BUDGET_USD ?? "10");
  return Number.isFinite(budget) && budget > 0 ? budget : 10;
}
