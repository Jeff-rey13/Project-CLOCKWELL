'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Registers the service worker (production builds only) and shows "Update available" when a new
 * release is waiting. Tapping Update switches to it and reloads (PRD 8).
 */
/** Set only when the person taps Update, so a first install never reloads the page by itself. */
let updateAccepted = false;

export function AppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloading = false;
    const onController = () => {
      if (!updateAccepted || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onController);

    void navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) setWaiting(next);
        });
      });
      // Check for a new release when the app comes back to the front.
      const check = () => document.visibilityState === 'visible' && void reg.update();
      document.addEventListener('visibilitychange', check);
    });
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onController);
  }, []);

  if (!waiting) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 mx-auto flex max-w-[480px] items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 shadow"
    >
      <span className="text-sm font-semibold">Update available</span>
      <Button
        className="min-h-9 px-4"
        onClick={() => {
          updateAccepted = true;
          waiting.postMessage('SKIP_WAITING');
        }}
      >
        Update
      </Button>
    </div>
  );
}
