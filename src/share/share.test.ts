import { describe, expect, it } from "vitest";
import { createPreset } from "../domain/model";
import { MAX_HOMES, PROJECT_KEY, SHELF_KEY, addHome, loadShelf, newHomeId, saveShelf } from "../homes/shelf";
import { memoryHomeStore } from "../homes/store";
import { fingerprint, forgetLink, linkFor, saveLink, shareUrl } from "./links";
import { parseShared } from "./parse";
import { REMIXED_KEY, inAppBrowser, remixIntoMyHomes, remixOf } from "./remix";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("remix", () => {
  const shared = createPreset("courtyard");
  const remix = remixOf(shared, { id: "AbCdEfGh12", name: shared.name });

  it("names the copy and remembers where it came from", () => {
    expect(remix.name).toBe(`${shared.name} (my version)`);
    expect(remix.remixOf).toEqual({ id: "AbCdEfGh12", name: shared.name });
    const long = remixOf({ ...shared, name: "x".repeat(80) }, { id: "AbCdEfGh12", name: "x" });
    expect(long.name.length).toBeLessThanOrEqual(80);
    expect(long.name.endsWith("(my version)")).toBe(true);
  });

  it("keeps the visitor's own home safe and opens the remix", async () => {
    const mine = createPreset("compact");
    const storage = fakeStorage({ [PROJECT_KEY]: JSON.stringify(mine) });
    const session = fakeStorage();
    const store = memoryHomeStore();
    expect(await remixIntoMyHomes(remix, { store, storage, session, now: 5 })).toBe("ok");
    const shelf = loadShelf(mine, 0, storage);
    expect(shelf.homes.map((h) => h.name)).toEqual([remix.name, mine.name]);
    expect(JSON.parse(storage.getItem(PROJECT_KEY)!).name).toBe(remix.name);
    // Their old home is on the shelf, exactly as it was.
    expect(JSON.parse((await store.get(shelf.homes[1].id))!)).toEqual(mine);
    expect(JSON.parse(session.getItem("dream-home.session.v1")!).titleDismissed).toBe(true);
    expect(session.getItem(REMIXED_KEY)).toBe(shared.name);
  });

  it("makes the remix a first visitor's home", async () => {
    const storage = fakeStorage();
    const store = memoryHomeStore();
    expect(await remixIntoMyHomes(remix, { store, storage, session: fakeStorage() })).toBe("ok");
    const shelf = loadShelf(remix, 0, storage);
    expect(shelf.homes).toHaveLength(1);
    expect(JSON.parse((await store.get(shelf.activeId))!).name).toBe(remix.name);
  });

  it("won't overflow a full shelf, or replace a home without asking", async () => {
    const mine = createPreset("compact");
    const storage = fakeStorage({ [PROJECT_KEY]: JSON.stringify(mine) });
    let shelf = loadShelf(mine, 0, storage);
    while (shelf.homes.length < MAX_HOMES) shelf = addHome(shelf, newHomeId(), mine, 0);
    saveShelf(shelf, storage);
    expect(await remixIntoMyHomes(remix, { store: memoryHomeStore(), storage, session: fakeStorage() })).toBe("full");
    expect(JSON.parse(storage.getItem(PROJECT_KEY)!).name).toBe(mine.name);

    const oneHome = fakeStorage({ [PROJECT_KEY]: JSON.stringify(mine) });
    const noDb = memoryHomeStore(false);
    expect(await remixIntoMyHomes(remix, { store: noDb, storage: oneHome, session: fakeStorage() })).toBe("unsupported");
    expect(JSON.parse(oneHome.getItem(PROJECT_KEY)!).name).toBe(mine.name);
    expect(await remixIntoMyHomes(remix, { store: noDb, storage: oneHome, session: fakeStorage(), replaceIfNeeded: true })).toBe("ok");
    expect(JSON.parse(oneHome.getItem(PROJECT_KEY)!).name).toBe(remix.name);
    expect(oneHome.getItem(SHELF_KEY)).toBeNull();
  });

  it("spots in-app browsers", () => {
    expect(inAppBrowser("Mozilla/5.0 (iPhone) Instagram 300.0")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14; wv) [FBAN/FB4A;FBAV/450.0]")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile Safari/604.1")).toBe(false);
  });
});

