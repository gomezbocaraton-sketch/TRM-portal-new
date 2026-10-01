'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function archiveProject(projectId: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('projects')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  revalidatePath('/admin/archived');
}

export async function unarchiveProject(projectId: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('projects')
    .update({ archived: false, archived_at: null })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  revalidatePath('/admin/archived');
}
