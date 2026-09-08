'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function recordPayment(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const amount = parseFloat(String(formData.get('amount') ?? '0'));
  if (!amount) throw new Error('Please enter an amount.');
  const file = formData.get('proofFile') as File | null;
  let proofKey: string | null = null;
  if (file && file.size > 0) {
    const path = `${projectId}/payments/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
    if (uploadError) throw new Error(uploadError.message);
    proofKey = path;
  }
  const { error } = await supabase.from('payments').insert({ project_id: projectId, amount, payment_date: String(formData.get('paymentDate') || new Date().toISOString().slice(0, 10)), method: String(formData.get('method') ?? ''), reference: String(formData.get('reference') ?? ''), notes: String(formData.get('notes') ?? ''), source: 'manual', proof_file_key: proofKey });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/financials`);
}

export async function addScheduleItem(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const description = String(formData.get('description') ?? '').trim();
  const amount = parseFloat(String(formData.get('amount') ?? '0'));
  if (!description || !amount) throw new Error('Description and amount are required.');
  const { error } = await supabase.from('payment_schedule').insert({ project_id: projectId, description, amount, due_date: String(formData.get('dueDate') || new Date().toISOString().slice(0, 10)) });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/financials`);
}
