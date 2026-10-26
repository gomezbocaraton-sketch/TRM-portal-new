'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createBid(formData: FormData) {
  const supabase = await createClient();

  const clientName = String(formData.get('clientName') ?? '').trim();
  if (!clientName) throw new Error('Client name is required.');

  const matterportUrl = String(formData.get('matterportUrl') ?? '').trim();
  if (matterportUrl && !/^https?:\/\/\S+$/i.test(matterportUrl)) {
    throw new Error('Paste the full Matterport link, starting with https://');
  }

  const { data, error } = await supabase
    .from('bids')
    .insert({
      client_name: clientName,
      client_entity_name: String(formData.get('entityName') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim() || null,
      client_phone: String(formData.get('phone') ?? '').trim() || null,
      client_email: String(formData.get('email') ?? '').trim() || null,
      project_type: String(formData.get('projectType') ?? '').trim() || null,
      bid_amount: formData.get('bidAmount') ? parseFloat(String(formData.get('bidAmount'))) : null,
      ...(matterportUrl ? { matterport_url: matterportUrl } : {}),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  const filePath = String(formData.get('file') ?? '').trim();
  if (filePath) {
    const { error: fileError } = await supabase.from('bid_files').insert({
      bid_id: data.id,
      file_name: filePath.split('/').pop() ?? filePath,
      storage_key: filePath,
    });
    if (fileError) throw new Error(fileError.message);
  }

  revalidatePath('/admin/bids');
  redirect(`/admin/bids/${data.id}`);
}

export async function uploadBidFile(bidId: number, formData: FormData) {
  const supabase = await createClient();
  const path = String(formData.get('file') ?? '').trim();
  if (!path) throw new Error('Please choose a file.');

  const { error } = await supabase.from('bid_files').insert({
    bid_id: bidId,
    file_name: path.split('/').pop() ?? path,
    storage_key: path,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/bids/${bidId}`);
}

export async function markBidWon(bidId: number) {
  const supabase = await createClient();

  const { data: bid, error: bidError } = await supabase
    .from('bids')
    .select('*')
    .eq('id', bidId)
    .single();
  if (bidError || !bid) throw new Error(bidError?.message ?? 'Bid not found.');
  if (bid.status === 'won') return;

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      client_name: bid.client_name,
      client_entity_name: bid.client_entity_name,
      address: bid.address,
      client_phone: bid.client_phone,
      client_email: bid.client_email,
      contract_value: bid.bid_amount,
    })
    .select('id')
    .single();
  if (projectError) throw new Error(projectError.message);

  // Keep the pre-bid Matterport scan with the new project (best effort; the bid is converted either way).
  if (typeof bid.matterport_url === 'string' && bid.matterport_url) {
    await supabase.from('matterport_tours').insert({
      project_id: project.id,
      title: 'Pre-bid scan',
      matterport_url: bid.matterport_url,
      scan_date: new Date().toISOString().slice(0, 10),
    });
  }

  const { error: updateError } = await supabase
    .from('bids')
    .update({ status: 'won', converted_project_id: project.id })
    .eq('id', bidId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath('/admin/bids');
  revalidatePath('/admin');
  redirect(`/admin/projects/${project.id}`);
}
