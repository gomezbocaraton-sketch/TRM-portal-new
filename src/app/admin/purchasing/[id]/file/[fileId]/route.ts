import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Opens or downloads one purchase document with a fresh link every click.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from('purchase_files')
    .select('storage_key, file_name')
    .eq('id', fileId)
    .eq('purchase_id', id)
    .single();

  if (!file?.storage_key) return new NextResponse('Document not found.', { status: 404 });

  const wantsDownload = new URL(req.url).searchParams.get('download') === '1';
  const { data, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(file.storage_key, 300, wantsDownload ? { download: file.file_name } : undefined);

  if (error || !data?.signedUrl) return new NextResponse('Could not open the file.', { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
