import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { getPurchasingContext, money, poNumber, poStage, STAGES, type Purchase } from '@/lib/purchasing';
import { StageLegend } from '@/components/StageLegend';
import { QuickDecision } from './QuickDecision';

type Row = Record<string, unknown>;

function projectLabel(p: Row): string {
  return String(p.name ?? p.title ?? p.address ?? p.client_name ?? `Project ${p.id}`);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === 'approved' || tab === 'closed' || tab === 'rejected' ? tab : 'pending';
  const supabase = await createClient();
  const ctx = await getPurchasingContext(supabase);

  const [{ data }, { data: projects }] = await Promise.all([
    supabase.from('purchases').select('*').order('created_at', { ascending: false }),
    supabase.from('projects').select('*'),
  ]);

  const all = (data ?? []) as Purchase[];
  const projectNames = new Map(((projects ?? []) as Row[]).map((p) => [String(p.id), projectLabel(p)]));
  const bucket = (p: Purchase) => (p.closed_at ? 'closed' : p.status);
  const count = (s: string) => all.filter((p) => bucket(p) === s).length;
  const rows = all.filter((p) => bucket(p) === active);

  const tabClass = (on: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${on ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft hover:border-accent'}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-navy">Purchasing</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/purchasing/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
            New purchase
          </Link>
        </div>
      </div>

      <p className="mb-4 text-xs text-ink-soft">
        Orders over {money(ctx.threshold)} need approval from {ctx.approverEmail === 'vgomez@codeconsultationnyc.com' ? 'Vanessa Gomez Botero' : ctx.approverEmail}.
        Orders of {money(ctx.threshold)} or less are approved automatically.
      </p>

      {ctx.isApprover && count('pending') > 0 && (
        <div className="mb-4 rounded-lg border border-accent bg-accent-tint px-4 py-3 text-sm text-accent-deep">
          {count('pending')} order{count('pending') === 1 ? '' : 's'} waiting for your approval.
        </div>
      )}

      <StageLegend />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/purchasing" className={tabClass(active === 'pending')}>
          Waiting for approval ({count('pending')})
        </Link>
        <Link href="/admin/purchasing?tab=approved" className={tabClass(active === 'approved')}>
          Approved, open ({count('approved')})
        </Link>
        <Link href="/admin/purchasing?tab=closed" className={tabClass(active === 'closed')}>
          Closed ({count('closed')})
        </Link>
        <Link href="/admin/purchasing?tab=rejected" className={tabClass(active === 'rejected')}>
          Rejected ({count('rejected')})
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {active === 'pending' ? 'Nothing is waiting for approval.' : active === 'approved' ? 'No open approved orders.' : active === 'closed' ? 'No closed orders yet.' : 'No rejected orders.'}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id}>
            <Link
              href={`/admin/purchasing/${p.id}`}
              className="block rounded-card border border-line bg-white p-4 hover:border-accent sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-navy">
                    {poNumber(p.id)} · {p.vendor}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {p.project_id != null ? projectNames.get(String(p.project_id)) ?? 'Project' : 'No project'} · Entered by{' '}
                    {p.created_by_name ?? 'unknown'}, {shortDate(p.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGES[poStage(p)].badge}`}>{STAGES[poStage(p)].label}</span>
                  {p.auto_approved && (
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">Auto-approved</span>
                  )}
                  <p className="text-base font-semibold text-navy">{money(p.total)}</p>
                </div>
              </div>
            </Link>
            {ctx.isApprover && p.status === 'pending' && <QuickDecision purchaseId={p.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
