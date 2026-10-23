import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Opens a cost's attached receipt/invoice. Creates a fresh link every click,
// so it never expires while the page sits open.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; costId: string }> }
) {
  const { id, costId } = await params;
  const supabase = await createClient();

  const { data: cost } = await supabase
    .from('project_costs')
    .select('storage_key')
    .eq('id', costId)
    .eq('project_id', id)
    .single();

  if (!cost?.storage_key) {
    return new NextResponse('No document attached to this cost.', { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(cost.storage_key, 300);

  if (error || !data?.signedUrl) {
    return new NextResponse('Could not open the file.', { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
