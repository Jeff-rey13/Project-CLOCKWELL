/**
 * Offline clock-in / clock-out queue (PRD 8). When there is no connection, the clock event is kept on
 * the phone (IndexedDB) with its own client_request_id and the device time, and sent when back online.
 * The server records its own time on arrival and flags `sent_late` when that is more than 10 minutes
 * after the device time. Sending the same id twice is safe (functions are idempotent).
 */

export interface QueuedClock {
  /** The client_request_id; also the queue key. */
  id: string;
  kind: 'clock-in' | 'clock-out';
  body: Record<string, unknown>;
  /** Selfie to upload before sending, and where to put it. */
  selfie: Blob | null;
  selfiePath: string | null;
  createdAt: string;
}

export interface QueueStore {
  all(): Promise<QueuedClock[]>;
  put(item: QueuedClock): Promise<void>;
  remove(id: string): Promise<void>;
}

/** What happened when one item was tried. */
export type SendOutcome = 'sent' | 'rejected' | 'network';

export interface FlushResult {
  sent: number;
  rejected: number;
  remaining: number;
}

/**
 * Sends queued items oldest first. Stops at the first network failure so order is kept.
 * A definite answer from the server (success or a business error) removes the item.
 */
export async function flushQueue(store: QueueStore, send: (item: QueuedClock) => Promise<SendOutcome>): Promise<FlushResult> {
  const items = (await store.all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let sent = 0;
  let rejected = 0;
  for (const item of items) {
    const outcome = await send(item);
    if (outcome === 'network') break;
    await store.remove(item.id);
    if (outcome === 'sent') sent++;
    else rejected++;
  }
  return { sent, rejected, remaining: (await store.all()).length };
}

/** In-memory store, for tests and for browsers without IndexedDB. */
export function memoryStore(): QueueStore {
  const map = new Map<string, QueuedClock>();
  return {
    all: async () => [...map.values()],
    put: async (item) => void map.set(item.id, item),
    remove: async (id) => void map.delete(id),
  };
}

const DB = 'clockwell';
const STORE = 'clock-queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

/** IndexedDB store; falls back to memory where IndexedDB is unavailable (e.g. private mode). */
export function browserStore(): QueueStore {
  if (typeof indexedDB === 'undefined') return memoryStore();
  return {
    all: () => tx<QueuedClock[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedClock[]>),
    put: (item) => tx('readwrite', (s) => s.put(item)).then(() => undefined),
    remove: (id) => tx('readwrite', (s) => s.delete(id)).then(() => undefined),
  };
}

/** Tells listeners (Home, the sync component) that the queue changed. */
export const QUEUE_EVENT = 'clock-queue-change';
export function announceQueueChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT));
}
