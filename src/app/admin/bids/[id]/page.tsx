import { createClient } from '@/lib/supabase/server';
import { uploadBidFile, markBidWon } from '../actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';
import Link from 'next/link';

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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

  const filesWithUrls = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(f.storage_key, 3600);
      return { ...f, signedUrl: data?.signedUrl ?? null };
    })
  );

  const uploadWithId = uploadBidFile.bind(null, bidId);
  const markWonWithId = markBidWon.bind(null, bidId);

  return (
    <div>
      <Link href="/admin/bids" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Bids</Link>

      <div className="rounded-card border border-line bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-medium text-navy">{bid.client_name}</p>
            {bid.client_entity_name && <p className="text-sm text-ink-soft">{bid.client_entity_name}</p>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${bid.status === 'won' ? 'bg-success-tint text-success' : 'bg-accent-tint text-accent-deep'}`}>
            {bid.status === 'won' ? 'Won' : 'In pipeline'}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs font-medium text-ink-soft">Address</p><p className="text-ink">{bid.address || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Project type</p><p className="text-ink">{bid.project_type || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Phone</p><p className="text-ink">{bid.client_phone || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Email</p><p className="text-ink">{bid.client_email || '—'}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Bid amount</p><p className="text-ink">{bid.bid_amount != null ? `$${Number(bid.bid_amount).toLocaleString()}` : '—'}</p></div>
        </div>

        {bid.status === 'pipeline' && (
          <form action={markWonWithId} className="mb-6">
            <button className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white">
              Mark bid as won → create project
            </button>
          </form>
        )}
        {bid.status === 'won' && bid.converted_project_id && (
          <Link href={`/admin/projects/${bid.converted_project_id}`} className="mb-6 inline-block text-sm font-semibold text-accent underline">
            View project →
          </Link>
        )}

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-semibold text-navy">Bid files</p>
          {filesWithUrls.length === 0 ? (
            <p className="mb-3 text-xs text-ink-soft">No files uploaded yet.</p>
          ) : (
            <div className="mb-3 space-y-2">
              {filesWithUrls.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-line bg-paper px-4 py-2">
                  <p className="text-sm text-ink">{f.file_name}</p>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-ink-soft">Sent {formatTimestamp(f.uploaded_at)}</p>
                    {f.signedUrl && <a href={f.signedUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent underline">View</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <FormWithFeedback action={uploadWithId} submitLabel="Upload updated bid" pendingLabel="Uploading…">
            <DropFileInput name="file" pathPrefix={`bids/${bidId}`} required />
          </FormWithFeedback>
        </div>
      </div>
    </div>
  );
}
