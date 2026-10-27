import { createClient } from '@/lib/supabase/server';
import { addDays, etYmd } from '@/lib/timepay';

type Row = Record<string, unknown>;

export default async function ReportsPage() {
  const supabase = await createClient();
  const [{ data: emps }, { data: locs }] = await Promise.all([
    supabase.from('time_employees').select('id, full_name').order('full_name'),
    supabase.from('time_locations').select('id, name').order('name'),
  ]);
  const today = etYmd(new Date().toISOString());
  const input = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-bold text-navy';

  return (
    <form action="/admin/timeclock/reports/download" method="get" className="max-w-xl rounded-card border border-line bg-white p-5 sm:p-6">
      <p className="mb-4 text-base font-semibold text-navy">Download report</p>

      <label className={label}>Report type</label>
      <select name="type" className={`${input} mb-1 w-full`}>
        <option value="detail">Time cards (detail)</option>
        <option value="summary">Time cards (summary by employee)</option>
      </select>
      <p className="mb-4 text-xs text-ink-soft">Detail: every shift with clock in, out, breaks and hours. Summary: one line per employee with days, hours, overtime and estimated pay.</p>

      <p className={label}>Include</p>
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="notes" defaultChecked /> Notes</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="status" defaultChecked /> Approval status</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="pay" defaultChecked /> Estimated pay</label>
      </div>

      <p className={label}>Team members</p>
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="all" defaultChecked /> All team members</label>
      <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-line p-2 text-sm">
        {((emps ?? []) as Row[]).map((e) => (
          <label key={String(e.id)} className="flex items-center gap-2 py-0.5"><input type="checkbox" name="emp" value={String(e.id)} /> {String(e.full_name)}</label>
        ))}
        <p className="pt-1 text-xs text-ink-soft">Leave &ldquo;All&rdquo; ticked to include everyone, or untick it and choose names.</p>
      </div>

      <label className={label}>Location / project</label>
      <select name="loc" className={`${input} mb-4 w-full`}>
        <option value="">All locations</option>
        {((locs ?? []) as Row[]).map((l) => (<option key={String(l.id)} value={String(l.id)}>{String(l.name)}</option>))}
      </select>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div><label className={label}>Start</label><input type="date" name="start" defaultValue={addDays(today, -6)} className={`${input} w-full`} /></div>
        <div><label className={label}>End</label><input type="date" name="end" defaultValue={today} className={`${input} w-full`} /></div>
      </div>

      <p className={label}>Hour display format</p>
      <div className="mb-4 flex gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="fmt" value="hhmm" /> HH:MM</label>
        <label className="flex items-center gap-2"><input type="radio" name="fmt" value="decimal" defaultChecked /> Decimal</label>
      </div>

      <p className={label}>Report format</p>
      <div className="mb-5 flex gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="out" value="pdf" /> PDF</label>
        <label className="flex items-center gap-2"><input type="radio" name="out" value="csv" defaultChecked /> CSV</label>
      </div>

      <button className="w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-white">Download</button>
    </form>
  );
}
