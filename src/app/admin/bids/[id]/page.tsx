import { createClient } from '@/lib/supabase/server';
import { markBidWon } from '../actions';
import { markBidSent, markBidWorking } from '../document-actions';
import { BidDocuments, type BidDoc } from './BidDocuments';
import Link from 'next/link';

const BID_DOC_CATEGORIES = ['Plans', 'Photos', 'Estimate', 'ITB', 'Bid', 'Other'];

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

export default async function BidDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bidId = Number(id);
  const supabase = await createClient();

  const [{ data: bid }, { data: files }] = await Promise.all([
    supabase.from('bids').select('*').eq('id', bidId).single(),
    supabase.from('bid_files').select('*').eq('bid_id', bidId).order('uploaded_at', { ascending: false }),
  ]);

  if (!bid) return null;

  const docs: BidDoc[] = (files ?? []).map((f) => ({
    id: f.id,
    file_name: f.file_name,
    category: f.category ?? 'Bid',
    uploadedLabel: formatTimestamp(f.uploaded_at),
  }));

  const markWonWithId = markBidWon.bind(null, bidId);
  const markSentWithId = markBidSent.bind(null, bidId);
  const markWorkingWithId = markBidWorking.bind(null, bidId);

  const stage = bid.status === 'won' ? 'won' : bid.sent_at ? 'sent' : 'working';
  const badge =
    stage === 'won'
      ? { text: 'Won', cls: 'bg-success-tint text-success' }
      : stage === 'sent'
        ? { text: `Sent ${formatTimestamp(bid.sent_at)}`, cls: 'bg-navy text-white' }
        : { text: 'Working on', cls: 'bg-accent-tint text-accent-deep' };

  return (
    <div>
      <Link href={stage === 'sent' ? '/admin/bids?tab=sent' : '/admin/bids'} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Bids
      </Link>

      <div className="rounded-card border border-line bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-medium text-navy">{bid.client_name}</p>
            {bid.client_entity_name && <p className="text-sm text-ink-soft">{bid.client_entity_name}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs font-medium text-ink-soft">Address</p><p className="text-ink">{bid.address || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Project type</p><p className="text-ink">{bid.project_type || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Phone</p><p className="text-ink">{bid.client_phone || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Email</p><p className="text-ink">{bid.client_email || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Bid amount</p><p className="text-ink">{bid.bid_amount != null ? `$${Number(bid.bid_amount).toLocaleString()}` : '—'}</p></div>
        </div>

        {stage !== 'won' && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {stage === 'working' ? (
              <form action={markSentWithId}>
                <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Mark as sent</button>
              </form>
            ) : (
              <form action={markWorkingWithId}>
                <button className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent">
                  Move back to working on
                </button>
              </form>
            )}
            <form action={markWonWithId}>
              <button className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white">
                Mark bid as won → create project
              </button>
            </form>
          </div>
        )}
        {stage === 'won' && bid.converted_project_id && (
          <Link href={`/admin/projects/${bid.converted_project_id}`} className="mb-6 inline-block text-sm font-semibold text-accent underline">
            View project →
          </Link>
        )}

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold text-navy">Documents</p>
          <BidDocuments bidId={bidId} docs={docs} categories={BID_DOC_CATEGORIES} />
        </div>
      </div>
    </div>
  );
}
