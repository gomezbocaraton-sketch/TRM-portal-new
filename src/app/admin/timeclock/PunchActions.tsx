'use client';

import { useState, useTransition } from 'react';
import { approvePunch, deletePunch, markReviewed, reopenPunch, updatePunchTimes } from './actions';

export function PunchActions({
  id,
  inLocal,
  outLocal,
  needsReview,
  status = 'open',
  finished = true,
}: {
  id: number;
  inLocal: string;
  outLocal: string;
  needsReview: boolean;
  status?: string;
  finished?: boolean;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [inV, setInV] = useState(inLocal);
  const [outV, setOutV] = useState(outLocal);
  const [error, setError] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError('');
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else after?.();
    });
  };

  const link = 'text-xs font-semibold text-accent underline disabled:opacity-50';
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-3">
        {finished && status !== 'approved' && (
          <button disabled={pending} className={link} onClick={() => run(() => approvePunch(id))}>
            Approve
          </button>
        )}
        {status === 'approved' && (
          <button disabled={pending} className={link} onClick={() => run(() => reopenPunch(id))}>
            Reopen
          </button>
        )}
        {needsReview && (
          <button disabled={pending} className={link} onClick={() => run(() => markReviewed(id))}>
            Mark reviewed
          </button>
        )}
        <button className={link} onClick={() => setEditing(!editing)}>
          {editing ? 'Close' : 'Edit times'}
        </button>
        <button
          disabled={pending}
          onBlur={() => setConfirmDel(false)}
          className={`text-xs underline ${confirmDel ? 'font-semibold text-red-600' : 'text-ink-soft'}`}
          onClick={() => (confirmDel ? run(() => deletePunch(id)) : setConfirmDel(true))}
        >
          {confirmDel ? 'Click again to delete' : 'Delete'}
        </button>
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-paper p-3">
          <label className="block text-xs text-ink-soft">
            Clock in (Eastern time)
            <input type="datetime-local" value={inV} onChange={(e) => setInV(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1 text-sm" />
          </label>
          <label className="block text-xs text-ink-soft">
            Clock out (leave empty if still working)
            <input type="datetime-local" value={outV} onChange={(e) => setOutV(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1 text-sm" />
          </label>
          <button
            disabled={pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={() => run(() => updatePunchTimes(id, inV, outV), () => setEditing(false))}
          >
            {pending ? 'Saving…' : 'Save times'}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
