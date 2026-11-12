'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callFunction, isNetworkFailure } from '@/lib/api';
import { announceQueueChange, browserStore, flushQueue, QUEUE_EVENT, type QueuedClock, type SendOutcome } from '@/lib/offline-queue';
import { useSession } from '@/lib/session';
import { useToast } from '@/components/ui/Toast';

/** Sends clock-ins saved while offline: on start, when the connection returns, and when one is added. */
export function ClockQueueSync() {
  const { client, status } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const running = useRef(false);

  const flush = useCallback(async () => {
    if (running.current || status !== 'signed_in' || !navigator.onLine) return;
    running.current = true;
    try {
      const send = async (item: QueuedClock): Promise<SendOutcome> => {
        let path = item.body.selfie_path as string | null;
        if (item.selfie && item.selfiePath) {
          const up = await client.storage.from('selfies').upload(item.selfiePath, item.selfie, { contentType: 'image/webp', upsert: true });
          if (up.error) return 'network';
          path = item.selfiePath;
        }
        const res = await callFunction(client, item.kind, { ...item.body, selfie_path: path });
        if (res.ok) return 'sent';
        return isNetworkFailure(res) ? 'network' : 'rejected';
      };
      const result = await flushQueue(browserStore(), send);
      if (result.sent || result.rejected) {
        announceQueueChange();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['open-shift'] }),
          queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        ]);
        if (result.sent) toast(result.sent === 1 ? 'Saved clock-in sent.' : `${result.sent} saved clock events sent.`);
        if (result.rejected) toast('A saved clock event could not be recorded. Check Attendance or ask HR.', 'danger');
      }
    } finally {
      running.current = false;
    }
  }, [client, status, queryClient, toast]);

  useEffect(() => {
    void flush();
    window.addEventListener('online', flush);
    window.addEventListener(QUEUE_EVENT, flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener(QUEUE_EVENT, flush);
    };
  }, [flush]);

  return null;
}
