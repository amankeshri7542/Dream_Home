// M8: the installed app. Visits are counted once a session; the install nudge
// waits for the second visit or a first share and can be snoozed; a new version
// waits for a tap, and only that reload happens (not when the first worker
// takes over a fresh page).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pwa, resetPwa, startPwa, VISITS_KEY, type PwaEnv } from "./pwa";

class MemoryStorage {
  map = new Map<string, string>();
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}
class Emitter {
  handlers = new Map<string, ((e: Event) => void)[]>();
  addEventListener = (type: string, fn: (e: Event) => void) => this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  emit(type: string, event: Event = new Event(type)) {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
  }
}

function fakeWorld({ ua = "Mozilla/5.0 (Linux; Android 14) Chrome/130", controller = true, waiting = false } = {}) {
  const local = new MemoryStorage();
  const win = Object.assign(new Emitter(), {
    navigator: { userAgent: ua, platform: "Linux", maxTouchPoints: 5 },
    matchMedia: () => ({ matches: false }),
    sessionStorage: new MemoryStorage(),
    localStorage: local,
    document: Object.assign(new Emitter(), { readyState: "complete", visibilityState: "visible" }),
    location: { origin: "https://home.example" },
    setTimeout: (fn: () => void) => void fn(),
    performance: { getEntriesByType: () => [{ name: "https://home.example/assets/Scene-a1.js" }, { name: "https://elsewhere.example/x.js" }] },
  });
  const posted: unknown[] = [];
  const worker = Object.assign(new Emitter(), { state: "installing", postMessage: (m: unknown) => posted.push(m) });
  const reg = Object.assign(new Emitter(), { waiting: waiting ? worker : null, installing: worker, update: vi.fn(async () => undefined) });
  const kept: unknown[] = [];
  const container = Object.assign(new Emitter(), {
    controller: controller ? { postMessage: (m: unknown) => kept.push(m) } : null,
    register: vi.fn(async () => reg),
  });
  const reload = vi.fn();
  vi.stubGlobal("localStorage", local);
  const env = { win: win as unknown as Window, container: container as unknown as ServiceWorkerContainer, reload, register: true } satisfies PwaEnv;
  return { env, win, worker, reg, container, reload, posted, local, kept };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetPwa());
afterEach(() => vi.unstubAllGlobals());

describe("the installed app", () => {
  it("counts a visit once per session, and nudges from the second visit when the browser can install", async () => {
    const w = fakeWorld();
    startPwa(w.env);
    startPwa(w.env); // the same session: not counted again
    expect(JSON.parse(w.local.getItem(VISITS_KEY)!).visits).toBe(1);
    w.win.emit("beforeinstallprompt", Object.assign(new Event("beforeinstallprompt"), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "accepted" }) }));
    expect(pwa.get()).toMatchObject({ canInstall: true, nudge: false });
    // A later session.
    w.win.sessionStorage.map.clear();
    startPwa(w.env);
    expect(pwa.get().nudge).toBe(true);
    expect(await pwa.install()).toBe(true);
    w.win.emit("appinstalled");
    expect(pwa.get()).toMatchObject({ installed: true, canInstall: false, nudge: false });
  });

  it("nudges after a first share, shows iPhone steps, and can be snoozed for two weeks", () => {
    const w = fakeWorld({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1" });
    startPwa(w.env);
    expect(pwa.get()).toMatchObject({ ios: true, nudge: false });
    pwa.shared();
    expect(pwa.get().nudge).toBe(true);
    pwa.snooze();
    expect(pwa.get().nudge).toBe(false);
    const until = JSON.parse(w.local.getItem(VISITS_KEY)!).snoozedUntil;
    expect(until - Date.now()).toBeGreaterThan(13 * 86_400_000);
    // Still snoozed on the next visit.
    resetPwa();
    w.win.sessionStorage.map.clear();
    startPwa(w.env);
    expect(pwa.get().nudge).toBe(false);
  });

  it("offers a waiting version and reloads only after the tap", async () => {
    const w = fakeWorld({ waiting: true });
    startPwa(w.env);
    await flush();
    expect(w.container.register).toHaveBeenCalledWith("/sw.js");
    expect(pwa.get().update).toBe(true);
    w.container.emit("controllerchange"); // something else took over: no reload
    expect(w.reload).not.toHaveBeenCalled();
    pwa.update();
    expect(w.posted).toEqual([{ type: "SKIP_WAITING" }]);
    w.container.emit("controllerchange");
    w.container.emit("controllerchange");
    expect(w.reload).toHaveBeenCalledTimes(1);
  });

  it("notices a version installed while open, but not the very first one", async () => {
    const first = fakeWorld({ controller: false });
    startPwa(first.env);
    await flush();
    first.reg.emit("updatefound");
    first.worker.state = "installed";
    first.worker.emit("statechange");
    expect(pwa.get().update).toBe(false);

    resetPwa();
    const later = fakeWorld();
    startPwa(later.env);
    await flush();
    later.reg.emit("updatefound");
    later.worker.state = "installed";
    later.worker.emit("statechange");
    expect(pwa.get().update).toBe(true);
    // Coming back to the app looks for a newer one.
    later.win.document.emit("visibilitychange");
    expect(later.reg.update).toHaveBeenCalled();
  });

  it("hands the worker what the page loaded before it took over, so it opens offline next time", async () => {
    const first = fakeWorld({ controller: false });
    startPwa(first.env);
    await flush();
    expect(first.kept).toEqual([]);
    // The first worker takes over this page.
    first.container.controller = { postMessage: (m: unknown) => first.kept.push(m) };
    first.container.emit("controllerchange");
    expect(first.kept[0]).toEqual({ type: "KEEP", urls: ["https://home.example/assets/Scene-a1.js"] });
    expect(first.kept).toHaveLength(3); // now, and twice more for files still downloading
    expect(first.reload).not.toHaveBeenCalled();
  });

  it("doesn't register in development", async () => {
    const w = fakeWorld();
    startPwa({ ...w.env, register: false });
    await flush();
    expect(w.container.register).not.toHaveBeenCalled();
  });
});
