import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function BidsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === 'sent' ? 'sent' : 'working';
  const supabase = await createClient();

  const { data } = await supabase
    .from('bids')
    .select('*')
    .eq('status', 'pipeline')
    .order('created_at', { ascending: false });

  const all = data ?? [];
  const working = all.filter((b) => !b.sent_at);
  const sent = all
    .filter((b) => b.sent_at)
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  const bids = active === 'sent' ? sent : working;

  const tabClass = (on: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${on ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft hover:border-accent'}`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Bids</h1>
        <Link href="/admin/bids/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          New bid
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/bids" className={tabClass(active === 'working')}>
          Working on ({working.length})
        </Link>
        <Link href="/admin/bids?tab=sent" className={tabClass(active === 'sent')}>
          Sent ({sent.length})
        </Link>
      </div>

      {bids.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {active === 'sent' ? 'No bids have been sent yet.' : 'No bids in progress. Click New bid to start one.'}
        </p>
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
                  <p className="text-xs text-ink-soft">
                    {b.sent_at ? `Sent ${formatDate(b.sent_at)}` : `Started ${formatDate(b.created_at)}`}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
