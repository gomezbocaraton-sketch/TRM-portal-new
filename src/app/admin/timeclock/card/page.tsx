import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { GeoMap } from '@/components/GeoMap';
import { etLocalToIso, fmtTime, TZ } from '@/lib/timeclock';
import { addDays, etYmd, payableHours, ruleOn, type PayRule } from '@/lib/timepay';
import { CardActions } from './CardActions';

type Row = Record<string, unknown>;

const hm = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const dur = (min: number) => (min >= 60 ? hm(min) : `${Math.max(0, Math.round(min))}m`);

export default async function TimeCardPage({ searchParams }: { searchParams: Promise<{ emp?: string; date?: string }> }) {
  const sp = await searchParams;
  const today = etYmd(new Date().toISOString());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : today;
  const start = etLocalToIso(`${date}T00:00`) as string;
  const end = etLocalToIso(`${addDays(date, 1)}T00:00`) as string;
  const supabase = await createClient();

  const [{ data: emps }, { data: dayPunches }] = await Promise.all([
    supabase.from('time_employees').select('id, full_name, active').order('full_name'),
    supabase.from('time_punches').select('id, employee_id, status, clock_out').gte('clock_in', start).lt('clock_in', end),
  ]);
  const employees = ((emps ?? []) as Row[]).filter((e) => e.active !== false);
  const empId = Number(sp.emp) || (employees[0] ? Number(employees[0].id) : 0);
  const emp = employees.find((e) => Number(e.id) === empId) ?? null;

  const dot = (id: number) => {
    const mine = ((dayPunches ?? []) as Row[]).filter((p) => Number(p.employee_id) === id);
    if (mine.length === 0) return 'bg-line';
    if (mine.every((p) => p.status === 'approved')) return 'bg-green-500';
    if (mine.some((p) => p.status === 'submitted')) return 'bg-amber-500';
    return 'bg-slate-400';
  };

  const href = (e: number, d: string) => `/admin/timeclock/card?emp=${e}&date=${d}`;
  const prettyDate = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  let body: React.ReactNode = <p className="text-sm text-ink-soft">No employees yet.</p>;
  if (emp) {
    const [{ data: punchData }, { data: rulesData }] = await Promise.all([
      supabase.from('time_punches').select('*').eq('employee_id', empId).gte('clock_in', start).lt('clock_in', end).order('clock_in'),
      supabase.from('time_pay_rules').select('*').eq('employee_id', empId),
    ]);
    const punches = (punchData ?? []) as Row[];
    const rules = (rulesData ?? []) as unknown as PayRule[];
    const rule = ruleOn(rules, empId, date);
    const ids = punches.map((p) => Number(p.id));
    const [{ data: bk }, { data: locs }] = await Promise.all([
      ids.length ? supabase.from('time_breaks').select('*').in('punch_id', ids).order('start_at') : Promise.resolve({ data: [] as Row[] }),
      supabase.from('time_locations').select('id, name, lat, lng, radius_ft'),
    ]);
    const breaks = (bk ?? []) as Row[];
    const locBy = new Map(((locs ?? []) as Row[]).map((l) => [Number(l.id), l]));

    let workedMin = 0;
    let breakTotal = 0;
    let payable = 0;
    for (const p of punches) {
      const out = p.clock_out ? new Date(String(p.clock_out)).getTime() : Date.now();
      const shift = (out - new Date(String(p.clock_in)).getTime()) / 60000;
      const b = breaks.filter((x) => Number(x.punch_id) === Number(p.id)).reduce((s, x) => s + ((x.end_at ? new Date(String(x.end_at)).getTime() : Date.now()) - new Date(String(x.start_at)).getTime()) / 60000, 0);
      workedMin += shift;
      breakTotal += b;
      payable += payableHours(shift, b, rule?.meal_break_policy) * 60;
    }
    const allApproved = punches.length > 0 && punches.every((p) => p.status === 'approved');
    const anySubmitted = punches.some((p) => p.status === 'submitted');
    const statusBadge = allApproved
      ? { t: 'APPROVED', c: 'bg-green-600 text-white' }
      : anySubmitted
        ? { t: 'WAITING FOR APPROVAL', c: 'bg-amber-500 text-white' }
        : punches.length
          ? { t: 'NOT SENT', c: 'bg-slate-400 text-white' }
          : { t: 'NO TIME', c: 'bg-paper text-ink-soft' };
    const firstLoc = punches.length ? locBy.get(Number(punches[0].location_id)) : undefined;

    body = (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={href(empId, addDays(date, -1))} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm">&lsaquo;</Link>
            <span className="text-sm font-semibold text-navy">{prettyDate}</span>
            <Link href={href(empId, addDays(date, 1))} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm">&rsaquo;</Link>
            {date !== today && <Link href={href(empId, today)} className="text-xs text-accent underline">Today</Link>}
          </div>
          <div className="flex items-center gap-3">
            <CardActions ids={punches.filter((p) => p.clock_out).map((p) => Number(p.id))} allApproved={allApproved} />
            <span className={`rounded px-3 py-1 text-xs font-bold ${statusBadge.c}`}>{statusBadge.t}</span>
          </div>
        </div>
        <h2 className="mb-3 text-xl font-semibold text-navy">{String(emp.full_name)}</h2>

        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-paper p-3"><p className="text-lg font-bold text-navy">{hm(payable)}</p><p className="text-xs text-ink-soft">REGULAR</p></div>
          <div className="rounded-lg bg-paper p-3"><p className="text-lg font-bold text-navy">{hm(breakTotal)}</p><p className="text-xs text-ink-soft">{rule?.meal_break_policy === 'Paid' ? 'PAID BREAK' : 'UNPAID BREAK'}</p></div>
          <div className="rounded-lg bg-sky-50 p-3"><p className="text-lg font-bold text-sky-800">{hm(workedMin)}</p><p className="text-xs text-ink-soft">TOTAL ON THE CLOCK</p></div>
        </div>

        {punches.length === 0 ? (
          <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-soft">No time for this day.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-card border border-line bg-white p-4">
              <p className="mb-3 text-xs font-bold tracking-wide text-ink-soft">TIMELINE</p>
              {punches.map((p) => {
                const loc = locBy.get(Number(p.location_id));
                const pb = breaks.filter((x) => Number(x.punch_id) === Number(p.id));
                const out = p.clock_out ? String(p.clock_out) : null;
                const segs: { kind: 'work' | 'break'; from: string; to: string | null }[] = [];
                let cursor = String(p.clock_in);
                for (const x of pb) {
                  if (new Date(String(x.start_at)) > new Date(cursor)) segs.push({ kind: 'work', from: cursor, to: String(x.start_at) });
                  segs.push({ kind: 'break', from: String(x.start_at), to: x.end_at ? String(x.end_at) : null });
                  cursor = x.end_at ? String(x.end_at) : String(x.start_at);
                }
                if (!pb.some((x) => !x.end_at)) segs.push({ kind: 'work', from: cursor, to: out });
                const mins = (a: string, b: string | null) => ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60000;
                return (
                  <div key={String(p.id)} className="mb-4 border-l-2 border-line pl-4 last:mb-0">
                    <p className="text-sm font-semibold text-navy">{fmtTime(String(p.clock_in))} <span className="font-normal text-ink-soft">Clocked in</span></p>
                    {segs.map((sg, i) => (
                      <div key={i} className="my-2">
                        <p className="text-xs text-ink-soft">{fmtTime(sg.from)} – {sg.to ? fmtTime(sg.to) : 'now'} · {dur(mins(sg.from, sg.to))}</p>
                        <div className={`rounded-lg border px-3 py-2 text-sm ${sg.kind === 'break' ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-indigo-200 bg-indigo-50 text-indigo-900'}`}>
                          {sg.kind === 'break' ? 'Break' : String(loc?.name ?? 'Work')}
                          {sg.kind === 'work' && p.in_outside ? <span className="ml-2 text-xs text-accent-deep">clocked in {Number(p.in_distance_ft).toLocaleString()} ft away</span> : null}
                        </div>
                      </div>
                    ))}
                    <p className="text-sm font-semibold text-navy">{out ? <>{fmtTime(out)} <span className="font-normal text-ink-soft">Clocked out{p.out_outside ? ` (${Number(p.out_distance_ft).toLocaleString()} ft away)` : ''}</span></> : <span className="text-success">Still working</span>}</p>
                    {p.edited ? <p className="text-xs text-ink-soft">Times edited by the office</p> : null}
                  </div>
                );
              })}
              {punches.some((p) => p.notes) && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-1 text-xs font-bold tracking-wide text-ink-soft">NOTES</p>
                  {punches.filter((p) => p.notes).map((p) => (<p key={String(p.id)} className="text-sm text-ink">“{String(p.notes)}”</p>))}
                </div>
              )}
              {rule && (
                <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
                  Pay rule: {rule.pay_type}{rule.pay_rate != null ? ` · $${Number(rule.pay_rate).toFixed(2)}/${rule.rate_unit}` : ''} · {rule.meal_break_policy} breaks
                </p>
              )}
            </div>
            <div>
              {firstLoc ? (
                <GeoMap lat={Number(firstLoc.lat)} lng={Number(firstLoc.lng)} radiusFt={Number(firstLoc.radius_ft)} user={null} height={360} />
              ) : (
                <p className="text-sm text-ink-soft">No map for this location.</p>
              )}
              <p className="mt-2 text-xs text-ink-soft">{String(firstLoc?.name ?? '')}: the circle is the work area ({TZ.replace('_', ' ')} times).</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
      <div className="rounded-card border border-line bg-white p-2">
        <p className="px-2 py-2 text-xs font-bold text-ink-soft">{prettyDate}</p>
        {employees.map((e) => (
          <Link
            key={String(e.id)}
            href={href(Number(e.id), date)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${Number(e.id) === empId ? 'bg-navy text-white' : 'text-ink hover:bg-paper'}`}
          >
            <span className="truncate">{String(e.full_name)}</span>
            <span className={`ml-2 h-2.5 w-2.5 shrink-0 rounded-full ${dot(Number(e.id))}`} />
          </Link>
        ))}
        <p className="px-2 pb-1 pt-3 text-[11px] text-ink-soft">● grey: not sent · amber: waiting · green: approved</p>
      </div>
      <div>{body}</div>
    </div>
  );
}
