import { createBid } from '../actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';
import Link from 'next/link';

export default function NewBidPage() {
  return (
    <div>
      <Link href="/admin/bids" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Bids</Link>
      <div className="rounded-card border border-line bg-white p-6">
        <p className="mb-4 text-lg font-medium text-navy">New bid</p>
        <FormWithFeedback action={createBid} submitLabel="Save bid" pendingLabel="Saving…">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Client name</label>
              <input name="clientName" required className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Entity name</label>
              <input name="entityName" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-ink-soft">Address</label>
              <input name="address" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Phone</label>
              <input name="phone" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Email</label>
              <input name="email" type="email" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Project type</label>
              <input name="projectType" placeholder="e.g. Kitchen remodel" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Bid amount</label>
              <input name="bidAmount" type="number" step="0.01" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Bid file (optional — you can add it next)</label>
            <DropFileInput name="file" pathPrefix="bids/intake" />
          </div>
        </FormWithFeedback>
      </div>
    </div>
  );
}
