'use client';

import { useMemo, useState } from 'react';
import { attachCostFile, deleteCost } from './cost-actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

export type CostRow = {
  id: number | string;
  category: string;
  vendor: string;
  amount: number;
  cost_date: string | null;
  description: string | null;
  doc_type: string | null;
  file_name: string | null;
  signedUrl: string | null;
  milestone: string;
};

type View = 'category' | 'vendor' | 'milestone';
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export function CostsLedger({ projectId, costs }: { projectId: string | number; costs: CostRow[] }) {
  const [view, setView] = useState<View>('category');
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [fVendor, setFVendor] = useState('');
  const [fMs, setFMs] = useState('');
  const [confirmId, setConfirmId] = useState<string | number | null>(null);
  const [attachId, setAttachId] = useState<string | number | null>(null);

  const total = costs.reduce((s, c) => s + c.amount, 0);

  const groups = useMemo(() => {
    const m = new Map<string, { total: number; n: number }>();
    for (const c of costs) {
      const k = c[view] || '—';
      const g = m.get(k) ?? { total: 0, n: 0 };
      g.total += c.amount;
      g.n += 1;
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [costs, view]);
  const max = groups[0]?.[1].total || 1;

  const uniq = (k: 'category' | 'vendor' | 'milestone') => [...new Set(costs.map((c) => c[k]))].sort();

  const filtered = costs.filter((c) => {
    if (fCat && c.category !== fCat) return false;
    if (fVendor && c.vendor !== fVendor) return false;
    if (fMs && c.milestone !== fMs) return false;
    const s = q.trim().toLowerCase();
    if (s && !(c.vendor + ' ' + (c.description ?? '')).toLowerCase().includes(s)) return false;
    return true;
  });
  const shownTotal = filtered.reduce((s, c) => s + c.amount, 0);
  const missing = costs.filter((c) => !c.file_name).length;
  const anyFilter = q || fCat || fVendor || fMs;

  function pick(key: string) {
    if (view === 'category') setFCat(fCat === key ? '' : key);
    if (view === 'vendor') setFVendor(fVendor === key ? '' : key);
    if (view === 'milestone') setFMs(fMs === key ? '' : key);
  }
  const active = (key: string) => (view === 'category' ? fCat : view === 'vendor' ? fVendor : fMs) === key;

  const sel = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm';

  return (
    <>
      <div className="mb-6 rounded-card border border-line bg-white p-6">
        <p className="text-sm font-semibold text-navy">Cost breakdown</p>
        <p className="mb-3 text-xs text-ink-soft">Click any row to filter the list of costs below.</p>
        <div className="mb-4 inline-flex rounded-lg bg-paper p-1">
          {(['category', 'vendor', 'milestone'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === v ? 'bg-white text-navy shadow-sm' : 'text-ink-soft'}`}
            >
              By {v}
            </button>
          ))}
        </div>
        {groups.length === 0 && <p className="text-sm text-ink-soft">No costs recorded yet.</p>}
        <div className="space-y-2">
          {groups.map(([key, g]) => (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left sm:grid-cols-[180px_1fr_90px_40px] ${active(key) ? 'bg-paper ring-1 ring-accent' : 'hover:bg-paper'}`}
            >
              <span className="text-sm text-ink">
                {key} <span className="text-xs text-ink-soft">{g.n} {g.n === 1 ? 'cost' : 'costs'}</span>
              </span>
              <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-paper sm:order-none sm:col-span-1">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(g.total / max) * 100}%` }} />
              </span>
              <span className="text-right text-sm font-semibold text-accent-deep">{money(g.total)}</span>
              <span className="hidden text-right text-xs text-ink-soft sm:block">{total ? Math.round((g.total / total) * 100) : 0}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-line bg-white p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-navy">All costs</p>
          {missing > 0 && (
            <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-deep">
              {missing} {missing === 1 ? 'cost has' : 'costs have'} no document
            </span>
          )}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor or description" className={`${sel} col-span-2 sm:col-span-1`} />
          <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={sel}>
            <option value="">All categories</option>
            {uniq('category').map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={fVendor} onChange={(e) => setFVendor(e.target.value)} className={sel}>
            <option value="">All vendors</option>
            {uniq('vendor').map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={fMs} onChange={(e) => setFMs(e.target.value)} className={sel}>
            <option value="">All milestones</option>
            {uniq('milestone').map((x) => <option key={x}>{x}</option>)}
          </select>
          <button type="button" disabled={!anyFilter} onClick={() => { setQ(''); setFCat(''); setFVendor(''); setFMs(''); }} className={`${sel} disabled:opacity-40`}>
            Clear
          </button>
        </div>

        {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">No costs match.</p>}
        <div className="divide-y divide-line">
          {filtered.map((c) => (
            <div key={c.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">{c.vendor}</p>
                  <p className="text-xs text-ink-soft">
                    {fmtDate(c.cost_date)} · {c.category} · {c.milestone}
                  </p>
                  {c.description && <p className="text-xs text-ink-soft">{c.description}</p>}
                </div>
                <p className="text-sm font-semibold text-accent-deep">{money(c.amount)}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                {c.file_name ? (
                  <>
                    {c.doc_type && <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft">{c.doc_type}</span>}
                    {c.signedUrl && <a href={c.signedUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">View file</a>}
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-accent-tint px-2 py-0.5 font-semibold text-accent-deep">No document</span>
                    <button type="button" onClick={() => setAttachId(attachId === c.id ? null : c.id)} className="font-semibold text-accent underline">Attach</button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => (confirmId === c.id ? deleteCost(projectId, c.id) : setConfirmId(c.id))}
                  onBlur={() => setConfirmId(null)}
                  className={`ml-auto underline ${confirmId === c.id ? 'font-semibold text-red-600' : 'text-ink-soft'}`}
                >
                  {confirmId === c.id ? 'Click again to delete' : 'Delete'}
                </button>
              </div>
              {attachId === c.id && !c.file_name && (
                <div className="mt-2 rounded-lg border border-line bg-paper p-3">
                  <FormWithFeedback action={attachCostFile.bind(null, projectId, c.id)} submitLabel="Attach document" pendingLabel="Attaching…">
                    <DropFileInput name="file" pathPrefix={`${projectId}/costs`} required />
                    <select name="docType" className={`${sel} mt-2`} defaultValue="Invoice">
                      <option>Invoice</option><option>Purchase order</option><option>Receipt</option><option>Other</option>
                    </select>
                  </FormWithFeedback>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-xs text-ink-soft">
          <span>Showing {filtered.length} of {costs.length} costs</span>
          <span>Total shown: <b className="text-accent-deep">{money(shownTotal)}</b></span>
        </div>
      </div>
    </>
  );
}
