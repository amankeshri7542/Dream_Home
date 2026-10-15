// Free-tier limits: per device (a random id the browser keeps) and per IP per
// day, plus a global daily spend cap. Counters live in Upstash Redis / Vercel
// KV when configured (REST API, no extra dependency), else in memory, which is
// fine for local development but resets whenever a server instance restarts.
import { FREE_HOME_DESIGNS, FREE_ROOM_MAKEOVERS } from "../src/ai/brief";

export type Kind = "home" | "room";
export type Store = {
  /** Adds `by` to a counter (creating it with a time-to-live) and returns the new value. */
  add(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
};

export function memoryStore(): Store {
  const values = new Map<string, { n: number; until: number }>();
  const live = (key: string) => {
    const v = values.get(key);
    if (v && v.until < Date.now()) values.delete(key);
    return values.get(key);
  };
  return {
    async add(key, by, ttl) {
      const v = live(key) ?? { n: 0, until: Date.now() + ttl * 1000 };
      v.n += by;
      values.set(key, v);
      return v.n;
    },
    async get(key) {
      return live(key)?.n ?? 0;
    },
  };
}

/** Upstash Redis over its REST API (what Vercel's KV / Upstash integration provides). */
export function restStore(url: string, token: string, fetcher: typeof fetch = fetch): Store {
  const run = async (commands: (string | number)[][]) => {
    const res = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Limit store answered ${res.status}`);
    return (await res.json()) as { result?: unknown; error?: string }[];
  };
  return {
    async add(key, by, ttl) {
      const [incr] = await run([
        ["INCRBY", key, by],
        ["EXPIRE", key, ttl, "NX"],
      ]);
      if (incr.error) throw new Error(incr.error);
      return Number(incr.result);
    },
    async get(key) {
      const [got] = await run([["GET", key]]);
      return Number(got.result ?? 0) || 0;
    },
  };
}

export const LIMITS = {
  device: { home: FREE_HOME_DESIGNS, room: FREE_ROOM_MAKEOVERS },
  /** Generous enough for a household sharing one connection. */
  ipPerDay: { home: 8, room: 30 },
};
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
    private now: () => Date = () => new Date(),
  ) {}

  private keys(kind: Kind, device: string, ip: string) {
    const day = today(this.now());
    return {
      device: `dh:v1:dev:${device}:${kind}`,
      ip: `dh:v1:ip:${ip}:${kind}:${day}`,
      spend: `dh:v1:spend:${day}`,
    };
  }

  async left(kind: Kind, device: string): Promise<number> {
    const used = await this.store.get(this.keys(kind, device, "-").device);
    return Math.max(0, LIMITS.device[kind] - used);
  }

  /** Takes one free use, or says why not. Call `refund` if the design then fails. */
  async reserve(kind: Kind, device: string, ip: string): Promise<Verdict> {
    const k = this.keys(kind, device, ip);
    const spent = (await this.store.get(k.spend)) / UNITS_PER_USD;
    if (spent >= this.budgetUsd) return { ok: false, reason: "busy", left: await this.left(kind, device) };
    const used = await this.store.add(k.device, 1, YEAR);
    if (used > LIMITS.device[kind]) {
      await this.store.add(k.device, -1, YEAR);
      return { ok: false, reason: "limit", left: 0 };
    }
    const fromIp = await this.store.add(k.ip, 1, DAY);
    if (fromIp > LIMITS.ipPerDay[kind]) {
      await this.store.add(k.ip, -1, DAY);
      await this.store.add(k.device, -1, YEAR);
      return { ok: false, reason: "busy", left: LIMITS.device[kind] - used + 1 };
    }
    return { ok: true, left: LIMITS.device[kind] - used };
  }

  async refund(kind: Kind, device: string, ip: string) {
    const k = this.keys(kind, device, ip);
    await this.store.add(k.device, -1, YEAR);
    await this.store.add(k.ip, -1, DAY);
  }

  async spend(usd: number) {
    await this.store.add(this.keys("home", "-", "-").spend, Math.ceil(usd * UNITS_PER_USD), 2 * DAY);
  }
}
