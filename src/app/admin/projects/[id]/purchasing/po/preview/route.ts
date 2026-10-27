import { createClient } from '@/lib/supabase/server';
import { buildPoPdf } from '@/lib/po-pdf';
import type { BuyItem } from '@/lib/buyplan';

// Shows what the purchase order will look like as a PDF, before it is created.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const ids = url.searchParams.getAll('ids').map(Number).filter((n) => Number.isFinite(n));
  const vendorWanted = (url.searchParams.get('vendor') ?? '').trim();
  const supabase = await createClient();
  const { data } = ids.length ? await supabase.from('buy_items').select('*').in('id', ids).eq('project_id', id) : { data: [] };
  const items = ((data ?? []) as BuyItem[]).filter((i) => !i.client_buys && Number(i.unit_price) > 0 && (((i.vendor ?? '').trim() || 'Vendor to be chosen') === vendorWanted || !vendorWanted));
  if (items.length === 0) return new Response('Nothing to show', { status: 404 });

  const { data: proj } = await supabase.from('projects').select('name, client_name, address').eq('id', id).maybeSingle();
  const r = (proj ?? {}) as Record<string, unknown>;
  const total = Math.round(items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0) * 100) / 100;
  const bytes = await buildPoPdf({
    poNumber: 'PO (preview)',
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }),
    status: 'Draft',
    approvalLine: total > 1000 ? 'Preview only. Orders over $1,000.00 need approval before they are final.' : 'Preview only. This order is $1,000.00 or less and is approved automatically when created.',
    vendor: vendorWanted || (items[0].vendor ?? 'Vendor to be chosen'),
    projectName: String(r.name ?? r.address ?? `Project ${id}`),
    clientName: String(r.client_name ?? ''),
    notes: '',
    items: items.map((i) => ({ description: i.name, quantity: Number(i.quantity), unit: i.unit ?? '', unitPrice: Number(i.unit_price) })),
    total,
    closedLine: null,
  });
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="PO-preview.pdf"', 'Cache-Control': 'no-store' } });
}
