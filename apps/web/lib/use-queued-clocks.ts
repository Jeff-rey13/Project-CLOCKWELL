'use client';

import { useEffect, useState } from 'react';
import { browserStore, QUEUE_EVENT, type QueuedClock } from './offline-queue';

/** Clock events saved on this phone and not yet sent, oldest first. */
export function useQueuedClocks(): QueuedClock[] {
  const [items, setItems] = useState<QueuedClock[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      void browserStore()
        .all()
        .then((all) => active && setItems(all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))))
        .catch(() => undefined);
    load();
    window.addEventListener(QUEUE_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(QUEUE_EVENT, load);
    };
  }, []);
  return items;
}
