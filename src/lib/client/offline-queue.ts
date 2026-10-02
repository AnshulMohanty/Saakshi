/**
 * Offline capture queue (B5.12, DH Offline): a photo taken without a connection is kept on the
 * phone in IndexedDB with its device time and fix, and uploaded, oldest first, when the phone is
 * back online. Queued photos say `taken_offline=1`, so the server never attests them ("Taken
 * offline: time from your phone", lib/capture/token.ts). The store is an interface so the flush
 * logic is tested without a browser.
 */

export interface QueuedShot {
  id: string;
  /** Device clock when it was queued (the shutter). */
  createdAt: string;
  filename: string;
  /** Upload context (lib/ingest/tickets.ts CONTEXT_KEYS), including taken_offline=1. */
  context: Record<string, string>;
  blob: Blob;
}

export interface ShotStore {
  put(s: QueuedShot): Promise<void>;
  all(): Promise<QueuedShot[]>;
  delete(id: string): Promise<void>;
}

export function memoryStore(): ShotStore {
  const m = new Map<string, QueuedShot>();
  return {
    put: async (s) => void m.set(s.id, s),
    all: async () => [...m.values()],
    delete: async (id) => void m.delete(id),
  };
}

const DB = "saakshi-capture";
const STORE = "queue";

/** The browser store (one object store keyed by id). */
export function idbStore(name = DB): ShotStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    put: async (s) => void (await run("readwrite", (st) => st.put(s))),
    all: () => run<QueuedShot[]>("readonly", (st) => st.getAll() as IDBRequest<QueuedShot[]>),
    delete: async (id) => void (await run("readwrite", (st) => st.delete(id))),
  };
}

export async function enqueue(store: ShotStore, shot: Omit<QueuedShot, "id" | "context"> & { context: Record<string, string | undefined> }): Promise<QueuedShot> {
  const context = Object.fromEntries(Object.entries({ ...shot.context, taken_offline: "1" }).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ""));
  const q: QueuedShot = { ...shot, id: `${Date.parse(shot.createdAt) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`, context };
  await store.put(q);
  return q;
}

/**
 * Uploads every queued photo, oldest first, removing each one the server accepted. Stops at the
 * first failure (still offline, or the server is down) and keeps the rest for the next try.
 */
export async function flush<R>(store: ShotStore, upload: (s: QueuedShot) => Promise<R>, onSent?: (s: QueuedShot, r: R) => void): Promise<{ sent: number; left: number; error: string | null }> {
  const all = (await store.all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let sent = 0;
  for (const s of all) {
    let r: R;
    try {
      r = await upload(s);
    } catch (err) {
      return { sent, left: all.length - sent, error: err instanceof Error ? err.message : String(err) };
    }
    await store.delete(s.id);
    sent++;
    onSent?.(s, r);
  }
  return { sent, left: 0, error: null };
}
