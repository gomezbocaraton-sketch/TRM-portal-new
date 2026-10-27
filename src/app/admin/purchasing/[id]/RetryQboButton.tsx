'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { retryQboBill } from '../actions';

export function RetryQboButton({ invoiceId }: { invoiceId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function click() {
    setBusy(true);
    setError('');
    try {
      const res = await retryQboBill(invoiceId);
      if (res.error) setError(res.error);
      router.refresh();
    } catch {
      setError('That did not finish. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={click} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
        {busy ? 'Sending…' : 'Send to QuickBooks'}
      </button>
      {error && <span className="max-w-md text-xs text-red-600">{error}</span>}
    </span>
  );
}
