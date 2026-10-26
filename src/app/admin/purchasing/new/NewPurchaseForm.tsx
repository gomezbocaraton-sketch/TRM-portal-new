'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPurchase } from '../actions';
import { DropFileInput } from '@/components/DropFileInput';
import { money, PURCHASE_DOC_CATEGORIES } from '@/lib/purchasing';

type Item = { description: string; quantity: string; unit: string; unitPrice: string };
const blank = (): Item => ({ description: '', quantity: '1', unit: '', unitPrice: '' });

export function NewPurchaseForm({
  projects,
  threshold,
}: {
  projects: { id: string; name: string }[];
  threshold: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [items, setItems] = useState<Item[]>([blank()]);

  const total = items.reduce((s, i) => {
    const q = parseFloat(i.quantity.replace(/[$,]/g, ''));
    const p = parseFloat(i.unitPrice.replace(/[$,]/g, ''));
    return s + (q > 0 && p >= 0 ? q * p : 0);
  }, 0);

  const setItem = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createPurchase({
        projectId: String(fd.get('project') ?? ''),
        vendor: String(fd.get('vendor') ?? ''),
        notes: String(fd.get('notes') ?? ''),
        items,
        filePath: String(fd.get('file') ?? ''),
        fileCategory: String(fd.get('category') ?? 'Quote'),
      });
      if (res.ok) router.push(`/admin/purchasing/${res.id}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Vendor *</label>
          <input name="vendor" required className={input} placeholder="Home Depot Pro" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Project</label>
          <select name="project" defaultValue="" className={input}>
            <option value="">No project / general</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-2 text-xs font-semibold text-navy">Items</p>
      <div className="mb-2 space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <input
              className={`${input} col-span-12 sm:col-span-5`}
              placeholder="Description"
              value={it.description}
              onChange={(e) => setItem(idx, { description: e.target.value })}
            />
            <input
              className={`${input} col-span-3 sm:col-span-2`}
              placeholder="Qty"
              inputMode="decimal"
              value={it.quantity}
              onChange={(e) => setItem(idx, { quantity: e.target.value })}
            />
            <input
              className={`${input} col-span-3 sm:col-span-2`}
              placeholder="Unit"
              value={it.unit}
              onChange={(e) => setItem(idx, { unit: e.target.value })}
            />
            <input
              className={`${input} col-span-4 sm:col-span-2`}
              placeholder="Price each"
              inputMode="decimal"
              value={it.unitPrice}
              onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
            />
            <button
              type="button"
              aria-label="Remove item"
              disabled={items.length === 1}
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
              className="col-span-2 text-sm text-ink-soft underline disabled:opacity-30 sm:col-span-1"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, blank()])}
        className="mb-4 text-sm font-semibold text-accent underline"
      >
        + Add another item
      </button>

      <div className="mb-4 rounded-lg bg-paper px-4 py-3 text-sm">
        <p className="text-ink">
          Total: <b>{money(total)}</b>
        </p>
        <p className={`text-xs ${total > threshold ? 'text-accent-deep' : 'text-success'}`}>
          {total > threshold
            ? `Over ${money(threshold)}: this order will wait for approval.`
            : `${money(threshold)} or less: this order will be approved automatically.`}
        </p>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-ink-soft">Notes</label>
        <textarea name="notes" rows={2} className={input} placeholder="Delivery date, who is picking it up, anything the approver should know" />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-paper p-4">
        <p className="mb-2 text-xs font-semibold text-navy">Attach a quote or document (optional)</p>
        <div className="mb-3">
          <select name="category" defaultValue="Quote" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-64">
            {PURCHASE_DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <DropFileInput name="file" pathPrefix="purchasing/new" />
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Saving…' : total > threshold ? 'Submit for approval' : 'Save purchase'}
      </button>
    </form>
  );
}
