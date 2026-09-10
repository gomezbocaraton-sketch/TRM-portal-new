'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function uploadDocument(projectId: number, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  if (!file || file.size === 0) throw new Error('Please choose a file.');
  const category = String(formData.get('category') ?? 'other');
  const path = `${projectId}/documents/${category}-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase.from('documents').insert({ project_id: projectId, category, file_name: file.name, storage_key: path, notes: String(formData.get('notes') ?? '') });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/documents`);
}

export async function setDocumentStatus(projectId: number, docId: number, status: 'current' | 'superseded') {
  const supabase = await createClient();
  const { error } = await supabase.from('documents').update({ version_status: status }).eq('id', docId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/documents`);
}

// Shared by both the Documents tab and the Quotes & Invoices section
// on Overview, since both display rows from this same documents
// table. Removes the actual file from storage, not just the record.
export async function deleteDocument(projectId: number, docId: number, storageKey: string) {
  const supabase = await createClient();
  await supabase.storage.from('project-files').remove([storageKey]);
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}/documents`);
  revalidatePath(`/admin/projects/${projectId}`);
}
