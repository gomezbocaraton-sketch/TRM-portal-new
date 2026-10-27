'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markItemPurchased } from './actions';

export function MarkPurchasedButton({ projectId, itemId, on, label }: { projectId: string; itemId: number; on: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function click() {
    setBusy(true);
    setError('');
    try {
      const res = await markItemPurchased(projectId, itemId, on);
      if (res.error) setError(res.error);
      else router.refresh();
    } catch {
      setError('That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className={on ? 'rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60' : 'text-xs text-ink-soft underline disabled:opacity-60'}
      >
        {busy ? 'Saving…' : label}
      </button>
      {error && <span className="mt-1 max-w-xs text-xs text-red-600">{error}</span>}
    </span>
  );
}
