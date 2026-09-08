import { createClient } from '@/lib/supabase/server';
import { addDailyLog } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

export default async function DailyLogTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();
  const { data: logs } = await supabase.from('daily_logs').select('*').eq('project_id', projectId).order('log_date', { ascending: false });
  const addWithId = addDailyLog.bind(null, projectId);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">New entry</p>
        <FormWithFeedback action={addWithId} submitLabel="Save entry">
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="date" name="logDate" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <select name="weather" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"><option>Clear</option><option>Partly cloudy</option><option>Rain</option><option>Storms</option><option>Extreme heat</option></select>
          </div>
          <input name="crew" placeholder="Crew on site" className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <textarea name="workCompleted" rows={2} placeholder="Work completed" className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <input name="delays" placeholder="Delays/issues (optional)" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        </FormWithFeedback>
      </div>
      <div className="space-y-3">
        {(logs ?? []).map((log) => (
          <div key={log.id} className="rounded-card border border-line bg-white p-5">
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-navy">{log.log_date}</span><span className="rounded-full bg-navy-tint px-2.5 py-1 text-xs font-semibold text-navy">{log.weather}</span></div>
            {log.crew && <p className="text-xs text-ink-soft"><b>Crew:</b> {log.crew}</p>}
            <p className="text-xs text-ink-soft"><b>Work completed:</b> {log.work_completed}</p>
            {log.delays && <p className="text-xs text-accent-deep"><b>Delays/issues:</b> {log.delays}</p>}
          </div>
        ))}
        {(!logs || logs.length === 0) && <p className="py-8 text-center text-sm text-ink-soft">No daily log entries yet.</p>}
      </div>
    </div>
  );
}
