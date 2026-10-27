import { createClient } from '@/lib/supabase/server';
import { buildPoPdf } from '@/lib/po-pdf';
import { formatWhen, poNumber, type Purchase } from '@/lib/purchasing';

type Row = Record<string, unknown>;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isFinite(purchaseId)) return new Response('Not found', { status: 404 });
  const supabase = await createClient();

  const { data } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
  const p = data as Purchase | null;
  if (!p) return new Response('Not found', { status: 404 });
  const { data: items } = await supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('id');

  let projectName = 'No project';
  let clientName = '';
  if (p.project_id != null) {
    const { data: proj } = await supabase.from('projects').select('name, client_name, address').eq('id', p.project_id).maybeSingle();
    if (proj) {
      projectName = String((proj as Row).name ?? (proj as Row).address ?? `Project ${p.project_id}`);
      clientName = String((proj as Row).client_name ?? '');
    }
  }

  const closed = Boolean(p.closed_at);
  const status = closed ? 'Closed - items bought' : p.status === 'approved' ? 'Approved' : p.status === 'rejected' ? 'Rejected' : 'Waiting for approval';
  const approvalLine =
    p.status === 'pending'
      ? 'Waiting for approval. Orders over $1,000.00 are approved by Vanessa Gomez Botero.'
      : p.auto_approved
        ? 'Auto-approved: the order is $1,000.00 or less, so no approval was needed.'
        : `${p.status === 'approved' ? 'Approved' : 'Rejected'} by ${p.decided_by_name ?? 'the approver'} on ${formatWhen(p.decided_at)}${p.decision_note ? `. Note: ${p.decision_note}` : ''}`;
  const closedLine = closed
    ? `Closed ${formatWhen(p.closed_at ?? null)} by ${p.closed_by_name ?? 'staff'}. Invoice ${p.invoice_number ? '#' + p.invoice_number : '(no number)'} for $${Number(p.invoice_amount ?? 0).toFixed(2)}.`
    : null;

  const bytes = await buildPoPdf({
    poNumber: poNumber(p.id),
    date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }),
    status,
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
    total: Number(p.total),
    closedLine,
  });

  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${poNumber(p.id)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
