'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// Saves (or clears) the Matterport link of a bid. Errors are returned as text because Next.js hides thrown messages in production.
export async function saveBidMatterport(bidId: number, formData: FormData): Promise<{ error?: string }> {
  const url = String(formData.get('matterportUrl') ?? '').trim();
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { error: 'Paste the full Matterport link, starting with https://' };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('bids').update({ matterport_url: url || null }).eq('id', bidId);
  if (error) {
    if (error.message.includes('matterport_url')) {
      return { error: 'The database is not ready for this yet. Run the Matterport SQL in Supabase first.' };
    }
    return { error: error.message };
  }
  revalidatePath(`/admin/bids/${bidId}`);
  revalidatePath('/admin/bids');
  return {};
}
