'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session';

/** Opens private files through short-lived signed URLs (5 minutes). */
export function ReceiptLinks({ paths, bucket = 'receipts' }: { paths: string[]; bucket?: string }) {
  const { client } = useSession();
  const [busy, setBusy] = useState<number | null>(null);
  if (paths.length === 0) return null;

  const open = async (i: number) => {
    const path = paths[i];
    if (!path) return;
    setBusy(i);
    // Open the tab first so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const { data } = await client.storage.from(bucket).createSignedUrl(path, 300);
    setBusy(null);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl;
    else tab?.close();
  };

  return (
    <span className="flex flex-wrap gap-2">
      {paths.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => open(i)}
          className="min-h-9 text-sm font-medium text-fg underline underline-offset-4"
        >
          {busy === i ? 'Opening' : paths.length > 1 ? `Receipt ${i + 1}` : 'View receipt'}
        </button>
      ))}
    </span>
  );
}
