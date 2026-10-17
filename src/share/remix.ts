// "Remix this home": a visitor's own copy of a shared home, added to their My
// homes and opened next time the app starts. Runs on the viewer page without
// the editor, so it writes the same storage the editor reads: the visitor's
// current home is kept safe on the shelf first, never overwritten.
import type { Project } from "../domain/types";
import { MAX_HOMES, PROJECT_KEY, addHome, isFull, loadShelf, newHomeId, saveShelf } from "../homes/shelf";
import type { HomeStore } from "../homes/store";
import { SESSION_KEY } from "../editor/preferences";

export type RemixOutcome = "ok" | "full" | "unsupported" | "failed";
/** Set for one visit after a remix, so the app can say hello. */
export const REMIXED_KEY = "dream-home.remixed";

/** The visitor's copy: their own name for it, and where it came from. */
export function remixOf(shared: Project, from: { id: string; name: string }): Project {
  const suffix = " (my version)";
  const name = `${shared.name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
  return { ...shared, name, remixOf: { id: from.id, name: from.name.slice(0, 80) } };
}

export async function remixIntoMyHomes(
  remix: Project,
  {
    store,
    storage = globalThis.localStorage,
    session = globalThis.sessionStorage,
    now = Date.now(),
    replaceIfNeeded = false,
  }: { store: HomeStore; storage?: Storage; session?: Storage; now?: number; replaceIfNeeded?: boolean },
): Promise<RemixOutcome> {
  try {
    const current = storage.getItem(PROJECT_KEY);
    const json = JSON.stringify(remix);
    if (!store.persistent) {
      // This browser keeps one home: only replace it when the visitor said so.
      if (current && !replaceIfNeeded) return "unsupported";
      storage.setItem(PROJECT_KEY, json);
    } else if (!current) {
      // A first visit: the remix simply becomes their home.
      const shelf = loadShelf(remix, now, storage);
      await store.put(shelf.activeId, json);
      storage.setItem(PROJECT_KEY, json);
      saveShelf(shelf, storage);
    } else {
      let parsed: Project | null = null;
      try {
        parsed = JSON.parse(current) as Project;
      } catch {
        parsed = null;
      }
      const shelf = loadShelf(parsed ?? remix, now, storage);
      if (isFull(shelf)) return "full";
      // Keep the home they had, exactly as saved, then add and open the remix.
      await store.put(shelf.activeId, current);
      const id = newHomeId();
      await store.put(id, json);
      saveShelf(addHome(shelf, id, remix, now), storage);
      storage.setItem(PROJECT_KEY, json);
    }
    // Straight into the remix next time the app opens (not the title screen),
    // with a word of welcome.
    try {
      const s = JSON.parse(session.getItem(SESSION_KEY) ?? "{}");
      session.setItem(SESSION_KEY, JSON.stringify({ ...s, titleDismissed: true }));
      session.setItem(REMIXED_KEY, remix.remixOf?.name ?? remix.name);
    } catch {
      /* The title screen will show; that's fine. */
    }
    return "ok";
  } catch {
    return "failed";
  }
}

export const REMIX_PROBLEMS: Record<Exclude<RemixOutcome, "ok">, string> = {
  full: `Your My homes is full (${MAX_HOMES} homes). Open Dream Home and delete one to make room.`,
  unsupported: "This browser keeps only one home. Remixing will replace the home you have here.",
  failed: "Your device couldn’t save the remix. Please try again.",
};

/** In-app browsers (Instagram, Facebook…) keep their own short-lived storage. */
export const inAppBrowser = (ua = globalThis.navigator?.userAgent ?? "") =>
  /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|; wv\)/i.test(ua);
