import { createClient } from '@/lib/supabase/server';
import { recordCostWithDoc } from './cost-actions';
import { CostsLedger, type CostRow } from './CostsLedger';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Drywall', 'Framing', 'Flooring', 'Paint', 'Roofing',
  'Windows & Doors', 'Cabinets & Countertops', 'General Construction', 'Permits',
  'Equipment Rental', 'Dumpster & Hauling', 'Materials', 'Labor', 'Subcontractor', 'Other',
];
const DOC_TYPES = ['Invoice', 'Purchase order', 'Receipt', 'Other'];

type Row = Record<string, unknown>;
const money = (n: number) => '$' + n.toLocaleString();

export default async function ProfitabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId: string | number = /^\d+$/.test(id) ? Number(id) : id;
  const supabase = await createClient();

  const [{ data: adjustedValue }, { data: rawCosts }, { data: milestones }, { data: payments }] = await Promise.all([
    supabase.rpc('project_adjusted_contract_value', { p_project_id: projectId }),
    supabase.from('project_costs').select('*').eq('project_id', projectId).order('cost_date', { ascending: false }),
    supabase.from('project_milestones').select('*').eq('project_id', projectId).order('id'),
    supabase.from('payments').select('amount').eq('project_id', projectId),
  ]);

  // Contractors: approved quotes (estimates and change orders) against what has been paid.
  const [{ data: subRows }, { data: quoteRows }, { data: subPayRows }, { data: coRows }] = await Promise.all([
    supabase.from('subcontractors').select('id, name, trade').eq('project_id', projectId).order('name'),
    supabase.from('subcontractor_quotes').select('id, subcontractor_id, description, amount, status').eq('project_id', projectId).order('created_at'),
    supabase.from('subcontractor_payments').select('quote_id, amount, payment_date').eq('project_id', projectId),
    supabase.from('change_orders').select('id, title, amount, status').eq('project_id', projectId).order('created_at'),
  ]);
  const paidByQuote = new Map<string, number>();
  for (const pay of (subPayRows ?? []) as Row[]) paidByQuote.set(String(pay.quote_id), (paidByQuote.get(String(pay.quote_id)) ?? 0) + Number(pay.amount));
  const contractors = ((subRows ?? []) as Row[]).map((sub) => {
    const mine = ((quoteRows ?? []) as Row[]).filter((q) => String(q.subcontractor_id) === String(sub.id));
    const approved = mine.filter((q) => q.status === 'approved').map((q) => ({
      id: String(q.id),
      description: String(q.description || 'Quote'),
      amount: Number(q.amount ?? 0),
      paid: paidByQuote.get(String(q.id)) ?? 0,
    }));
    const pending = mine.filter((q) => q.status === 'pending').reduce((t, q) => t + Number(q.amount ?? 0), 0);
    const total = approved.reduce((t, q) => t + q.amount, 0);
    const paid = approved.reduce((t, q) => t + q.paid, 0);
    return { id: String(sub.id), name: String(sub.name), trade: String(sub.trade ?? ''), approved, pending, total, paid, left: total - paid };
  }).filter((c) => c.approved.length > 0 || c.pending > 0);
  const subTotal = contractors.reduce((t, c) => t + c.total, 0);
  const subPaid = contractors.reduce((t, c) => t + c.paid, 0);
  const subLeft = subTotal - subPaid;
  const signedCos = ((coRows ?? []) as Row[]).filter((c) => c.status === 'signed');
  const pendingCos = ((coRows ?? []) as Row[]).filter((c) => c.status === 'pending');

  // Committed cost: open purchase orders not yet invoiced. Tolerates the tables not existing yet.
  let approvedCommitted = 0;
  let waitingCommitted = 0;
  let openOrders = 0;
  try {
    const { data: pos } = await supabase.from('purchases').select('id, status, total, closed_at').eq('project_id', projectId).in('status', ['approved', 'pending']).is('closed_at', null);
    const list = (pos ?? []) as Row[];
    if (list.length) {
      const { data: invs } = await supabase.from('purchase_invoices').select('purchase_id, amount').in('purchase_id', list.map((x) => x.id as number));
      const billedBy = new Map<string, number>();
      for (const i of (invs ?? []) as Row[]) billedBy.set(String(i.purchase_id), (billedBy.get(String(i.purchase_id)) ?? 0) + Number(i.amount));
      for (const o of list) {
        const left = Math.max(0, Number(o.total) - (billedBy.get(String(o.id)) ?? 0));
        if (o.status === 'approved') approvedCommitted += left;
        else waitingCommitted += left;
        openOrders++;
      }
    }
  } catch {
    // purchasing tables not ready
  }

  const msName = new Map<string, string>(
    ((milestones ?? []) as Row[]).map((m) => [String(m.id), String(m.name ?? m.title ?? `Milestone ${m.id}`)])
  );

  const paths = ((rawCosts ?? []) as Row[]).map((c) => c.storage_key).filter(Boolean) as string[];
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('project-files').createSignedUrls(paths, 3600);
    (signed ?? []).forEach((s) => { if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl); });
  }

  const costs: CostRow[] = ((rawCosts ?? []) as Row[]).map((c) => ({
    id: c.id as string | number,
    category: String(c.category ?? 'Other'),
    vendor: String(c.vendor ?? '—'),
    amount: Number(c.amount ?? 0),
    cost_date: (c.cost_date as string | null) ?? null,
    description: (c.description as string | null) ?? null,
    doc_type: (c.doc_type as string | null) ?? null,
    file_name: (c.file_name as string | null) ?? null,
    signedUrl: c.storage_key ? urlByPath.get(String(c.storage_key)) ?? null : null,
    milestoneId: c.milestone_id != null ? String(c.milestone_id) : 'general',
    milestone: c.milestone_id != null ? msName.get(String(c.milestone_id)) ?? 'Milestone' : 'General (no milestone)',
  }));

  const contractValue = Number(adjustedValue ?? 0);
  // Same calculation as the Financials tab: sum of recorded payments
  const received = ((payments ?? []) as Row[]).reduce((sum, p) => sum + Number(p.amount), 0);
  // Contractor payments count as costs automatically (they are recorded on the Subcontractors tab).
  const recordedCosts = costs.reduce((s, c) => s + c.amount, 0);
  const totalCosts = recordedCosts + subPaid;
  // Profitability is based on money actually received, not money billed
  const grossProfit = received - totalCosts;
  const marginPct = received > 0 ? Math.round((grossProfit / received) * 100) : 0;
  const vendors = [...new Set(costs.map((c) => c.vendor))].sort();
  const today = new Date().toISOString().slice(0, 10);

  const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-medium text-ink-soft';

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Contract value</p>
          <p className="mt-1 text-2xl font-medium text-navy">{money(contractValue)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Total received</p>
          <p className="mt-1 text-2xl font-medium text-success">{money(received)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Costs to date</p>
          <p className="mt-1 text-2xl font-medium text-accent-deep">{money(totalCosts)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Profit (received − costs)</p>
          <p className={`mt-1 text-2xl font-medium ${grossProfit >= 0 ? 'text-success' : 'text-red-600'}`}>{money(grossProfit)}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-sky-300 bg-sky-50 p-5">
          <p className="text-xs font-medium text-ink-soft">Committed (approved orders, not yet invoiced)</p>
          <p className="mt-1 text-2xl font-medium text-sky-800">{money(approvedCommitted)}</p>
          <p className="mt-1 text-xs text-ink-soft">{openOrders} open order{openOrders === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-card border border-amber-300 bg-amber-50 p-5">
          <p className="text-xs font-medium text-ink-soft">Waiting for approval</p>
          <p className="mt-1 text-2xl font-medium text-amber-800">{money(waitingCommitted)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Forecast cost (costs to date + committed + contractors still owed)</p>
          <p className="mt-1 text-2xl font-medium text-navy">{money(totalCosts + approvedCommitted + subLeft)}</p>
          <p className="mt-1 text-xs text-ink-soft">Forecast profit on money received: {money(received - totalCosts - approvedCommitted - subLeft)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-card border border-line bg-white p-4 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-navy">Contractors: running balance</p>
          <p className="text-xs text-ink-soft">Approved quotes and change orders from the Subcontractors tab, against payments made</p>
        </div>
        {contractors.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No contractor quotes yet. Add them on the Subcontractors tab.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink-soft">Approved</p><p className="text-lg font-semibold text-navy">{money(subTotal)}</p></div>
              <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink-soft">Paid</p><p className="text-lg font-semibold text-success">{money(subPaid)}</p></div>
              <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink-soft">Still owed</p><p className="text-lg font-semibold text-accent-deep">{money(subLeft)}</p></div>
            </div>
            <div className="mt-4 space-y-3">
              {contractors.map((c) => (
                <div key={c.id} className="rounded-lg border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="text-sm font-semibold text-navy">{c.name}{c.trade ? <span className="font-normal text-ink-soft"> · {c.trade}</span> : null}</span>
                    <span className="text-sm text-ink">
                      {money(c.total)} approved · <span className="text-success">{money(c.paid)} paid</span> ·{' '}
                      <b className={c.left > 0 ? 'text-accent-deep' : 'text-success'}>{c.left > 0 ? `${money(c.left)} left` : 'paid in full'}</b>
                    </span>
                  </div>
                  <div className="h-1.5 bg-paper">
                    <div className="h-full bg-success" style={{ width: `${c.total > 0 ? Math.min(100, (c.paid / c.total) * 100) : 0}%` }} />
                  </div>
                  <div className="divide-y divide-line px-4 text-xs">
                    {c.approved.map((q) => (
                      <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-ink">{q.description}</span>
                        <span className="text-ink-soft">{money(q.amount)} · paid {money(q.paid)} · <b className="text-navy">{money(q.amount - q.paid)} left</b></span>
                      </div>
                    ))}
                    {c.pending > 0 && <p className="py-2 text-ink-soft">{money(c.pending)} in quotes waiting for approval (not counted above)</p>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">Contractor payments are included in Costs to date automatically. Do not also record them under Record cost.</p>
          </>
        )}
      </div>

      {(signedCos.length > 0 || pendingCos.length > 0) && (
        <div className="mb-6 rounded-card border border-line bg-white p-4 sm:p-6">
          <p className="mb-2 text-sm font-semibold text-navy">Client change orders</p>
          <div className="divide-y divide-line text-sm">
            {signedCos.map((c) => (<div key={String(c.id)} className="flex justify-between py-2"><span>{String(c.title)} <span className="text-xs text-success">approved</span></span><b className="text-navy">{money(Number(c.amount ?? 0))}</b></div>))}
            {pendingCos.map((c) => (<div key={String(c.id)} className="flex justify-between py-2"><span>{String(c.title)} <span className="text-xs text-ink-soft">waiting for the client</span></span><span className="text-ink-soft">{money(Number(c.amount ?? 0))}</span></div>))}
          </div>
          <p className="mt-3 text-sm text-ink">
            Contract value with approved change orders: <b>{money(contractValue)}</b> · received <b className="text-success">{money(received)}</b> · <b className="text-accent-deep">{money(Math.max(0, contractValue - received))} left to collect</b>
          </p>
        </div>
      )}

      <div className="mb-6 rounded-card border border-line bg-white p-5">
        <p className="text-xs font-medium text-ink-soft">Margin on money received</p>
        <p className="mt-1 text-2xl font-medium text-navy">{marginPct}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-gradient-to-r from-accent to-navy" style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} />
        </div>
      </div>

      <div className="mb-6 rounded-card border border-line bg-white p-6">
        <p className="text-sm font-semibold text-navy">Record cost</p>
        <p className="mb-4 text-xs text-ink-soft">Attach the invoice, purchase order or receipt, then tag the cost so it rolls up by category, vendor and milestone.</p>
        <FormWithFeedback action={recordCostWithDoc.bind(null, projectId)} submitLabel="Record cost" pendingLabel="Saving…">
          <div className="mb-4">
            <label className={label}>Document (optional)</label>
            <DropFileInput name="file" pathPrefix={`${projectId}/costs`} />
          </div>
          <div className="mb-4">
            <label className={label}>Document type</label>
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map((t, i) => (
                <label key={t} className="cursor-pointer">
                  <input type="radio" name="docType" value={t} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Category *</label>
              <select name="category" required defaultValue="" className={input}>
                <option value="" disabled>Choose a category…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Vendor *</label>
              <input name="vendor" required list="vendor-list" placeholder="e.g. The Home Depot" className={input} />
              <datalist id="vendor-list">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            </div>
            <div>
              <label className={label}>Milestone *</label>
              <select name="milestone" required defaultValue="" className={input}>
                <option value="" disabled>Choose a milestone…</option>
                {((milestones ?? []) as Row[]).map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>{String(m.name ?? m.title ?? `Milestone ${m.id}`)}</option>
                ))}
                <option value="general">General (no milestone)</option>
              </select>
            </div>
            <div>
              <label className={label}>Amount *</label>
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="$ 0.00" className={input} />
            </div>
            <div>
              <label className={label}>Date</label>
              <input name="costDate" type="date" defaultValue={today} className={input} />
            </div>
            <div>
              <label className={label}>Description</label>
              <input name="description" placeholder="What was it for? (optional)" className={input} />
            </div>
          </div>
        </FormWithFeedback>
      </div>

      <CostsLedger
        projectId={projectId}
        costs={costs}
        categories={CATEGORIES}
        docTypes={DOC_TYPES}
        milestoneOptions={((milestones ?? []) as Row[]).map((m) => ({
          id: String(m.id),
          name: String(m.name ?? m.title ?? `Milestone ${m.id}`),
        }))}
      />
    </div>
  );
}
