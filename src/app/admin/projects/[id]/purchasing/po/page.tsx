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

  let open = 0;
  let hasProposal = false;
  const diffNotes: { project: string; text: string }[] = [];
  for (const pid of projectIds) {
    const prop = proposal.filter((p) => p.project_id === pid);
    if (prop.length === 0) continue;
    hasProposal = true;
    const res = checkAgainstProposal(items.filter((i) => i.project_id === pid), prop, allItems.filter((i) => i.project_id === pid));
    open += res.rows.filter((r) => r.kind !== 'match' && !r.item.ack_note).length;
    for (const r of res.rows.filter((x) => x.kind !== 'match' && !x.item.ack_note)) {
      diffNotes.push({ project: projectName.get(pid) ?? '', text: `${r.item.name}: ${r.detail}` });
    }
  }

  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const needsApproval = total > ctx.threshold;
  const approverName = ctx.approverEmail === 'vgomez@codeconsultationnyc.com' ? 'Vanessa Gomez Botero' : ctx.approverEmail;
  const missingPrice = items.filter((i) => !(Number(i.unit_price) > 0));
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

      {needsApproval ? (
        <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This is over {money(ctx.threshold)}, so {approverName} must approve it before it is final.
        </div>
      ) : (
        <div className="mb-4 rounded-card border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {money(ctx.threshold)} or less, so it is approved automatically.
        </div>
      )}

      {!hasProposal && (
        <div className="mb-4 rounded-card border border-line bg-white px-4 py-3 text-sm text-ink-soft">
          No proposal lines are saved for this project, so nothing was compared. <Link className="text-accent underline" href={`/admin/projects/${projectId}/purchasing/check?${checkQuery}`}>Add the proposal lines</Link> to run the check.
        </div>
      )}

      {open > 0 && (
        <div className="mb-4 rounded-card border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="mb-2 font-semibold">{open} difference{open === 1 ? '' : 's'} from the proposal</p>
          <ul className="list-disc space-y-1 pl-5">
            {diffNotes.map((d, k) => (<li key={k}>{d.text}</li>))}
          </ul>
          <Link className="mt-2 inline-block underline" href={`/admin/projects/${projectId}/purchasing/check?${checkQuery}`}>Review and fix them</Link>
        </div>
      )}

      {missingPrice.length > 0 ? (
        <p className="rounded-card border border-line bg-white p-4 text-sm text-ink-soft">Every item needs a price before the order can be created. Use Find prices on the item first.</p>
      ) : (
        <div className="rounded-card border border-line bg-white p-4 sm:p-6">
          <FormWithFeedback action={createPoFromItems} submitLabel={needsApproval ? `Send to ${approverName.split(' ')[0]} for approval` : 'Create PO (approved automatically)'} pendingLabel="Creating…">
            {items.map((i) => (<input key={i.id} type="hidden" name="ids" value={i.id} />))}
            {open > 0 && (
              <label className="mb-1 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="reviewed" /> I reviewed the differences
              </label>
            )}
          </FormWithFeedback>
        </div>
      )}
    </div>
  );
}
