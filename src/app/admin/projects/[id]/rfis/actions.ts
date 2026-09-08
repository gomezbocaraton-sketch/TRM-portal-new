'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addRfi(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const question = String(formData.get('question') ?? '').trim();
  if (!question) throw new Error('Please add a question.');
  const { error } = await supabase.from('rfis').insert({ project_id: projectId, question, raised_date: String(formData.get('raisedDate') || new Date().toISOString().slice(0, 10)) });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/rfis`);
}

export async function answerRfi(projectId: number, rfiId: number, formData: FormData) {
  const supabase = await createClient();
  const answer = String(formData.get('answer') ?? '').trim();
  if (!answer) return;
  const { error } = await supabase.from('rfis').update({ answer, answered_at: new Date().toISOString() }).eq('id', rfiId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/rfis`);
}
