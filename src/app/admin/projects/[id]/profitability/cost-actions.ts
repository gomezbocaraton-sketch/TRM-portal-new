'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type Id = string | number;

export async function recordCostWithDoc(projectId: Id, formData: FormData) {
  const supabase = await createClient();

  const category = String(formData.get('category') ?? '').trim();
  const vendor = String(formData.get('vendor') ?? '').trim();
  const amount = parseFloat(String(formData.get('amount') ?? '').replace(/[$,]/g, ''));
  const milestone = String(formData.get('milestone') ?? '').trim();
  const costDate = String(formData.get('costDate') ?? '').trim();
  const docType = String(formData.get('docType') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim() || null;
  const filePath = String(formData.get('file') ?? '').trim();

  if (!category) throw new Error('Choose a category.');
  if (!vendor) throw new Error('Enter the vendor.');
  if (!milestone) throw new Error('Choose a milestone.');
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0.');

  const { error } = await supabase.from('project_costs').insert({
    project_id: projectId,
    category,
    vendor,
    amount,
    cost_date: costDate || new Date().toISOString().slice(0, 10),
    milestone_id: milestone === 'general' ? null : milestone,
    doc_type: filePath ? docType : null,
    description,
    file_name: filePath ? filePath.split('/').pop() ?? filePath : null,
    storage_key: filePath || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/projects/${projectId}/profitability`);
}

export async function attachCostFile(projectId: Id, costId: Id, formData: FormData) {
  const supabase = await createClient();
  const filePath = String(formData.get('file') ?? '').trim();
  const docType = String(formData.get('docType') ?? '').trim() || null;
  if (!filePath) throw new Error('Please choose a file.');

  const { error } = await supabase
    .from('project_costs')
    .update({ storage_key: filePath, file_name: filePath.split('/').pop() ?? filePath, doc_type: docType })
    .eq('id', costId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/projects/${projectId}/profitability`);
}

export async function deleteCost(projectId: Id, costId: Id) {
  const supabase = await createClient();
  const { error } = await supabase.from('project_costs').delete().eq('id', costId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/profitability`);
}

export async function updateCost(projectId: Id, costId: Id, formData: FormData) {
  const supabase = await createClient();

  const category = String(formData.get('category') ?? '').trim();
  const vendor = String(formData.get('vendor') ?? '').trim();
  const amount = parseFloat(String(formData.get('amount') ?? '').replace(/[$,]/g, ''));
  const milestone = String(formData.get('milestone') ?? '').trim();
  const costDate = String(formData.get('costDate') ?? '').trim();
  const docType = String(formData.get('docType') ?? '').trim() || null;
  const description = String(formData.get('description') ?? '').trim() || null;
  const filePath = String(formData.get('file') ?? '').trim();

  if (!category) throw new Error('Choose a category.');
  if (!vendor) throw new Error('Enter the vendor.');
  if (!milestone) throw new Error('Choose a milestone.');
  if (!(amount > 0)) throw new Error('Enter an amount greater than 0.');

  const update: Record<string, unknown> = {
    category,
    vendor,
    amount,
    milestone_id: milestone === 'general' ? null : milestone,
    description,
  };
  if (costDate) update.cost_date = costDate;
  if (filePath) {
    // a new document was chosen: replace the old one
    update.storage_key = filePath;
    update.file_name = filePath.split('/').pop() ?? filePath;
    update.doc_type = docType;
  } else if (docType) {
    update.doc_type = docType;
  }

  const { error } = await supabase.from('project_costs').update(update).eq('id', costId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/projects/${projectId}/profitability`);
}
