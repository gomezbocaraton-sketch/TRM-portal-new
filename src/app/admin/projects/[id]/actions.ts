'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProjectInfo(projectId: number, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('projects')
    .update({
      client_name: String(formData.get('clientName') ?? '').trim(),
      client_entity_name: String(formData.get('entityName') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim(),
      client_phone: String(formData.get('phone') ?? '').trim(),
      client_email: String(formData.get('email') ?? '').trim(),
      contract_value: formData.get('contractValue')
        ? parseFloat(String(formData.get('contractValue')))
        : null,
    })
    .eq('id', projectId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function updateDocumentDates(projectId: number, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('projects')
    .update({
      estimate_sent_date: formData.get('estimateSent') || null,
      estimate_accepted_date: formData.get('estimateAccepted') || null,
      contract_sent_date: formData.get('contractSent') || null,
      contract_signed_date: formData.get('contractSigned') || null,
    })
    .eq('id', projectId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/projects/${projectId}`);
}

export async function uploadEstimateOrContract(
  projectId: number,
  kind: 'estimate' | 'contract',
  formData: FormData
) {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  if (!file || file.size === 0) throw new Error('No file selected.');

  const path = `${projectId}/${kind}-${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const column = kind === 'estimate' ? 'estimate_file_key' : 'contract_file_key';
  const { error: updateError } = await supabase.from('projects').update({ [column]: path }).eq('id', projectId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/projects/${projectId}`);
}
