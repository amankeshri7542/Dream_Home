// A small key-value store for share-link records: Upstash Redis / Vercel KV
// over its REST API in production, a Map locally and in tests.

export type KeyValue = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttl?: number; onlyIfNew?: boolean }): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  /** Adds to a set; returns the set's size. */
  addToSet(key: string, member: string): Promise<number>;
  /** Several counters at once (missing ones are 0). */
  counts(...keys: string[]): Promise<number[]>;
};

export function memoryKv(): KeyValue {
  const values = new Map<string, { v: string | Set<string>; until: number }>();
  const live = (key: string) => {
    const e = values.get(key);
    if (e && e.until < Date.now()) values.delete(key);
    return values.get(key);
  };
  return {
    async get(key) {
      const e = live(key);
      return typeof e?.v === "string" ? e.v : null;
    },
    async set(key, value, opts = {}) {
      if (opts.onlyIfNew && live(key)) return false;
      values.set(key, { v: value, until: opts.ttl ? Date.now() + opts.ttl * 1000 : Infinity });
      return true;
    },
    async del(...keys) {
      for (const k of keys) values.delete(k);
    },
    async incr(key) {
      const e = live(key);
      const n = (typeof e?.v === "string" ? Number(e.v) : 0) + 1;
      values.set(key, { v: String(n), until: e?.until ?? Infinity });
      return n;
    },
    async addToSet(key, member) {
      const e = live(key);
      const set = e?.v instanceof Set ? e.v : new Set<string>();
      set.add(member);
      values.set(key, { v: set, until: e?.until ?? Infinity });
      return set.size;
    },
    async counts(...keys) {
      return keys.map((k) => {
        const e = live(k);
        return typeof e?.v === "string" ? Number(e.v) || 0 : 0;
      });
    },
  };
}

export function restKv(url: string, token: string, fetcher: typeof fetch = fetch): KeyValue {
  const run = async (commands: (string | number)[][]) => {
    const res = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Store answered ${res.status}`);
    const results = (await res.json()) as { result?: unknown; error?: string }[];
    const error = results.find((r) => r.error);
    if (error) throw new Error(error.error);
    return results.map((r) => r.result);
  };
  return {
    async get(key) {
      const [v] = await run([["GET", key]]);
      return typeof v === "string" ? v : null;
    },
    async set(key, value, opts = {}) {
      const command: (string | number)[] = ["SET", key, value];
      if (opts.ttl) command.push("EX", opts.ttl);
      if (opts.onlyIfNew) command.push("NX");
      const [v] = await run([command]);
      return v === "OK";
    },
    async del(...keys) {
      if (keys.length) await run([["DEL", ...keys]]);
    },
    async incr(key) {
      const [v] = await run([["INCR", key]]);
      return Number(v);
    },
    async addToSet(key, member) {
      const [, size] = await run([
        ["SADD", key, member],
        ["SCARD", key],
      ]);
      return Number(size);
    },
    async counts(...keys) {
      if (!keys.length) return [];
      const [v] = await run([["MGET", ...keys]]);
      return (v as (string | null)[]).map((x) => Number(x ?? 0) || 0);
    },
  };
}
