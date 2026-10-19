import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LocationForm } from '../LocationForm';
import type { TimeLocation } from '@/lib/timeclock';

type Row = Record<string, unknown>;

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: loc }, { data: projects }, { data: employees }, { data: links }] = await Promise.all([
    supabase.from('time_locations').select('*').eq('id', Number(id)).maybeSingle(),
    supabase.from('projects').select('id, name').order('name'),
    supabase.from('time_employees').select('id, full_name').eq('active', true).order('full_name'),
    supabase.from('time_employee_locations').select('employee_id').eq('location_id', Number(id)),
  ]);

  if (!loc) return <p className="text-sm text-ink-soft">Location not found.</p>;
  const l = loc as TimeLocation;

  return (
    <div>
      <Link href="/admin/timeclock/locations" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Locations
      </Link>
      <LocationForm
        projects={((projects ?? []) as Row[]).map((p) => ({ id: String(p.id), name: String(p.name) }))}
        employees={((employees ?? []) as Row[]).map((e) => ({ id: Number(e.id), name: String(e.full_name) }))}
        initial={{
          id: l.id,
          name: l.name,
          type: l.type,
          projectId: l.project_id != null ? String(l.project_id) : '',
          address: l.address ?? '',
          lat: l.lat,
          lng: l.lng,
          radiusFt: l.radius_ft,
          rule: l.rule,
          active: l.active,
          employeeIds: ((links ?? []) as Row[]).map((x) => Number(x.employee_id)),
        }}
      />
    </div>
  );
}
