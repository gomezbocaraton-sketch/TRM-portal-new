import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { getPurchasingContext, money } from '@/lib/purchasing';
import { neededOnSite, orderByDate, shortDay, type BuyItem } from '@/lib/buyplan';
import { checkAgainstProposal, type ProposalItem } from '@/lib/proposal';
import { createPoFromItems } from '../actions';

type Row = Record<string, unknown>;

export default async function GeneratePoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string | string[] }> }) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const ids = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).map(Number).filter((n) => Number.isFinite(n));
  const supabase = await createClient();
  const ctx = await getPurchasingContext(supabase);

  const { data } = ids.length ? await supabase.from('buy_items').select('*').in('id', ids).eq('project_id', projectId).eq('status', 'planned') : { data: [] };
  const allTicked = (data ?? []) as BuyItem[];
  const items = allTicked.filter((i) => !i.client_buys);
  const leftOut = allTicked.length - items.length;

  if (items.length === 0) {
    return (
      <div>
        <Link href={`/admin/projects/${projectId}/purchasing`} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Purchasing</Link>
        <p className="text-sm text-ink-soft">No items chosen, or they were already ordered.</p>
      </div>
    );
  }

  const projectIds = Array.from(new Set(items.map((i) => i.project_id)));
  const [{ data: proposalData }, { data: allData }, { data: msData }, { data: projectData }] = await Promise.all([
    supabase.from('proposal_items').select('*').in('project_id', projectIds),
    supabase.from('buy_items').select('*').in('project_id', projectIds),
    supabase.from('project_milestones').select('id, planned_start_date').in('project_id', projectIds),
    supabase.from('projects').select('*').in('id', projectIds),
  ]);
  const proposal = (proposalData ?? []) as ProposalItem[];
  const allItems = (allData ?? []) as BuyItem[];
  const starts = new Map(((msData ?? []) as Row[]).map((m) => [String(m.id), (m.planned_start_date as string | null) ?? null]));
  const projectName = new Map(((projectData ?? []) as Row[]).map((p) => [String(p.id), String(p.name ?? p.address ?? p.client_name ?? `Project ${p.id}`)]));

  const priced = items.filter((i) => Number(i.unit_price) > 0);
  let open = 0;
  for (const pid of projectIds) {
    const prop = proposal.filter((p) => p.project_id === pid);
    if (prop.length === 0) continue;
    const res = checkAgainstProposal(priced.filter((i) => i.project_id === pid), prop, allItems.filter((i) => i.project_id === pid));
    open += res.rows.filter((r) => r.kind !== 'match' && !r.item.ack_note).length;
  }

  const total = priced.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const approverName = ctx.approverEmail === 'vgomez@codeconsultationnyc.com' ? 'Vanessa Gomez Botero' : ctx.approverEmail;
  const missingPrice = items.filter((i) => !(Number(i.unit_price) > 0));
  // One order is made for each project and vendor. Each order is approved on its own total.
  const orderMap = new Map<string, { vendor: string; project: string; count: number; total: number; ids: number[] }>();
  for (const i of priced) {
    const vendor = (i.vendor ?? '').trim() || 'Vendor to be chosen';
    const key = `${i.project_id}||${vendor}`;
    const cur = orderMap.get(key) ?? { vendor, project: projectName.get(i.project_id) ?? '', count: 0, total: 0, ids: [] };
    cur.count += 1;
    cur.ids.push(i.id);
    cur.total += Number(i.quantity) * Number(i.unit_price);
    orderMap.set(key, cur);
  }
  const orders = [...orderMap.values()].map((o) => ({ ...o, total: Math.round(o.total * 100) / 100 }));
  const needApproval = orders.filter((o) => o.total > ctx.threshold);
  const checkQuery = items.map((i) => `ids=${i.id}`).join('&');

  return (
    <div>
      <Link href={`/admin/projects/${projectId}/purchasing`} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Purchasing</Link>
      <h1 className="mb-4 text-xl font-semibold text-navy">Generate purchase order</h1>
      {leftOut > 0 && (
        <p className="mb-4 rounded-card border border-line bg-white px-4 py-3 text-sm text-ink-soft">
          {leftOut} item{leftOut === 1 ? ' is' : 's are'} marked client buying and left off this order. They go on the client estimate instead.
        </p>
      )}

      <div className="mb-4 rounded-card border border-line bg-white p-4 sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-2">Item</th><th className="py-2">Vendor</th><th className="py-2">Order by</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="py-2">{i.name}<span className="block text-xs text-ink-soft">{projectName.get(i.project_id)}</span></td>
                  <td className="py-2">{i.vendor ?? <span className="text-ink-soft">to be chosen</span>}</td>
                  <td className="py-2">{shortDay(orderByDate(neededOnSite(i, starts), i.lead_days))}</td>
                  <td className="py-2 text-right">{Number(i.quantity)}</td>
                  <td className="py-2 text-right">{Number(i.unit_price) > 0 ? money(Number(i.quantity) * Number(i.unit_price)) : <Link className="text-accent underline" href={`/admin/projects/${projectId}/purchasing/item/${i.id}`}>find price</Link>}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="pt-3 font-semibold">Total</td><td className="pt-3 text-right font-semibold text-navy">{money(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">One order is created for each project and vendor.</p>
      </div>

      <div className="mb-4 rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-1 text-sm font-semibold text-navy">
          {orders.length} purchase order{orders.length === 1 ? '' : 's'} will be created
        </p>
        <p className="mb-3 text-xs text-ink-soft">
          One order for each vendor. Only an order over {money(ctx.threshold)} needs {approverName}&apos;s approval; the rest are approved automatically.
        </p>
        <div className="space-y-4">
          {orders.map((o) => {
            const q = o.ids.map((x) => `ids=${x}`).join('&');
            const src = `/admin/projects/${projectId}/purchasing/po/preview?${q}&vendor=${encodeURIComponent(o.vendor)}`;
            return (
              <div key={`${o.project}-${o.vendor}`} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-ink">
                    <span className="font-semibold text-navy">{o.vendor}</span> · {o.count} item{o.count === 1 ? '' : 's'} · <b>{money(o.total)}</b>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${o.total > ctx.threshold ? 'bg-accent-tint text-accent-deep' : 'bg-success-tint text-success'}`}>
                      {o.total > ctx.threshold ? `Needs ${approverName.split(' ')[0]}'s approval` : 'Approved automatically'}
                    </span>
                    <a href={src} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-accent">Open PDF</a>
                  </span>
                </div>
                <iframe src={src} title={`PO preview ${o.vendor}`} className="h-[480px] w-full rounded border border-line" />
              </div>
            );
          })}
        </div>
      </div>

      {open > 0 && (
        <p className="mb-4 text-xs text-ink-soft">
          {open} difference{open === 1 ? '' : 's'} from the proposal. <Link className="text-accent underline" href={`/admin/projects/${projectId}/purchasing/check?${checkQuery}`}>Review them (optional)</Link>
        </p>
      )}

      {missingPrice.length > 0 && (
        <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="mb-1 font-semibold">{missingPrice.length} item{missingPrice.length === 1 ? ' has' : 's have'} no price yet and will stay in the buy plan:</p>
          <ul className="list-disc pl-5">
            {missingPrice.map((i) => (
              <li key={i.id}>
                {i.name} · <Link className="underline" href={`/admin/projects/${projectId}/purchasing/item/${i.id}`}>find price</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {priced.length === 0 ? (
        <p className="rounded-card border border-line bg-white p-4 text-sm text-ink-soft">None of these items has a price yet. Use Find prices on the items first.</p>
      ) : (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <FormWithFeedback
            action={createPoFromItems}
            submitLabel={
              needApproval.length === 0
                ? `Create ${orders.length} PO${orders.length === 1 ? '' : 's'} (approved automatically)`
                : `Create ${orders.length} PO${orders.length === 1 ? '' : 's'} (${needApproval.length} sent to ${approverName.split(' ')[0]} for approval)`
            }
            pendingLabel="Creating…"
          >
            {priced.map((i) => (<input key={i.id} type="hidden" name="ids" value={i.id} />))}
            <input type="hidden" name="reviewed" value="on" />
          </FormWithFeedback>
        </div>
      )}
    </div>
  );
}
