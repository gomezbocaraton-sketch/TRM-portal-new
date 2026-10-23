'use client';

import { useState } from 'react';
import { addBidDocument, deleteBidDocument } from '../document-actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

export type BidDoc = {
  id: number | string;
  file_name: string;
  category: string;
  uploadedLabel: string;
};

export function BidDocuments({
  bidId,
  docs,
  categories,
}: {
  bidId: number;
  docs: BidDoc[];
  categories: string[];
}) {
  const [filter, setFilter] = useState('');
  const [confirmId, setConfirmId] = useState<number | string | null>(null);

  const counts = new Map<string, number>();
  docs.forEach((d) => counts.set(d.category, (counts.get(d.category) ?? 0) + 1));
  const shown = filter ? docs.filter((d) => d.category === filter) : docs;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink-soft hover:border-accent'}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('')} className={chip(filter === '')}>
          All ({docs.length})
        </button>
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setFilter(filter === c ? '' : c)} className={chip(filter === c)}>
            {c} ({counts.get(c) ?? 0})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mb-4 text-xs text-ink-soft">
          {docs.length === 0 ? 'No documents yet. Add plans, photos, estimates or the ITB below.' : 'No documents in this category.'}
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {shown.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{d.file_name}</p>
                <p className="text-xs text-ink-soft">
                  <span className="mr-2 rounded-full bg-white px-2 py-0.5 font-medium text-navy">{d.category}</span>
                  Added {d.uploadedLabel}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <a
                  href={`/admin/bids/${bidId}/file/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-accent px-3 py-1 font-semibold text-accent hover:bg-accent hover:text-white"
                >
                  Open
                </a>
                <a
                  href={`/admin/bids/${bidId}/file/${d.id}?download=1`}
                  className="rounded-lg border border-line bg-white px-3 py-1 font-semibold text-ink-soft hover:border-accent"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => (confirmId === d.id ? deleteBidDocument(bidId, d.id) : setConfirmId(d.id))}
                  onBlur={() => setConfirmId(null)}
                  className={`underline ${confirmId === d.id ? 'font-semibold text-red-600' : 'text-ink-soft'}`}
                >
                  {confirmId === d.id ? 'Click again to delete' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-paper p-4">
        <p className="mb-2 text-xs font-semibold text-navy">Add a document</p>
        <FormWithFeedback action={addBidDocument.bind(null, bidId)} submitLabel="Add document" pendingLabel="Uploading…">
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-ink-soft">What is it? *</label>
            <select name="category" required defaultValue="" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-64">
              <option value="" disabled>Choose a type…</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'Bid' ? 'Bid (or updated bid)' : c}</option>
              ))}
            </select>
          </div>
          <DropFileInput name="file" pathPrefix={`bids/${bidId}`} required />
        </FormWithFeedback>
      </div>
    </div>
  );
}
