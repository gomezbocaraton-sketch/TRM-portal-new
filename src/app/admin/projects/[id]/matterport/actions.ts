'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addTour(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const title = String(formData.get('title') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  if (!title || !url) throw new Error('Title and Matterport link are required.');
  const { error } = await supabase.from('matterport_tours').insert({ project_id: projectId, title, matterport_url: url, scan_date: String(formData.get('scanDate') || new Date().toISOString().slice(0, 10)) });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/matterport`);
}
