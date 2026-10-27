'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeOrder } from '../actions';

export function CloseOrderButton({ purchaseId, summary }: { purchaseId: number; summary: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function click() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await closeOrder(purchaseId);
      if (res.error) setError(res.error);
      else router.refresh();
    } catch {
      setError('That did not save. Try again.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={click}
        onBlur={() => setConfirm(false)}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${confirm ? 'bg-green-700' : 'bg-green-600'}`}
      >
        {busy ? 'Closing…' : confirm ? 'Click again to close this order' : 'Close this order'}
      </button>
      <p className="mt-1 text-xs text-ink-soft">{summary}</p>
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
