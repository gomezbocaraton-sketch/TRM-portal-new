import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { asRange, fmtDay, fmtHours, fmtTime, hoursBetween, isoToEtLocal, rangeBounds } from '@/lib/timeclock';
import { PunchActions } from './PunchActions';

type Row = Record<string, unknown>;

export default async function TimeSheetPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range = asRange(rangeParam);
  const { start, end, label } = rangeBounds(range);
  const supabase = await createClient();

  const [{ data }, { data: attempts }, { data: projects }] = await Promise.all([
    supabase
      .from('time_punches')
      .select('*, time_employees(full_name), time_locations(name, project_id)')
      .gte('clock_in', start)
      .lt('clock_in', end)
      .order('clock_in', { ascending: false }),
    supabase
      .from('time_attempts')
      .select('*, time_employees(full_name), time_locations(name)')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('projects').select('id, name'),
  ]);

  const rows = (data ?? []) as Row[];
  const projectName = new Map(((projects ?? []) as Row[]).map((p) => [String(p.id), String(p.name)]));

  const per = new Map<string, number>();
  let flagged = 0;
  for (const r of rows) {
    const emp = String((r.time_employees as Row | null)?.full_name ?? 'Unknown');
    const h = hoursBetween(String(r.clock_in), (r.clock_out as string | null) ?? null);
    if (h != null) per.set(emp, (per.get(emp) ?? 0) + h);
    if ((r.in_outside || r.out_outside) && !r.reviewed) flagged++;
  }

  const tab = (k: string, text: string) => (
    <Link
      key={k}
      href={k === 'week' ? '/admin/timeclock' : `/admin/timeclock?range=${k}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
        range === k ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft hover:border-accent'
      }`}
    >
      {text}
    </Link>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {tab('week', 'This week')}
          {tab('last', 'Last week')}
          {tab('month', 'This month')}
        </div>
        <a
          href={`/admin/timeclock/export?range=${range}`}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-accent"
        >
          Download spreadsheet (CSV)
        </a>
      </div>

      {flagged > 0 && (
        <div className="mb-4 rounded-lg border border-accent bg-accent-tint px-4 py-3 text-sm text-accent-deep">
          {flagged} punch{flagged === 1 ? '' : 'es'} to review: the employee was outside the work area. Check the rows marked below.
        </div>
      )}

      {per.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from(per.entries()).map(([name, h]) => (
            <span key={name} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink">
              {name}: <b>{h.toFixed(2)} h</b>
            </span>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-ink-soft">{label}</p>
      {rows.length === 0 ? (
        <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-soft">
          No punches in this period yet. Add employees and locations, then send them their invitation.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const loc = r.time_locations as Row | null;
                const emp = r.time_employees as Row | null;
                const outside = Boolean(r.in_outside || r.out_outside);
                const needsReview = outside && !r.reviewed;
                const h = hoursBetween(String(r.clock_in), (r.clock_out as string | null) ?? null);
                const proj = loc?.project_id != null ? projectName.get(String(loc.project_id)) : null;
                return (
                  <tr key={String(r.id)} className={`border-b border-line align-top last:border-0 ${needsReview ? 'bg-accent-tint' : ''}`}>
                    <td className="px-3 py-2">{fmtDay(String(r.clock_in))}</td>
                    <td className="px-3 py-2 font-medium text-navy">{String(emp?.full_name ?? '')}</td>
                    <td className="px-3 py-2">
                      {String(loc?.name ?? '')}
                      {proj && <div className="text-xs text-ink-soft">{proj}</div>}
                    </td>
                    <td className="px-3 py-2">{fmtTime(String(r.clock_in))}</td>
                    <td className="px-3 py-2">{r.clock_out ? fmtTime(String(r.clock_out)) : <span className="font-semibold text-success">in now</span>}</td>
                    <td className="px-3 py-2">{fmtHours(h)}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.in_outside ? <div className="text-accent-deep">Clocked in {Number(r.in_distance_ft).toLocaleString()} ft away</div> : null}
                      {r.out_outside ? <div className="text-accent-deep">Clocked out {Number(r.out_distance_ft).toLocaleString()} ft away</div> : null}
                      {outside && r.reviewed ? <div className="text-ink-soft">Reviewed</div> : null}
                      {r.edited ? <div className="text-ink-soft">Times edited</div> : null}
                      <PunchActions
                        id={Number(r.id)}
                        inLocal={isoToEtLocal(String(r.clock_in))}
                        outLocal={isoToEtLocal((r.clock_out as string | null) ?? null)}
                        needsReview={needsReview}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {((attempts ?? []) as Row[]).length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-sm font-semibold text-navy">Blocked attempts (recent)</p>
          <div className="space-y-2">
            {((attempts ?? []) as Row[]).map((a) => (
              <div key={String(a.id)} className="rounded-lg border border-line bg-white px-4 py-2 text-sm">
                <span className="font-medium text-navy">{String((a.time_employees as Row | null)?.full_name ?? '')}</span>{' '}
                tried to clock in {Number(a.distance_ft).toLocaleString()} ft from {String((a.time_locations as Row | null)?.name ?? 'a location')}
                <span className="text-ink-soft"> · {fmtDay(String(a.created_at))} {fmtTime(String(a.created_at))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
