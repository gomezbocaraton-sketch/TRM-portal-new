import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { COST_CATEGORIES, formatWhen, getPurchasingContext, money, poNumber, PURCHASE_DOC_CATEGORIES, TRADE_TO_COST_CATEGORY, type Purchase } from '@/lib/purchasing';
import { tradeOf } from '@/lib/buyplan';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';
import { closePurchase } from '../actions';
import { RetryQboButton } from './RetryQboButton';
import { PurchaseDocuments, type PurchaseDoc } from './PurchaseDocuments';
import { ApprovalPanel } from './ApprovalPanel';

type Row = Record<string, unknown>;

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchaseId = Number(id);
  const supabase = await createClient();
  const ctx = await getPurchasingContext(supabase);

  const [{ data }, { data: items }, { data: files }, { data: events }] = await Promise.all([
    supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle(),
    supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('id'),
    supabase.from('purchase_files').select('*').eq('purchase_id', purchaseId).order('uploaded_at', { ascending: false }),
    supabase.from('purchase_events').select('*').eq('purchase_id', purchaseId).order('created_at', { ascending: false }),
  ]);

  const p = data as Purchase | null;
  if (!p) return <p className="text-sm text-ink-soft">Purchase not found.</p>;

  let projectName = 'No project';
  if (p.project_id != null) {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', p.project_id).maybeSingle();
    if (proj) {
      const r = proj as Row;
      projectName = String(r.name ?? r.title ?? r.address ?? r.client_name ?? `Project ${r.id}`);
    }
  }

  const docs: PurchaseDoc[] = ((files ?? []) as Row[]).map((f) => ({
    id: f.id as number | string,
    file_name: String(f.file_name),
    category: String(f.category ?? 'Other'),
    uploadedLabel: formatWhen(String(f.uploaded_at ?? '')),
  }));

  // Suggestions for the close form: the Profitability category and the schedule step most of the items belong to.
  const { data: linked } = await supabase.from('buy_items').select('milestone_id').eq('purchase_id', purchaseId);
  const { data: msList } = p.project_id != null
    ? await supabase.from('project_milestones').select('id, name').eq('project_id', p.project_id).order('sort_order')
    : { data: [] as Row[] };
  const tally = new Map<string, number>();
  for (const it of (items ?? []) as Row[]) {
    const t = TRADE_TO_COST_CATEGORY[tradeOf(String(it.description))] ?? 'Materials';
    tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  const suggestedCategory = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Materials';
  const msTally = new Map<string, number>();
  for (const l of (linked ?? []) as Row[]) if (l.milestone_id != null) msTally.set(String(l.milestone_id), (msTally.get(String(l.milestone_id)) ?? 0) + 1);
  const suggestedMilestone = [...msTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general';
  const closed = Boolean(p.closed_at);

  const badge =
    closed
      ? { text: 'Closed · items bought', cls: 'bg-success-tint text-success' }
      : p.status === 'approved'
      ? { text: p.auto_approved ? 'Auto-approved' : 'Approved', cls: 'bg-success-tint text-success' }
      : p.status === 'rejected'
        ? { text: 'Rejected', cls: 'bg-red-50 text-red-700' }
        : { text: 'Waiting for approval', cls: 'bg-accent-tint text-accent-deep' };

  const pcEvent = ((events ?? []) as Row[]).find((e) => String(e.event) === 'Proposal check');
  const proposalCheck = pcEvent && pcEvent.note ? { note: String(pcEvent.note) } : null;

  const th = 'px-2 py-2 text-left text-xs font-medium text-ink-soft';

  return (
    <div>
      <Link href={p.project_id != null ? `/admin/projects/${p.project_id}/purchasing` : '/admin/purchasing'} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Purchasing
      </Link>

      <div className="rounded-card border border-line bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-medium text-navy">
              {poNumber(p.id)} · {p.vendor}
            </p>
            <p className="text-sm text-ink-soft">{projectName}</p>
          </div>
          <span className="flex flex-wrap items-center gap-3">
            <a href={`/admin/purchasing/${p.id}/po-pdf`} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-accent">
              View PDF
            </a>
            <a href={`/admin/purchasing/${p.id}/po-pdf?download=1`} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:border-accent">
              Download PDF
            </a>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
          </span>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div><p className="text-xs font-medium text-ink-soft">Entered by</p><p className="text-ink">{p.created_by_name ?? '—'}, {formatWhen(p.created_at)}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Total</p><p className="font-semibold text-navy">{money(p.total)}</p></div>
          <div><p className="text-xs font-medium text-ink-soft">Notes</p><p className="text-ink">{p.notes || '—'}</p></div>
        </div>

        <div className="mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Item</th>
                <th className={`${th} text-right`}>Qty</th>
                <th className={th}>Unit</th>
                <th className={`${th} text-right`}>Price each</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {((items ?? []) as Row[]).map((i) => (
                <tr key={String(i.id)} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 text-ink">{String(i.description)}</td>
                  <td className="px-2 py-2 text-right">{Number(i.quantity)}</td>
                  <td className="px-2 py-2">{String(i.unit ?? '')}</td>
                  <td className="px-2 py-2 text-right">{money(Number(i.unit_price))}</td>
                  <td className="px-2 py-2 text-right font-medium">{money(Number(i.quantity) * Number(i.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {proposalCheck && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${proposalCheck.note === 'Everything matches the proposal.' ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
            <p className="mb-1 font-semibold">Proposal check</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {proposalCheck.note.split(' | ').map((line, k) => (<li key={k}>{line}</li>))}
            </ul>
          </div>
        )}

        <div className="mb-6 border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold text-navy">Approval</p>
          <ApprovalPanel
            purchaseId={p.id}
            status={p.status}
            isApprover={ctx.isApprover}
            threshold={ctx.threshold}
            approverEmail={ctx.approverEmail}
            decisionText={
              p.status === 'pending'
                ? ''
                : p.auto_approved
                  ? 'Auto-approved: order is under the approval amount, no approval needed.'
                  : `${p.status === 'approved' ? 'Approved' : 'Rejected'} by ${p.decided_by_name ?? 'approver'}, ${formatWhen(p.decided_at)}${p.decision_note ? `: ${p.decision_note}` : ''}`
            }
          />
        </div>

        {p.status === 'approved' && !closed && (
          <div className="mb-6 border-t border-line pt-4">
            <p className="mb-1 text-sm font-semibold text-navy">Close this order</p>
            <p className="mb-3 text-xs text-ink-soft">
              When the items are bought, enter the vendor&apos;s invoice. It is added to this project&apos;s costs on the Profitability tab and sent to QuickBooks as a bill.
            </p>
            <FormWithFeedback action={closePurchase.bind(null, p.id)} submitLabel="Mark as bought and close the order" pendingLabel="Closing…">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Vendor invoice number</label>
                  <input name="invoiceNumber" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Invoice date</label>
                  <input type="date" name="invoiceDate" defaultValue={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Invoice amount *</label>
                  <input name="invoiceAmount" defaultValue={Number(p.total).toFixed(2)} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Profitability category</label>
                  <select name="category" defaultValue={suggestedCategory} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                    {COST_CATEGORIES.map((c) => (<option key={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Schedule step</label>
                  <select name="milestone" defaultValue={suggestedMilestone} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                    {((msList ?? []) as Row[]).map((m) => (<option key={String(m.id)} value={String(m.id)}>{String(m.name)}</option>))}
                    <option value="general">General (no step)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Invoice file (optional)</label>
                  <DropFileInput name="file" pathPrefix={`${p.project_id ?? 'general'}/costs`} compact />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="sendQbo" defaultChecked /> Also send it to QuickBooks as a bill
              </label>
            </FormWithFeedback>
          </div>
        )}

        {closed && (
          <div className="mb-6 border-t border-line pt-4">
            <p className="mb-3 text-sm font-semibold text-navy">Closed: items bought</p>
            <div className="space-y-2 rounded-lg bg-paper px-4 py-3 text-sm text-ink">
              <p>
                Closed by {p.closed_by_name ?? 'staff'}, {formatWhen(p.closed_at ?? null)}. Invoice {p.invoice_number ? `#${p.invoice_number}` : '(no number)'} for {money(Number(p.invoice_amount ?? 0))}
                {p.invoice_date ? `, dated ${p.invoice_date}` : ''}.
              </p>
              <p>
                Profitability:{' '}
                {p.cost_id ? (
                  <>
                    added as a cost. <Link className="text-accent underline" href={`/admin/projects/${p.project_id}/profitability`}>Open Profitability</Link>
                  </>
                ) : (
                  'not added (this order has no project).'
                )}
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <span>QuickBooks:</span>
                {p.qbo_bill_id ? (
                  <span className="font-semibold text-success">Bill {p.qbo_bill_id} created ✓</span>
                ) : (
                  <>
                    <span className="text-red-700">{p.qbo_error ? `not sent: ${p.qbo_error}` : 'not sent yet'}</span>
                    <RetryQboButton purchaseId={p.id} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold text-navy">Documents</p>
          <PurchaseDocuments purchaseId={p.id} docs={docs} categories={PURCHASE_DOC_CATEGORIES} />
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-sm font-semibold text-navy">History</p>
          <ul className="space-y-1 text-sm text-ink-soft">
            {((events ?? []) as Row[]).map((e) => (
              <li key={String(e.id)}>
                <span className="text-ink">{String(e.event)}</span>
                {e.note ? <span>: {String(e.note)}</span> : null} · {String(e.who ?? '')} · {formatWhen(String(e.created_at))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
