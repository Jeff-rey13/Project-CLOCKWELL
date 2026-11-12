import { describe, expect, it } from 'vitest';
import { flushQueue, memoryStore, type QueuedClock, type SendOutcome } from './offline-queue';

const item = (id: string, createdAt: string, kind: QueuedClock['kind'] = 'clock-in'): QueuedClock => ({
  id,
  kind,
  body: { client_request_id: id },
  selfie: null,
  selfiePath: null,
  createdAt,
});

describe('flushQueue', () => {
  it('sends oldest first and empties the queue', async () => {
    const store = memoryStore();
    await store.put(item('b', '2026-11-12T01:05:00Z', 'clock-out'));
    await store.put(item('a', '2026-11-12T01:00:00Z'));
    const order: string[] = [];
    const r = await flushQueue(store, async (i) => {
      order.push(i.id);
      return 'sent';
    });
    expect(order).toEqual(['a', 'b']);
    expect(r).toEqual({ sent: 2, rejected: 0, remaining: 0 });
  });

  it('stops at a network failure and keeps the rest in order', async () => {
    const store = memoryStore();
    await store.put(item('a', '2026-11-12T01:00:00Z'));
    await store.put(item('b', '2026-11-12T01:05:00Z'));
    const r = await flushQueue(store, async (i): Promise<SendOutcome> => (i.id === 'a' ? 'network' : 'sent'));
    expect(r).toEqual({ sent: 0, rejected: 0, remaining: 2 });
  });

  it('removes items the server answered with an error (they will not succeed on retry)', async () => {
    const store = memoryStore();
    await store.put(item('a', '2026-11-12T01:00:00Z'));
    const r = await flushQueue(store, async () => 'rejected');
    expect(r).toEqual({ sent: 0, rejected: 1, remaining: 0 });
  });

  it('keeps the same request id so a retry after a lost answer is not recorded twice', async () => {
    const store = memoryStore();
    await store.put(item('same-id', '2026-11-12T01:00:00Z'));
    const seen: string[] = [];
    await flushQueue(store, async (i) => {
      seen.push(String(i.body.client_request_id));
      return 'network';
    });
    await flushQueue(store, async (i) => {
      seen.push(String(i.body.client_request_id));
      return 'sent';
    });
    expect(seen).toEqual(['same-id', 'same-id']);
  });
});
