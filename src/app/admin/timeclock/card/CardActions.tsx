'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approvePunch, reopenPunch } from '../actions';

export function CardActions({ ids, allApproved }: { ids: number[]; allApproved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  if (ids.length === 0) return null;
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError('');
            for (const id of ids) {
              const res = allApproved ? await reopenPunch(id) : await approvePunch(id);
              if (!res.ok) {
                setError(res.error);
                return;
              }
            }
            router.refresh();
          })
        }
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${allApproved ? 'border border-line bg-white text-navy' : 'bg-accent text-white'}`}
      >
        {pending ? 'Saving…' : allApproved ? 'Reopen' : 'Approve'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
