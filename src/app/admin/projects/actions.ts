'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function createProject(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const clientName = String(formData.get('clientName') ?? '').trim();
  const entityName = String(formData.get('entityName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const projectName = String(formData.get('projectName') ?? '').trim();

  if (!clientName || !projectName) {
    throw new Error('Client name and project name are required.');
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name: projectName,
      client_name: clientName,
      client_entity_name: entityName || null,
      address,
      client_phone: phone,
      client_email: email,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (projectError) throw new Error(projectError.message);

  const { error: cloneError } = await supabase.rpc('clone_milestone_template', {
    p_project_id: project.id,
  });
  if (cloneError) throw new Error(cloneError.message);

  redirect('/admin');
}
