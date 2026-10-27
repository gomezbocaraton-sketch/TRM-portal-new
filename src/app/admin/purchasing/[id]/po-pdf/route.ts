import { createClient } from '@/lib/supabase/server';
import { buildPoPdf } from '@/lib/po-pdf';
import { loadPoPdfData } from '@/lib/po-data';
import { poNumber } from '@/lib/purchasing';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isFinite(purchaseId)) return new Response('Not found', { status: 404 });
  const supabase = await createClient();
  const loaded = await loadPoPdfData(supabase, purchaseId);
  if (!loaded) return new Response('Not found', { status: 404 });

  const bytes = await buildPoPdf(loaded.data);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${poNumber(loaded.purchase.id)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
