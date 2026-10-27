'use client';

import { useState, useTransition } from 'react';
import { approveAllSubmitted } from './actions';

export function ApproveAllButton({ ids }: { ids: number[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await approveAllSubmitted(ids);
            if (!res.ok) setError(res.error);
          })
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Approving…' : 'Approve all'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
