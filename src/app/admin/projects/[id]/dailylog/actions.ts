'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addDailyLog(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const work_completed = String(formData.get('workCompleted') ?? '').trim();
  if (!work_completed) throw new Error('Please describe the work completed.');
  const { error } = await supabase.from('daily_logs').insert({ project_id: projectId, log_date: String(formData.get('logDate') || new Date().toISOString().slice(0, 10)), weather: String(formData.get('weather') ?? ''), crew: String(formData.get('crew') ?? ''), work_completed, delays: String(formData.get('delays') ?? '') });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/dailylog`);
}
