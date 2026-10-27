'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDraftItems, finishPlanRead, planReadPlan, readPlanChunk, type DraftItem, type PlanPart } from './actions';
import type { PlanItem } from '@/lib/plans-read';

type Step = { id: string; name: string; date: string };

export function ReadPlansPanel({ projectId, steps, planFiles, configured }: { projectId: string; steps: Step[]; planFiles: number; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  // Reads the plans in parts, three at a time, so big plan sets work. Each part is one short request.
  async function read() {
    setError('');
    setInfo('');
    setDrafts(null);
    setBusy(true);
    try {
      setProgress('Counting the pages…');
      const plan = await planReadPlan(projectId);
      if (plan.error || !plan.parts) {
        setError(plan.error ?? 'Nothing was read.');
        return;
      }
      const queue: PlanPart[] = [...plan.parts];
      let total = queue.length;
      let done = 0;
      const found: PlanItem[] = [];
      const notes: string[] = [...(plan.notes ?? [])];
      const label = (p: PlanPart) => `${p.name} pages ${p.from}-${p.to}`;

      async function worker() {
        for (;;) {
          const part = queue.shift();
          if (!part) return;
          let result = await readPlanChunk(projectId, part);
          for (let tries = 0; result.error && tries < 2; tries++) result = await readPlanChunk(projectId, part);
          if (result.split) {
            const mid = Math.floor((part.from + part.to) / 2);
            queue.unshift({ ...part, from: mid + 1 }, { ...part, to: mid });
            total += 1;
            continue;
          }
          if (result.skipped) notes.push(result.skipped);
          else if (result.error) notes.push(`${label(part)} (${result.error})`);
          else if (result.items) found.push(...result.items);
          done += 1;
          setProgress(`Read ${done} of ${total} parts of the plans…`);
        }
      }
      setProgress(`Read 0 of ${total} parts of the plans…`);
      await Promise.all([worker(), worker(), worker()]);

      if (found.length === 0) {
        setError(notes.length ? `Nothing could be read. ${notes.join('; ')}.` : 'No items were found in the plans.');
        return;
      }
      setProgress('Combining the list…');
      const res = await finishPlanRead(projectId, found);
      if (res.error || !res.items) {
        setError(res.error ?? 'Nothing was read.');
        return;
      }
      setDrafts(res.items);
      setPicked(new Set(res.items.filter((i) => i.milestoneId).map((i) => i.key)));
      setInfo(
        `Read ${plan.parts.length} parts of the plans.` +
          (notes.length ? ` Not read: ${notes.join('; ')}. Read the plans again or upload those sheets separately.` : '') +
          (res.items.length === 0 ? ' Nothing new to add.' : '')
      );
    } catch {
      setError('Reading was interrupted. Click Read the plans to try again.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function change(key: number, patch: Partial<DraftItem>) {
    setDrafts((d) => (d ? d.map((x) => (x.key === key ? { ...x, ...patch } : x)) : d));
  }

  function add() {
    if (!drafts) return;
    setError('');
    const chosen = drafts.filter((d) => picked.has(d.key));
    start(async () => {
      const res = await addDraftItems(projectId, chosen);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDrafts(null);
      setInfo(`Added ${chosen.filter((c) => c.milestoneId).length} items to the buy plan.`);
      router.refresh();
    });
  }

  const input = 'w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm';

  return (
    <div className="mb-5 rounded-card border border-line bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy">Read the plans</p>
          <p className="text-xs text-ink-soft">
            The system reads the plan PDFs on the Documents tab ({planFiles} found) and drafts the list of items to buy. You review it before anything is added.
          </p>
        </div>
        <button onClick={read} disabled={busy || pending || !configured || planFiles === 0} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Reading…' : 'Read the plans'}
        </button>
      </div>
      {!configured && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Not connected yet. It needs ANTHROPIC_API_KEY added in Vercel.</p>}
      {configured && planFiles === 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No plan PDFs found. Upload them on the Documents tab with the category Plans.</p>}
      {busy && progress && <p className="mt-3 text-sm font-semibold text-navy">{progress} Keep this page open. Big plan sets take a few minutes.</p>}
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      {info && <p className="mt-3 text-xs text-ink-soft">{info}</p>}

      {drafts && drafts.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-ink-soft">This is a draft. Check the quantities against the plans, choose the schedule step for each item, and untick anything you do not want.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2"></th><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2">Needed for</th><th className="py-2">Delivery days</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.key} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={picked.has(d.key)}
                        onChange={(e) =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (e.target.checked) n.add(d.key);
                            else n.delete(d.key);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input value={d.name} onChange={(e) => change(d.key, { name: e.target.value })} className={input} />
                      {d.note && <span className="mt-1 block text-xs text-amber-800">{d.note}</span>}
                    </td>
                    <td className="w-28 py-2 pr-2">
                      <div className="flex gap-1">
                        <input value={d.quantity} onChange={(e) => change(d.key, { quantity: Number(e.target.value) || 0 })} className={`${input} w-16`} />
                        <input value={d.unit} onChange={(e) => change(d.key, { unit: e.target.value })} placeholder="unit" className={`${input} w-16`} />
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <select value={d.milestoneId} onChange={(e) => change(d.key, { milestoneId: e.target.value })} className={input}>
                        <option value="">Choose a step…</option>
                        {steps.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.date ? ` (${s.date})` : ''}</option>
                        ))}
                      </select>
                    </td>
                    <td className="w-24 py-2">
                      <input value={d.leadDays} onChange={(e) => change(d.key, { leadDays: Number(e.target.value) || 0 })} className={input} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={add} disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? 'Adding…' : `Add ${picked.size} selected to the buy plan`}
            </button>
            <button onClick={() => setDrafts(null)} className="text-xs text-ink-soft underline">Discard the draft</button>
          </div>
        </div>
      )}
    </div>
  );
}
