'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decidePurchase } from './actions';

// Approve or reject right from the list. Only the approver's login ever sees these buttons, and the server checks it again.
export function QuickDecision({ purchaseId }: { purchaseId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const decide = (d: 'approved' | 'rejected') => {
    setError('');
    start(async () => {
      const res = await decidePurchase(purchaseId, d, note);
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else router.refresh();
    });
  };

  return (
    <div className="mt-2 rounded-lg border border-accent bg-accent-tint px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-accent-deep">Waiting for your approval. Open the order to review the items first.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (required if you reject)"
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm"
        />
        <button disabled={pending} onClick={() => decide('approved')} className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Approve
        </button>
        <button disabled={pending} onClick={() => decide('rejected')} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
          Reject
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
