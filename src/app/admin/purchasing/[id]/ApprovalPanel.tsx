'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelPurchase, decidePurchase } from '../actions';
import { money } from '@/lib/purchasing';

export function ApprovalPanel({
  purchaseId,
  status,
  isApprover,
  threshold,
  approverEmail,
  decisionText,
}: {
  purchaseId: number;
  status: 'pending' | 'approved' | 'rejected';
  isApprover: boolean;
  threshold: number;
  approverEmail: string;
  decisionText: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (status !== 'pending') {
    return <p className="rounded-lg bg-paper px-4 py-3 text-sm text-ink">{decisionText}</p>;
  }

  const decide = (d: 'approved' | 'rejected') => {
    setError('');
    start(async () => {
      const res = await decidePurchase(purchaseId, d, note);
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else router.refresh();
    });
  };

  const cancel = () => {
    setError('');
    start(async () => {
      const res = await cancelPurchase(purchaseId);
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else router.push('/admin/purchasing');
    });
  };

  return (
    <div className="rounded-lg bg-paper px-4 py-3">
      <p className="mb-3 text-sm text-ink">
        {isApprover
          ? `This order is over ${money(threshold)}. Review the items above, then approve or reject.`
          : `This order is over ${money(threshold)}, so only the approver (${approverEmail}) can approve it. They were emailed a link.`}
      </p>

      {isApprover && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Note (required if you reject)"
          className="mb-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={!isApprover || pending}
          onClick={() => decide('approved')}
          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Approve
        </button>
        <button
          disabled={!isApprover || pending}
          onClick={() => decide('rejected')}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (confirmCancel ? cancel() : setConfirmCancel(true))}
          onBlur={() => setConfirmCancel(false)}
          className={`ml-auto text-xs underline ${confirmCancel ? 'font-semibold text-red-600' : 'text-ink-soft'}`}
        >
          {confirmCancel ? 'Click again to cancel this order' : 'Cancel this order'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
