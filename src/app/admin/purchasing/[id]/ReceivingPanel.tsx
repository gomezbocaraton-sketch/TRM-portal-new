'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { receiveItems } from '../actions';

type Line = { id: number; description: string; quantity: number; received: number };

// Type how many of each item arrived (or receive everything that is left). Partly received orders turn orange, fully received teal.
export function ReceivingPanel({ purchaseId, lines }: { purchaseId: number; lines: Line[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(all: boolean) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const payload = lines
        .map((l) => ({ id: l.id, qty: all ? Math.max(0, l.quantity - l.received) : Number(qty[l.id] || 0) }))
        .filter((l) => l.qty > 0);
      const res = await receiveItems(purchaseId, payload);
      if (res.error) setError(res.error);
      else {
        setQty({});
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError('That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-right text-sm';
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-soft">
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="py-2 pr-2 text-right font-medium">Ordered</th>
              <th className="py-2 pr-2 text-right font-medium">Received</th>
              <th className="py-2 text-right font-medium">Arrived now</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const done = l.received >= l.quantity;
              return (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2 pr-2 text-right">{l.quantity}</td>
                  <td className={`py-2 pr-2 text-right font-semibold ${done ? 'text-teal-700' : l.received > 0 ? 'text-orange-600' : 'text-ink-soft'}`}>
                    {l.received}
                    {done ? ' ✓' : ''}
                  </td>
                  <td className="py-2 text-right">
                    {done ? (
                      <span className="text-xs text-ink-soft">complete</span>
                    ) : (
                      <input value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} placeholder="0" inputMode="decimal" className={input} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => save(false)} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? 'Saving…' : 'Record what arrived'}
        </button>
        <button onClick={() => save(true)} disabled={busy} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-accent disabled:opacity-60">
          Receive everything that is left
        </button>
        {saved && <span className="text-xs font-semibold text-success">Saved ✓</span>}
        {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
      </div>
    </div>
  );
}
