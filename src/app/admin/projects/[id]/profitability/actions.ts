'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function recordCost(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const amount = parseFloat(String(formData.get('amount') ?? '0'));
  if (!amount) throw new Error('Please enter an amount.');
  const { error } = await supabase.from('project_costs').insert({ project_id: projectId, category: String(formData.get('category') ?? ''), vendor: String(formData.get('vendor') ?? ''), amount, cost_date: String(formData.get('costDate') || new Date().toISOString().slice(0, 10)), notes: String(formData.get('notes') ?? '') });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/profitability`);
}