describe("share links on this device", () => {
  it("remembers links per home and notices changes", () => {
    const storage = fakeStorage();
    const home = createPreset("compact");
    const link = { id: "AbCdEfGh12", token: "t".repeat(43), updatedAt: 1, showName: true, showCity: false, fingerprint: fingerprint(home) };
    expect(linkFor("home-a", storage)).toBeNull();
    saveLink("home-a", link, storage);
    expect(linkFor("home-a", storage)).toEqual(link);
    expect(fingerprint(home)).toBe(link.fingerprint);
    expect(fingerprint({ ...home, name: "Changed" })).not.toBe(link.fingerprint);
    forgetLink("home-a", storage);
    expect(linkFor("home-a", storage)).toBeNull();
    expect(shareUrl("AbCdEfGh12", "https://home.amankeshri.com")).toBe("https://home.amankeshri.com/h/AbCdEfGh12");
  });
});

describe("reading shared homes", () => {
  it("opens homes made with a newer Dream Home, simplifying unknown looks", () => {
    const home = createPreset("compact");
    expect(parseShared(home)).toEqual({ project: home, simplified: false });
    const future = { ...home, style: { ...(home.style ?? {}), preset: "martian-modern" } };
    const read = parseShared(future);
    expect(read.simplified).toBe(true);
    expect(read.project.name).toBe(home.name);
    // Finishes from a newer app fall back to the defaults too.
    const room = home.floors[0].rooms[0];
    const newer = {
      ...home,
      style: { preset: "kerala", exterior: "moon-dust", roof: { style: "hip", material: "glass-tiles", pitch: 30 } },
      floors: [{ ...home.floors[0], rooms: [{ ...room, floorMaterial: "lava", wallColor: "ultraviolet" }, ...home.floors[0].rooms.slice(1)] }, ...home.floors.slice(1)],
    };
    const simpler = parseShared(newer);
    expect(simpler.simplified).toBe(true);
    expect(simpler.project.style).toEqual({ preset: "kerala" });
    expect(simpler.project.floors[0].rooms[0].floorMaterial).toBeUndefined();
    expect(simpler.project.floors[0].rooms[0].wallColor).toBeUndefined();
    // Newer roofs, railings, furniture and garden pieces too.
    const pieces = {
      ...home,
      style: { roof: { style: "dome", material: "terracotta", pitch: 30 }, details: { railing: "rope", chhajja: true } },
      floors: [{ ...home.floors[0], rooms: [{ ...room, furniture: [{ id: "f1", catalogId: "hoverboard", x: 100, z: 100, rotation: 0 }, { id: "f2", catalogId: "sofa-2", x: 120, z: 120, rotation: 0, finish: "gold-leaf" }] }, ...home.floors[0].rooms.slice(1)] }, ...home.floors.slice(1)],
      landscape: [{ id: "l1", kind: "baobab", x: 100, z: 100, rotation: 0 }],
    };
    const read2 = parseShared(pieces);
    expect(read2.simplified).toBe(true);
    expect(read2.project.style).toEqual({ details: { chhajja: true } });
    expect(read2.project.floors[0].rooms[0].furniture).toEqual([{ id: "f2", catalogId: "sofa-2", x: 120, z: 120, rotation: 0 }]);
    expect(read2.project.landscape).toEqual([]);
    // Prototype names are never ids.
    expect(() => parseShared({ ...home, style: { exterior: "constructor" } })).not.toThrow();
    expect(parseShared({ ...home, style: { exterior: "constructor" } }).project.style?.exterior).toBeUndefined();
    expect(() => parseShared({ name: "not a home" })).toThrow();
  });
});
