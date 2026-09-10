'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateMilestone(projectId: number, milestoneId: number, formData: FormData) {
  const supabase = await createClient();
  const status = String(formData.get('status'));
  const completion_percent = parseInt(String(formData.get('completionPercent') ?? '0'), 10);
  const notes = String(formData.get('notes') ?? '');
  const planned_start_date = formData.get('plannedStartDate') || null;
  const planned_end_date = formData.get('plannedEndDate') || null;
  const { error } = await supabase.from('project_milestones').update({ status, completion_percent, notes, planned_start_date, planned_end_date, updated_at: new Date().toISOString() }).eq('id', milestoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/milestones/${milestoneId}`);
  revalidatePath(`/admin/projects/${projectId}/milestones`);
  revalidatePath(`/admin/projects/${projectId}/schedule`);
  revalidatePath(`/admin`);
}

export async function addTodo(projectId: number, milestoneId: number, formData: FormData) {
  const supabase = await createClient();
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return;
  const { error } = await supabase.from('milestone_todos').insert({ milestone_id: milestoneId, text });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/milestones/${milestoneId}`);
}

export async function toggleTodo(projectId: number, milestoneId: number, todoId: number, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('milestone_todos').update({ done }).eq('id', todoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/milestones/${milestoneId}`);
}

export async function uploadPhoto(projectId: number, milestoneId: number, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  if (!file || file.size === 0) throw new Error('No file selected.');
  const path = `${projectId}/milestones/${milestoneId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
  if (uploadError) throw new Error(uploadError.message);
  const caption = String(formData.get('caption') ?? '');
  const { error: insertError } = await supabase.from('photos').insert({ milestone_id: milestoneId, storage_key: path, caption });
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/admin/projects/${projectId}/milestones/${milestoneId}`);
}
