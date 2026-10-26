import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatWhen, getPurchasingContext, money, poNumber, PURCHASE_DOC_CATEGORIES, type Purchase } from '@/lib/purchasing';
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

  const badge =
    p.status === 'approved'
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
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
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
