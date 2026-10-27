'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { findPricesFor } from './actions';

// Looks up the three web prices for every item that has none yet, one item at a time.
export function FindAllPrices({ items, configured }: { items: { id: number; name: string }[]; configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setProblems([]);
    const bad: string[] = [];
    let done = 0;
    for (const it of items) {
      setProgress(`Finding prices… ${done} of ${items.length} items done`);
      try {
        const r = await findPricesFor(it.id);
        if (r.error) bad.push(`${it.name}: ${r.error}`);
      } catch {
        bad.push(`${it.name}: the search did not finish`);
      }
      done += 1;
    }
    setProblems(bad);
    setProgress('');
    setBusy(false);
    router.refresh();
  }

  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-card border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy">Find prices for all items</p>
          <p className="text-xs text-ink-soft">
            Searches the web for {items.length} item{items.length === 1 ? '' : 's'} without prices and shows the lowest price, best value and fastest delivery on each row. Uses one search per item.
          </p>
        </div>
        <button onClick={run} disabled={busy || !configured} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Searching…' : `Find prices for ${items.length} item${items.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {!configured && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Not connected yet. It needs SERPAPI_KEY added in Vercel.</p>}
      {busy && progress && <p className="mt-3 text-sm font-semibold text-navy">{progress} Keep this page open.</p>}
      {problems.length > 0 && (
        <div className="mt-3 text-xs text-red-700">
          <p className="font-semibold">Some items were not found:</p>
          <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="mt-1 text-ink-soft">Open the item and search with other words, or add a quote by hand.</p>
        </div>
      )}
    </div>
  );
}
