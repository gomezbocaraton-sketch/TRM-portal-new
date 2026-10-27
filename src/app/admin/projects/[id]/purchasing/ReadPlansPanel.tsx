'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDraftItems, finishPlanRead, planReadFiles, readPlanChunk, type DraftItem } from './actions';
import { createClient } from '@/lib/supabase/client';
import { searchQueryFor } from '@/lib/price-search';
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

  // Cuts the plans into small page ranges in the browser, uploads each, and has the server read them three at a time.
  async function read() {
    setError('');
    setInfo('');
    setDrafts(null);
    setBusy(true);
    const PART_PAGES = 8;
    const MAX_BYTES = 24 * 1024 * 1024;
    const MAX_TOTAL_PAGES = 400;
    let step = 'starting';
    try {
      step = 'listing the plan files (server)';
      setProgress('Opening the plan files…');
      const list = await planReadFiles(projectId);
      if (list.error || !list.files) {
        setError(list.error ?? 'Nothing was read.');
        return;
      }
      step = 'loading the PDF tool (browser)';
      const { PDFDocument } = await import('pdf-lib');
      const supabase = createClient();
      const found: PlanItem[] = [];
      const notes: string[] = [];
      let queued = 0;
      let done = 0;
      let totalPages = 0;
      let running = 0;
      const waiting: (() => void)[] = [];
      const jobs: Promise<void>[] = [];
      const show = () => setProgress(`Read ${done} of ${queued} parts of the plans…`);

      async function slot() {
        if (running >= 3) await new Promise<void>((r) => waiting.push(r));
        running += 1;
      }
      function release() {
        running -= 1;
        const next = waiting.shift();
        if (next) next();
      }

      async function readPart(path: string, fileName: string, from: number, to: number, pages: number) {
        let lastError = '';
        for (let tries = 0; tries < 3; tries++) {
          try {
            const r = await readPlanChunk(projectId, path, fileName, from, to, pages);
            if (r.items) {
              found.push(...r.items);
              return;
            }
            lastError = r.tooBig ? 'too large' : r.error ?? 'no answer';
            if (r.tooBig) break;
          } catch (e) {
            lastError = e instanceof Error ? e.message : 'the request failed';
          }
        }
        notes.push(`${fileName} pages ${from}-${to} (${lastError})`);
      }

      for (const file of list.files) {
        setProgress(`Opening ${file.name}…`);
        step = `downloading ${file.name} (browser)`;
        const res = await fetch(file.url);
        if (!res.ok) {
          notes.push(`${file.name} (could not download)`);
          continue;
        }
        step = `opening ${file.name} (browser)`;
        let src;
        try {
          src = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
        } catch {
          notes.push(`${file.name} (not a readable PDF)`);
          continue;
        }
        const pages = src.getPageCount();
        if (totalPages + pages > MAX_TOTAL_PAGES) {
          notes.push(`${file.name} (over the ${MAX_TOTAL_PAGES}-page limit for one read)`);
          continue;
        }
        totalPages += pages;

        // Builds one part; a part over the size limit is cut in half until it fits.
        const ranges: [number, number][] = [];
        for (let f = 1; f <= pages; f += PART_PAGES) ranges.push([f, Math.min(f + PART_PAGES - 1, pages)]);
        while (ranges.length > 0) {
          const [from, to] = ranges.shift() as [number, number];
          step = `cutting pages ${from}-${to} (browser)`;
          const out = await PDFDocument.create();
          const idx: number[] = [];
          for (let p = from - 1; p < to; p++) idx.push(p);
          (await out.copyPages(src, idx)).forEach((pg) => out.addPage(pg));
          const bytes = await out.save();
          if (bytes.byteLength > MAX_BYTES) {
            if (to > from) {
              const mid = Math.floor((from + to) / 2);
              ranges.unshift([from, mid], [mid + 1, to]);
            } else {
              notes.push(`${file.name} page ${from} (too large to read)`);
            }
            continue;
          }
          const path = `${projectId}/plans/read-tmp/${Date.now()}-${from}-${to}.pdf`;
          setProgress(`Preparing pages ${from}-${to} of ${file.name}…`);
          step = `uploading pages ${from}-${to} (browser)`;
          const up = await supabase.storage.from('project-files').upload(path, new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
          if (up.error) {
            notes.push(`${file.name} pages ${from}-${to} (${up.error.message})`);
            continue;
          }
          queued += 1;
          await slot();
          show();
          jobs.push(
            readPart(path, file.name, from, to, pages).finally(() => {
              done += 1;
              release();
              show();
            })
          );
        }
      }
      step = 'waiting for the page reads (server)';
      await Promise.all(jobs);

      if (found.length === 0) {
        setError(notes.length ? `Nothing could be read. ${notes.join('; ')}.` : 'No items were found in the plans.');
        return;
      }
      setProgress('Combining the list…');
      step = 'combining the list (server)';
      const res = await finishPlanRead(projectId, found);
      if (res.error || !res.items) {
        setError(res.error ?? 'Nothing was read.');
        return;
      }
      setDrafts(res.items);
      setPicked(new Set(res.items.filter((i) => i.milestoneId).map((i) => i.key)));
      setInfo(
        `Read ${queued} parts of the plans.` +
          (notes.length ? ` Not read: ${notes.join('; ')}. Read the plans again or upload those sheets separately.` : '') +
          (res.items.length === 0 ? ' Nothing new to add.' : '')
      );
    } catch (e) {
      setError(`Reading was interrupted while ${step}${e instanceof Error && e.message ? `: ${e.message}` : ''}. Click Read the plans to try again.`);
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
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2"></th><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2">Needed for</th><th className="py-2">Delivery days</th><th className="py-2">Vendors</th>
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
                    <td className="w-24 py-2 pr-2">
                      <input value={d.leadDays} onChange={(e) => change(d.key, { leadDays: Number(e.target.value) || 0 })} className={input} />
                    </td>
                    <td className="w-24 py-2">
                      <a
                        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchQueryFor(d.name))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-accent underline"
                      >
                        Compare vendors
                      </a>
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
