'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { etLocalToIso } from '@/lib/timeclock';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath('/admin/timeclock', 'layout');
}

export type LocationInput = {
  id?: number;
  name: string;
  type: 'Office' | 'Job site';
  projectId: string;
  address: string;
  lat: number;
  lng: number;
  radiusFt: number;
  rule: 'block' | 'flag';
  active: boolean;
  employeeIds: number[];
};

export async function saveLocation(input: LocationInput): Promise<Result<{ id: number }>> {
  try {
    const supabase = await createClient();
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'Enter a name for this location.' };
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
      return { ok: false, error: 'Set the pin on the map first (search the address or click the map).' };
    }
    if (!(input.radiusFt >= 50 && input.radiusFt <= 5000)) {
      return { ok: false, error: 'The distance must be between 50 and 5,000 feet.' };
    }
    if (input.type === 'Job site' && !input.projectId) {
      return { ok: false, error: 'Choose the project this job site belongs to.' };
    }

    const row = {
      name,
      type: input.type,
      project_id: input.type === 'Job site' ? input.projectId : null,
      address: input.address.trim() || null,
      lat: input.lat,
      lng: input.lng,
      radius_ft: Math.round(input.radiusFt),
      rule: input.rule,
      active: input.active,
    };

    let id = input.id;
    if (id) {
      const { error } = await supabase.from('time_locations').update(row).eq('id', id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await supabase.from('time_locations').insert(row).select('id').single();
      if (error || !data) return { ok: false, error: error?.message ?? 'Could not save.' };
      id = Number(data.id);
    }

    const { error: delError } = await supabase.from('time_employee_locations').delete().eq('location_id', id);
    if (delError) return { ok: false, error: delError.message };
    if (input.employeeIds.length > 0) {
      const { error: insError } = await supabase
        .from('time_employee_locations')
        .insert(input.employeeIds.map((employee_id) => ({ employee_id, location_id: id })));
      if (insError) return { ok: false, error: insError.message };
    }

    refresh();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function saveEmployee(input: {
  id?: number;
  name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<Result<{ id: number }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('time_save_employee', {
      p_id: input.id ?? null,
      p_name: input.name,
      p_phone: input.phone,
      p_email: input.email,
      p_password: input.password,
    });
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true, id: Number(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function setEmployeeActive(id: number, active: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('time_employees').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  if (!active) await supabase.from('time_sessions').delete().eq('employee_id', id);
  refresh();
  return { ok: true };
}

export async function markReviewed(punchId: number): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('time_punches').update({ reviewed: true }).eq('id', punchId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function updatePunchTimes(punchId: number, inLocal: string, outLocal: string): Promise<Result> {
  const supabase = await createClient();
  const clockIn = etLocalToIso(inLocal);
  if (!clockIn) return { ok: false, error: 'Enter the clock-in time.' };
  const clockOut = outLocal ? etLocalToIso(outLocal) : null;
  if (outLocal && !clockOut) return { ok: false, error: 'The clock-out time is not valid.' };
  if (clockOut && new Date(clockOut) < new Date(clockIn)) {
    return { ok: false, error: 'Clock-out must be after clock-in.' };
  }
  const { error } = await supabase
    .from('time_punches')
    .update({ clock_in: clockIn, clock_out: clockOut, edited: true })
    .eq('id', punchId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deletePunch(punchId: number): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('time_punches').delete().eq('id', punchId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// Approving locks the shift. "Reopen" sends it back to the employee to fix.
export async function approvePunch(punchId: number): Promise<Result> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('time_punches')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: auth.user?.email ?? 'staff' })
    .eq('id', punchId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function approveAllSubmitted(punchIds: number[]): Promise<Result> {
  if (punchIds.length === 0) return { ok: true };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('time_punches')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: auth.user?.email ?? 'staff' })
    .in('id', punchIds)
    .eq('status', 'submitted');
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function reopenPunch(punchId: number): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('time_punches').update({ status: 'open', approved_at: null, approved_by: null, submitted_at: null }).eq('id', punchId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
