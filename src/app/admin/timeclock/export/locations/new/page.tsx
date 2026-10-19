import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LocationForm } from '../LocationForm';

type Row = Record<string, unknown>;

export default async function NewLocationPage() {
  const supabase = await createClient();
  const [{ data: projects }, { data: employees }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('archived', false).order('name'),
    supabase.from('time_employees').select('id, full_name').eq('active', true).order('full_name'),
  ]);
  return (
    <div>
      <Link href="/admin/timeclock/locations" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Locations
      </Link>
      <LocationForm
        projects={((projects ?? []) as Row[]).map((p) => ({ id: String(p.id), name: String(p.name) }))}
        employees={((employees ?? []) as Row[]).map((e) => ({ id: Number(e.id), name: String(e.full_name) }))}
      />
    </div>
  );
}
