'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const BID_DOC_CATEGORIES = ['Plans', 'Photos', 'Estimate', 'ITB', 'Bid', 'Other'];

function refresh(bidId: number) {
  revalidatePath('/admin/bids');
  revalidatePath(`/admin/bids/${bidId}`);
}

export async function markBidSent(bidId: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('bids')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', bidId);
  if (error) throw new Error(error.message);
  refresh(bidId);
}

export async function markBidWorking(bidId: number) {
  const supabase = await createClient();
  const { error } = await supabase.from('bids').update({ sent_at: null }).eq('id', bidId);
  if (error) throw new Error(error.message);
  refresh(bidId);
}

export async function addBidDocument(bidId: number, formData: FormData) {
  const supabase = await createClient();
  const path = String(formData.get('file') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  if (!path) throw new Error('Please choose a file.');
  if (!BID_DOC_CATEGORIES.includes(category)) throw new Error('Choose what kind of document this is.');

  const { error } = await supabase.from('bid_files').insert({
    bid_id: bidId,
    file_name: path.split('/').pop() ?? path,
    storage_key: path,
    category,
  });
  if (error) throw new Error(error.message);
  refresh(bidId);
}

export async function deleteBidDocument(bidId: number, fileId: number | string) {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('bid_files')
    .select('storage_key')
    .eq('id', fileId)
    .eq('bid_id', bidId)
    .single();

  const { error } = await supabase.from('bid_files').delete().eq('id', fileId).eq('bid_id', bidId);
  if (error) throw new Error(error.message);
  if (file?.storage_key) await supabase.storage.from('project-files').remove([file.storage_key]);
  refresh(bidId);
}
