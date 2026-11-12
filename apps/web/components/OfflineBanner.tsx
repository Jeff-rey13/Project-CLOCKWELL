'use client';

import { useSyncExternalStore } from 'react';
import { WifiSlash } from '@phosphor-icons/react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Shown while there is no connection (PRD 8): clock-in still works; other changes wait. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-box border border-line-strong bg-surface px-3 py-2 text-sm">
      <WifiSlash size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        <span className="font-semibold">You&apos;re offline.</span> Clock in and out still work and are sent when you
        reconnect. Other changes need a connection.
      </span>
    </div>
  );
}
