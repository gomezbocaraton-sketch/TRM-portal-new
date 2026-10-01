import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function BidsPage() {
  const supabase = await createClient();
  const { data: bids } = await supabase
    .from('bids')
    .select('*')
    .eq('status', 'pipeline')
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Bids</h1>
        <Link href="/admin/bids/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          New bid
        </Link>
      </div>

      {(!bids || bids.length === 0) ? (
        <p className="text-sm text-ink-soft">No bids in the pipeline yet.</p>
      ) : (
        <div className="space-y-3">
          {bids.map((b) => (
            <Link
              key={b.id}
              href={`/admin/bids/${b.id}`}
              className="block rounded-card border border-line bg-white p-4 hover:border-accent sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-navy">{b.client_name}</p>
                  <p className="text-xs text-ink-soft">
                    {b.project_type ? `${b.project_type} · ` : ''}
                    {b.address ?? 'No address yet'}
                  </p>
                </div>
                <div className="text-right">
                  {b.bid_amount != null && (
                    <p className="text-sm font-semibold text-navy">${Number(b.bid_amount).toLocaleString()}</p>
                  )}
                  <p className="text-xs text-ink-soft">Sent {formatTimestamp(b.created_at)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
