// Where each home's full copy is kept: IndexedDB (plenty of room for a dozen
// homes). Browsers without it (some private windows) get a store that says so,
// and the app keeps working with one home at a time.

export type HomeStore = {
  /** False when this browser can't keep more than the open home. */
  persistent: boolean;
  get(id: string): Promise<string | null>;
  put(id: string, json: string): Promise<void>;
  remove(id: string): Promise<void>;
};

export function memoryHomeStore(persistent = true): HomeStore {
  const homes = new Map<string, string>();
  return {
    persistent,
    async get(id) {
      return homes.get(id) ?? null;
    },
    async put(id, json) {
      homes.set(id, json);
    },
    async remove(id) {
      homes.delete(id);
    },
  };
}

const DB = "dream-home";
const STORE = "homes";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("Device storage failed."));
  });
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("Device storage is unavailable."));
    r.onblocked = () => reject(new Error("Device storage is busy in another tab."));
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  const tx = db.transaction(STORE, mode);
  // Listen before anything can finish: a write only counts once it's committed.
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Device storage failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Device storage is full."));
  });
  const [result] = await Promise.all([request(work(tx.objectStore(STORE))), done]);
  return result;
}

export function deviceHomeStore(): HomeStore {
  if (typeof indexedDB === "undefined") return memoryHomeStore(false);
  return {
    persistent: true,
    async get(id) {
      const value = await run("readonly", (s) => s.get(id) as IDBRequest<unknown>);
      return typeof value === "string" ? value : null;
    },
    async put(id, json) {
      await run("readwrite", (s) => s.put(json, id));
    },
    async remove(id) {
      await run("readwrite", (s) => s.delete(id));
    },
  };
}
