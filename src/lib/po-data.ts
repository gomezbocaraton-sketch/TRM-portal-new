import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoPdfData } from '@/lib/po-pdf';
import { formatWhen, poNumber, poStage, STAGES, type Purchase } from '@/lib/purchasing';

type Row = Record<string, unknown>;

// Gathers everything the PO PDF shows. Used by the PDF link and by the email to the vendor.
export async function loadPoPdfData(supabase: SupabaseClient, purchaseId: number): Promise<{ purchase: Purchase; data: PoPdfData } | null> {
  const { data } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
  const p = data as Purchase | null;
  if (!p) return null;
  const [{ data: items }, { data: invoices }] = await Promise.all([
    supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('id'),
    supabase.from('purchase_invoices').select('amount').eq('purchase_id', purchaseId),
  ]);

  let projectName = 'No project';
  let clientName = '';
  if (p.project_id != null) {
    const { data: proj } = await supabase.from('projects').select('name, client_name, address').eq('id', p.project_id).maybeSingle();
    if (proj) {
      projectName = String((proj as Row).name ?? (proj as Row).address ?? `Project ${p.project_id}`);
      clientName = String((proj as Row).client_name ?? '');
    }
  }

  const stage = poStage(p);
  const approvalLine =
    p.status === 'pending'
      ? 'Waiting for approval. Orders over $1,000.00 are approved by Vanessa Gomez Botero.'
      : p.auto_approved
        ? 'Auto-approved: the order is $1,000.00 or less, so no approval was needed.'
        : `${p.status === 'approved' ? 'Approved' : 'Rejected'} by ${p.decided_by_name ?? 'the approver'} on ${formatWhen(p.decided_at)}${p.decision_note ? `. Note: ${p.decision_note}` : ''}`;

  const billed = ((invoices ?? []) as Row[]).reduce((s, i) => s + Number(i.amount), 0);
  const total = Number(p.total);
  const closedLine = p.closed_at
    ? `Closed ${formatWhen(p.closed_at)} by ${p.closed_by_name ?? 'staff'}. Invoiced $${billed.toFixed(2)} of $${total.toFixed(2)}${Math.abs(billed - total) >= 0.005 ? ` (${billed > total ? 'over' : 'under'} by $${Math.abs(billed - total).toFixed(2)})` : ''}.`
    : null;

  return {
    purchase: p,
    data: {
      poNumber: poNumber(p.id),
      date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }),
      status: STAGES[stage].label,
      approvalLine,
      vendor: p.vendor,
      projectName,
      clientName,
      notes: p.notes ?? '',
      items: ((items ?? []) as Row[]).map((i) => ({
        description: String(i.description),
        quantity: Number(i.quantity),
        unit: String(i.unit ?? ''),
        unitPrice: Number(i.unit_price),
      })),
      total,
      closedLine,
    },
  };
}
