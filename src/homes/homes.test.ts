import { describe, expect, it } from "vitest";
import { createPreset } from "../domain/model";
import { editedWhen } from "../shell/MyHomes";
import { MAX_LINK, importFragment, moveLink, offersMove, packHome, unpackHome } from "./handoff";
import {
  MAX_HOMES,
  SHELF_KEY,
  addHome,
  entryFor,
  isFull,
  loadShelf,
  newHomeId,
  removeHome,
  saveShelf,
  switchTo,
  touchActive,
} from "./shelf";
import { memoryHomeStore } from "./store";

/** A tiny in-memory localStorage. */
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

describe("My homes shelf", () => {
  const home = createPreset("compact");

  it("starts with the home a device already has", () => {
    const storage = fakeStorage();
    const shelf = loadShelf(home, 1000, storage);
    expect(shelf.homes).toHaveLength(1);
    expect(shelf.homes[0]).toMatchObject({ id: shelf.activeId, name: home.name, updatedAt: 1000 });
    expect(saveShelf(shelf, storage)).toBe(true);
    expect(loadShelf(createPreset("courtyard"), 2000, storage)).toEqual(shelf);
  });

  it("ignores damaged or hostile shelves", () => {
    for (const raw of ["{oops", "null", '{"homes":"x"}', '{"homes":[{"id":"../../etc"}]}'])
      expect(loadShelf(home, 1, fakeStorage({ [SHELF_KEY]: raw })).homes).toHaveLength(1);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `home-${String(i).padStart(8, "0")}`, name: `H${i}` }));
    const shelf = loadShelf(home, 1, fakeStorage({ [SHELF_KEY]: JSON.stringify({ activeId: "home-missing00", homes: many }) }));
    expect(shelf.homes).toHaveLength(MAX_HOMES);
    expect(shelf.activeId).toBe(many[0].id);
  });

  it("adds new homes on top, switches, and never removes the open one", () => {
    let shelf = loadShelf(home, 1, fakeStorage());
    const first = shelf.activeId;
    const id = newHomeId();
    expect(id).toMatch(/^home-[a-z0-9]{12}$/);
    shelf = addHome(shelf, id, createPreset("courtyard"), 2);
    expect(shelf.activeId).toBe(id);
    expect(shelf.homes.map((h) => h.id)).toEqual([id, first]);
    expect(removeHome(shelf, id)).toBe(shelf);
    shelf = switchTo(shelf, first);
    expect(shelf.activeId).toBe(first);
    expect(switchTo(shelf, "home-nothere00")).toBe(shelf);
    shelf = touchActive(shelf, { ...home, name: "Renamed" }, 3);
    expect(shelf.homes[0]).toMatchObject({ id: first, name: "Renamed", updatedAt: 3 });
    expect(removeHome(shelf, id).homes.map((h) => h.id)).toEqual([first]);
  });

  it("knows when it is full and summarises each home", () => {
    let shelf = loadShelf(home, 1, fakeStorage());
    while (!isFull(shelf)) shelf = addHome(shelf, newHomeId(), home, 1);
    expect(shelf.homes).toHaveLength(MAX_HOMES);
    expect(entryFor("home-abcdefgh", home, 5)).toMatchObject({ floors: home.floors.length, updatedAt: 5 });
  });

  it("keeps copies in a store", async () => {
    const store = memoryHomeStore();
    await store.put("home-a1b2c3d4", "{}");
    expect(await store.get("home-a1b2c3d4")).toBe("{}");
    await store.remove("home-a1b2c3d4");
    expect(await store.get("home-a1b2c3d4")).toBeNull();
    expect(memoryHomeStore(false).persistent).toBe(false);
  });

  it("says when a home was edited", () => {
    const now = new Date(2026, 9, 17, 15, 0).getTime();
    expect(editedWhen(now - 10_000, now)).toBe("Edited just now");
    expect(editedWhen(new Date(2026, 9, 17, 9, 0).getTime(), now)).toBe("Edited today");
    expect(editedWhen(new Date(2026, 9, 16, 22, 0).getTime(), now)).toBe("Edited yesterday");
    expect(editedWhen(new Date(2026, 9, 13).getTime(), now)).toBe("Edited 4 days ago");
    expect(editedWhen(new Date(2026, 8, 1).getTime(), now)).toMatch(/^Edited on 1 Sept?/);
  });
});

describe("moving homes to the new address", () => {
  const home = createPreset("courtyard");

  it("packs a home into a link and back, fully validated", async () => {
    const packed = await packHome(home);
    expect(packed.startsWith("g.")).toBe(true);
    expect(packed).toMatch(/^g\.[A-Za-z0-9_-]+$/);
    expect(await unpackHome(packed)).toEqual(home);
    const link = moveLink(packed, "https://home.amankeshri.com");
    expect(link.startsWith("https://home.amankeshri.com/#import=g.")).toBe(true);
    expect(importFragment(new URL(link).hash)).toBe(packed);
    expect(importFragment("#something-else")).toBeNull();
  });

  it("accepts plain links and rejects anything that isn't a valid home", async () => {
    const plain = `j.${btoa(JSON.stringify(home)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    expect((await unpackHome(plain)).name).toBe(home.name);
    await expect(unpackHome("x.abc")).rejects.toThrow();
    await expect(unpackHome(`j.${btoa('{"not":"a home"}')}`)).rejects.toThrow();
    await expect(unpackHome(`j.${"A".repeat(MAX_LINK)}`)).rejects.toThrow(/too big/);
  });

  it("refuses a small link that would unpack into something huge", async () => {
    const zeros = new Uint8Array(5_000_000);
    const gz = new Uint8Array(
      await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
    );
    let binary = "";
    for (const b of gz) binary += String.fromCharCode(b);
    const packed = `g.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    expect(packed.length).toBeLessThan(20_000);
    await expect(unpackHome(packed)).rejects.toThrow(/too big/);
  });

  it("offers the move only on the old vercel.app address, once a new one is set", () => {
    const target = "https://home.amankeshri.com";
    expect(offersMove({ origin: "https://dream-home-liard-nine.vercel.app", hostname: "dream-home-liard-nine.vercel.app" }, target)).toBe(true);
    expect(offersMove({ origin: target, hostname: "home.amankeshri.com" }, target)).toBe(false);
    expect(offersMove({ origin: "http://localhost:5173", hostname: "localhost" }, target)).toBe(false);
    expect(offersMove({ origin: "https://dream-home-liard-nine.vercel.app", hostname: "dream-home-liard-nine.vercel.app" }, "")).toBe(false);
  });
});
