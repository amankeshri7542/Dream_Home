// Dream Home as an installed app: the service worker (production builds only),
// "A new version is ready" (it waits for a tap, so nothing changes mid-edit),
// and the browser's install prompt, kept for the "Install Dream Home" nudge.
// The nudge shows from the second visit or after the first share, until it's
// installed or snoozed.

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type PwaState = {
  /** A new version is installed and waiting. */
  update: boolean;
  /** The browser offered its install prompt (Chrome, Edge, Android). */
  canInstall: boolean;
  /** Running from the home screen already. */
  installed: boolean;
  /** iPhone or iPad: installing is Share → Add to Home Screen. */
  ios: boolean;
  /** Time to suggest installing. */
  nudge: boolean;
};
type Record_ = { visits: number; shared: boolean; snoozedUntil: number };

export const VISITS_KEY = "dream-home.visits.v1";
const SNOOZE_DAYS = 14;
let state: PwaState = { update: false, canInstall: false, installed: false, ios: false, nudge: false };
let apply: (() => void) | null = null;
let deferred: InstallPrompt | null = null;
let hiddenThisVisit = false;
const listeners = new Set<() => void>();

function readRecord(storage: Storage | undefined = globalThis.localStorage): Record_ {
  try {
    const raw = JSON.parse(storage?.getItem(VISITS_KEY) ?? "{}") as Partial<Record_>;
    return { visits: Number(raw.visits) || 0, shared: raw.shared === true, snoozedUntil: Number(raw.snoozedUntil) || 0 };
  } catch {
    return { visits: 0, shared: false, snoozedUntil: 0 };
  }
}
function writeRecord(patch: Partial<Record_>, storage: Storage | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(VISITS_KEY, JSON.stringify({ ...readRecord(storage), ...patch }));
  } catch {
    /* No storage: the nudge just won't remember. */
  }
}
function set(patch: Partial<PwaState>) {
  const next = { ...state, ...patch };
  const r = readRecord();
  next.nudge =
    !next.installed && (next.canInstall || next.ios) && (r.visits >= 2 || r.shared) && Date.now() > r.snoozedUntil && !hiddenThisVisit;
  state = next;
  listeners.forEach((l) => l());
}

export const pwa = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: () => state,
  /** Swaps in the waiting version; the page reloads when it takes over. */
  update() {
    apply?.();
  },
  /** The browser's own install prompt; true when the person installed. */
  async install(): Promise<boolean> {
    const prompt = deferred;
    if (!prompt) return false;
    deferred = null;
    set({ canInstall: false });
    await prompt.prompt();
    return (await prompt.userChoice).outcome === "accepted";
  },
  /** "Not now": hidden for two weeks. */
  snooze() {
    writeRecord({ snoozedUntil: Date.now() + SNOOZE_DAYS * 86_400_000 });
    hiddenThisVisit = true;
    set({});
  },
  /** A first share is a good moment to suggest installing. */
  shared() {
    if (readRecord().shared) return;
    writeRecord({ shared: true });
    set({});
  },
};

export type PwaEnv = {
  win: Window;
  container?: ServiceWorkerContainer;
  reload: () => void;
  /** Register the service worker (production builds). */
  register: boolean;
};

/** Counts this visit (once per browser session), listens for install, and registers the worker. */
export function startPwa(
  env: PwaEnv = {
    win: window,
    container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    reload: () => window.location.reload(),
    register: import.meta.env.PROD,
  },
) {
  const { win } = env;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  try {
    if (!win.sessionStorage.getItem(VISITS_KEY)) {
      win.sessionStorage.setItem(VISITS_KEY, "1");
      writeRecord({ visits: readRecord(win.localStorage).visits + 1 }, win.localStorage);
    }
  } catch {
    /* Private mode: no counting. */
  }
  const installed = !!win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  set({ installed, ios: ios && !installed });
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    set({ canInstall: true });
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
    set({ installed: true, canInstall: false, ios: false });
  });

  const sw = env.container;
  if (!env.register || !sw) return;
  // Reload only when the person asked for the new version (not when the very
  // first worker takes over a fresh page).
  let asked = false,
    reloaded = false;
  // What this page loaded before the worker was in charge (a first visit), for it to keep.
  const keepLoaded = () =>
    sw.controller?.postMessage({
      type: "KEEP",
      urls: (win.performance?.getEntriesByType?.("resource") ?? []).map((e) => e.name).filter((u) => u.startsWith(win.location.origin)),
    });
  sw.addEventListener("controllerchange", () => {
    if (asked && !reloaded) {
      reloaded = true;
      env.reload();
    } else if (!asked) {
      // Again a little later: files still downloading at the takeover weren't listed yet.
      keepLoaded();
      for (const ms of [5_000, 20_000]) win.setTimeout(keepLoaded, ms);
    }
  });
  const offer = (worker: ServiceWorker) => {
    apply = () => {
      asked = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    };
    set({ update: true });
  };
  const register = () =>
    sw
      .register("/sw.js")
      .then((reg) => {
        if (sw.controller) keepLoaded();
        if (reg.waiting && sw.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && sw.controller) offer(worker);
          });
        });
        // Look for a new version whenever the app comes back to the front.
        win.document.addEventListener("visibilitychange", () => {
          if (win.document.visibilityState === "visible") reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  if (win.document.readyState === "complete") void register();
  else win.addEventListener("load", () => void register(), { once: true });
}

/** For tests: back to a fresh page. */
export function resetPwa() {
  state = { update: false, canInstall: false, installed: false, ios: false, nudge: false };
  apply = null;
  deferred = null;
  hiddenThisVisit = false;
}
