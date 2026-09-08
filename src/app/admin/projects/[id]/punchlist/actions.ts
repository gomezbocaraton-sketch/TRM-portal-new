'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addPunchItem(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get('description') ?? '').trim();
  if (!description) throw new Error('Please describe the item.');
  const file = formData.get('photo') as File | null;
  let photoKey: string | null = null;
  if (file && file.size > 0) {
    const path = `${projectId}/punchlist/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
    if (uploadError) throw new Error(uploadError.message);
    photoKey = path;
  }
  const { error } = await supabase.from('punch_list_items').insert({ project_id: projectId, description, location: String(formData.get('location') ?? ''), trade: String(formData.get('trade') ?? ''), photo_key: photoKey, status: 'open' });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/punchlist`);
}

export async function toggleItem(projectId: number, itemId: number, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('punch_list_items').update({ status: done ? 'complete' : 'open', completed_at: done ? new Date().toISOString() : null }).eq('id', itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/punchlist`);
}
