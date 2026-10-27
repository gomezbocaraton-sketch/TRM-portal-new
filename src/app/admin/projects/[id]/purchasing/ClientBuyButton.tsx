'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setClientBuying } from './actions';

// Marks items as client buying (or moves them back). With no itemIds it uses the items ticked in the list.
export function ClientBuyButton({
  projectId,
  itemIds,
  on,
  label,
  className,
}: {
  projectId: string;
  itemIds?: number[];
  on: boolean;
  label: string;
  className: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function click(e: React.MouseEvent) {
    e.preventDefault();
    setError('');
    const ids =
      itemIds ??
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked')).map((el) => Number(el.value));
    if (ids.length === 0) {
      setError('Tick the items first.');
      return;
    }
    setBusy(true);
    try {
      const res = await setClientBuying(projectId, ids, on);
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
      <button type="button" onClick={click} disabled={busy} className={`${className} disabled:opacity-60`}>
        {busy ? 'Saving…' : label}
      </button>
      {error && <span className="mt-1 max-w-xs text-xs text-red-600">{error}</span>}
    </span>
  );
}
