import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { TimeLocation } from '@/lib/timeclock';

type Row = Record<string, unknown>;

export default async function LocationsPage() {
  const supabase = await createClient();
  const [{ data }, { data: projects }, { data: links }] = await Promise.all([
    supabase.from('time_locations').select('*').order('type').order('name'),
    supabase.from('projects').select('id, name'),
    supabase.from('time_employee_locations').select('location_id'),
  ]);

  const locations = (data ?? []) as TimeLocation[];
  const projectName = new Map(((projects ?? []) as Row[]).map((p) => [String(p.id), String(p.name)]));
  const counts = new Map<number, number>();
  ((links ?? []) as Row[]).forEach((l) => counts.set(Number(l.location_id), (counts.get(Number(l.location_id)) ?? 0) + 1));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">The office and each job site, with the area where employees can clock in.</p>
        <Link href="/admin/timeclock/locations/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          New location
        </Link>
      </div>

      {locations.length === 0 ? (
        <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-soft">
          No locations yet. Add the office first, then a location for each job site.
        </p>
      ) : (
        <div className="space-y-3">
          {locations.map((l) => (
            <Link
              key={l.id}
              href={`/admin/timeclock/locations/${l.id}`}
              className="block rounded-card border border-line bg-white p-4 hover:border-accent sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-navy">{l.name}</p>
                  <p className="text-xs text-ink-soft">
                    {l.type}
                    {l.project_id != null && projectName.get(String(l.project_id)) ? ` · Project: ${projectName.get(String(l.project_id))}` : ''}
                    {' · '}
                    {l.radius_ft.toLocaleString()} ft · {counts.get(l.id) ?? 0} employee{(counts.get(l.id) ?? 0) === 1 ? '' : 's'} ·{' '}
                    {l.rule === 'block' ? 'blocks punches outside' : 'flags punches outside'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${l.active ? 'bg-success-tint text-success' : 'bg-paper text-ink-soft'}`}>
                  {l.active ? 'Active' : 'Off'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
