import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { money } from '@/lib/purchasing';
import { neededOnSite, orderByDate, shortDay, type BuyItem } from '@/lib/buyplan';
import { priceSearchConfigured } from '@/lib/price-search';
import { similarity, type ProposalItem } from '@/lib/proposal';
import { addManualQuote, deleteBuyItem, searchWebPrices, useQuote } from '../../actions';

type Row = Record<string, unknown>;
const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';

const CATS: Record<string, { label: string; cls: string }> = {
  lowest: { label: 'Lowest price', cls: 'text-green-700' },
  value: { label: 'Best value', cls: 'text-accent-deep' },
  fast: { label: 'Fastest delivery', cls: 'text-navy' },
  other: { label: 'Quote', cls: 'text-ink-soft' },
};

export default async function ItemPricesPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: projectId, itemId: itemParam } = await params;
  const itemId = Number(itemParam);
  const supabase = await createClient();

  const { data } = await supabase.from('buy_items').select('*').eq('id', itemId).maybeSingle();
  const item = data as BuyItem | null;
  if (!item || String(item.project_id) !== projectId) return <p className="text-sm text-ink-soft">Item not found.</p>;

  const [{ data: quoteData }, { data: proposalData }, { data: ms }] = await Promise.all([
    supabase.from('price_quotes').select('*').eq('buy_item_id', itemId).order('price'),
    supabase.from('proposal_items').select('*').eq('project_id', item.project_id),
    item.milestone_id
      ? supabase.from('project_milestones').select('id, planned_start_date').eq('id', item.milestone_id)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const quotes = (quoteData ?? []) as Row[];
  const proposal = (proposalData ?? []) as ProposalItem[];
  const starts = new Map(((ms ?? []) as Row[]).map((m) => [String(m.id), (m.planned_start_date as string | null) ?? null]));
  const needed = neededOnSite(item, starts);
  const by = orderByDate(needed, item.lead_days);

  let match: ProposalItem | undefined = proposal.find((p) => Number(p.id) === Number(item.proposal_item_id));
  if (!match) {
    let best = 0;
    for (const p of proposal) {
      const s = similarity(item.name, p.description);
      if (s > best && s >= 0.6) {
        best = s;
        match = p;
      }
    }
  }

  const order = ['lowest', 'value', 'fast', 'other'];
  const sorted = [...quotes].sort((a, b) => order.indexOf(String(a.category)) - order.indexOf(String(b.category)));
  const configured = priceSearchConfigured();
  const deleteWithId = deleteBuyItem.bind(null, itemId);

  return (
    <div>
      <Link href={`/admin/projects/${projectId}/purchasing`} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Purchasing
      </Link>
      <div className="mb-5 rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="text-lg font-medium text-navy">{item.name}</p>
        <p className="text-sm text-ink-soft">
          Quantity {Number(item.quantity)}
          {item.unit ? ` ${item.unit}` : ''} · needed on site {shortDay(needed)} · order by {shortDay(by)} ({item.lead_days}-day delivery)
        </p>
        <p className="mt-2 text-sm text-ink">
          {Number(item.unit_price) > 0
            ? `Current price: ${money(Number(item.unit_price))} each${item.vendor ? ` at ${item.vendor}` : ''}`
            : 'No price chosen yet. Search below and pick one.'}
          {match ? ` · Proposal price: ${money(Number(match.unit_price))} each` : ''}
        </p>
      </div>

      <div className="mb-5 rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-1 text-sm font-semibold text-navy">Search the web for prices</p>
        <p className="mb-3 text-xs text-ink-soft">We look at stores online and pick three: the lowest price, the best value (well rated and still priced close to the lowest), and the fastest delivery.</p>
        {!configured && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Web search is not connected yet (needs SERPAPI_KEY in Vercel). Until then, type in quotes below.
          </p>
        )}
        <FormWithFeedback action={searchWebPrices.bind(null, itemId)} submitLabel="Search prices" pendingLabel="Searching…">
          <input name="query" defaultValue={item.name} className={input} />
        </FormWithFeedback>
      </div>

      {sorted.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sorted.map((q) => {
            const cat = CATS[String(q.category)] ?? CATS.other;
            const price = Number(q.price);
            const diff = match ? price - Number(match.unit_price) : null;
            return (
              <div key={String(q.id)} className="flex flex-col gap-1 rounded-card border border-line bg-white p-4">
                <p className={`text-xs font-bold uppercase tracking-wide ${cat.cls}`}>{cat.label}</p>
                <p className="text-2xl font-bold text-navy">{money(price)}</p>
                <p className="text-sm font-semibold">{String(q.store)}</p>
                {q.title ? <p className="text-xs text-ink-soft">{String(q.title)}</p> : null}
                <ul className="mb-1 list-disc pl-4 text-xs text-ink-soft">
                  {q.delivery ? <li>{String(q.delivery)}</li> : null}
                  {q.rating ? <li>Rated {Number(q.rating)} of 5</li> : null}
                  <li>{String(q.source) === 'web' ? 'From the web' : 'Entered by hand'}</li>
                </ul>
                {diff !== null && (
                  <p className={`rounded-lg px-2 py-1 text-xs font-semibold ${diff > 0.005 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {diff > 0.005 ? `${money(diff)} over the proposal` : `${money(Math.abs(diff))} under the proposal`}
                  </p>
                )}
                <FormWithFeedback action={useQuote.bind(null, itemId, Number(q.id))} submitLabel="Use this price">
                  <span />
                </FormWithFeedback>
                {q.url ? (
                  <a href={String(q.url)} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                    Open store page
                  </a>
                ) : null}
                <p className="text-[11px] text-ink-soft">Checked {new Date(String(q.checked_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Prices change.</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-5 rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-navy">Add a quote by hand</p>
        <FormWithFeedback action={addManualQuote.bind(null, itemId)} submitLabel="Save quote">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="store" placeholder="Store or vendor" className={input} />
            <input name="price" placeholder="Price each" className={input} />
            <input name="delivery" placeholder="Delivery (e.g. 2 days)" className={input} />
            <select name="category" className={input} defaultValue="other">
              <option value="other">Just a quote</option>
              <option value="lowest">Lowest price</option>
              <option value="value">Best value</option>
              <option value="fast">Fastest delivery</option>
            </select>
            <input name="url" placeholder="Link (optional)" className={`${input} sm:col-span-2`} />
          </div>
        </FormWithFeedback>
      </div>

      <form action={deleteWithId}>
        <button className="text-xs text-red-700 underline">Remove this item from the plan</button>
      </form>
    </div>
  );
}
