import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/purchasing';
import { neededOnSite, orderByDate, shortDay, todayET, tradeOf, TRADE_ORDER, type BuyItem } from '@/lib/buyplan';
import { PrintButton } from '@/components/PrintButton';

type Row = Record<string, unknown>;

// An estimate of the items the client buys himself, grouped by trade, with the date each one must be bought by.
export default async function ClientEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: itemData }, { data: ms }] = await Promise.all([
    supabase.from('projects').select('name, client_name').eq('id', projectId).maybeSingle(),
    supabase.from('buy_items').select('*').eq('project_id', projectId).eq('status', 'planned').eq('client_buys', true).order('id'),
    supabase.from('project_milestones').select('id, planned_start_date').eq('project_id', projectId),
  ]);
  const items = (itemData ?? []) as BuyItem[];
  const starts = new Map(((ms ?? []) as Row[]).map((m) => [String(m.id), (m.planned_start_date as string | null) ?? null]));
  const base = `/admin/projects/${projectId}/purchasing`;

  if (items.length === 0) {
    return (
      <div>
        <Link href={base} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Purchasing</Link>
        <p className="text-sm text-ink-soft">No items are marked client buying yet. On the Purchasing tab, tick items and click Client buying.</p>
      </div>
    );
  }

  const lineTotal = (i: BuyItem) => Number(i.quantity) * Number(i.unit_price);
  const total = items.reduce((s, i) => s + (Number(i.unit_price) > 0 ? lineTotal(i) : 0), 0);
  const missing = items.filter((i) => !(Number(i.unit_price) > 0));
  const today = new Date(todayET() + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const th = 'py-2 text-xs uppercase tracking-wide text-ink-soft';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={base} className="text-sm text-ink-soft hover:text-navy">&larr; Purchasing</Link>
        <PrintButton />
      </div>

      {missing.length > 0 && (
        <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 print:hidden">
          {missing.length} item{missing.length === 1 ? ' has' : 's have'} no price yet, so {missing.length === 1 ? 'it is' : 'they are'} not in the total:
          <ul className="mt-1 list-disc pl-5">
            {missing.map((i) => (
              <li key={i.id}>
                {i.name} · <Link className="underline" href={`${base}/item/${i.id}`}>find price</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-line bg-white p-5 sm:p-8 print:border-0 print:p-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Estimate of items to be purchased by the client</p>
        <h1 className="mt-1 text-xl font-semibold text-navy">{String(project?.name ?? 'Project')}</h1>
        <p className="text-sm text-ink-soft">
          Prepared for {String(project?.client_name ?? 'the client')} by TRM Partners LLC · {today}
        </p>

        {TRADE_ORDER.map((trade) => {
          const list = items.filter((i) => tradeOf(i.name) === trade);
          if (list.length === 0) return null;
          return (
            <div key={trade} className="mt-6">
              <p className="mb-1 text-sm font-semibold text-navy">{trade}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className={th}>Item</th>
                      <th className={`${th} text-right`}>Qty</th>
                      <th className={`${th} text-right`}>Price each</th>
                      <th className={`${th} text-right`}>Amount</th>
                      <th className={th}>Buy by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((i) => {
                      const by = orderByDate(neededOnSite(i, starts), i.lead_days);
                      return (
                        <tr key={i.id} className="border-b border-line align-top last:border-0">
                          <td className="py-2 pr-2">
                            {i.name}
                            {i.vendor ? <span className="block text-xs text-ink-soft">{i.vendor}</span> : null}
                          </td>
                          <td className="py-2 text-right">{Number(i.quantity)}{i.unit ? ` ${i.unit}` : ''}</td>
                          <td className="py-2 text-right">{Number(i.unit_price) > 0 ? money(Number(i.unit_price)) : '—'}</td>
                          <td className="py-2 text-right">{Number(i.unit_price) > 0 ? money(lineTotal(i)) : '—'}</td>
                          <td className="py-2 pl-3">{by ? shortDay(by) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="mt-6 flex justify-end border-t border-line pt-3">
          <p className="text-base font-semibold text-navy">Estimated total: {money(total)}</p>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          Prices are estimates and can change by store and date. &ldquo;Buy by&rdquo; is the latest date to order so the item arrives when the work needs it.
        </p>
      </div>
    </div>
  );
}
