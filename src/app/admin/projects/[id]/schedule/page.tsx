import { createClient } from '@/lib/supabase/server';

export default async function ScheduleTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const { data: milestones } = await supabase
    .from('project_milestones')
    .select('id, name, status, completion_percent, planned_start_date, planned_end_date, sort_order')
    .eq('project_id', projectId)
    .order('sort_order');

  const scheduled = (milestones ?? []).filter((m) => m.planned_start_date && m.planned_end_date);

  if (scheduled.length === 0) {
    return (
      <div className="rounded-card border border-line bg-white p-8 text-center">
        <p className="mb-2 text-sm font-semibold text-navy">No schedule dates set yet</p>
        <p className="text-xs text-ink-soft">
          Go to a milestone in the Milestones tab and set its Planned Start and Planned End dates —
          they'll show up here as a timeline once at least one milestone has both dates.
        </p>
      </div>
    );
  }

  const allDates = scheduled.flatMap((m) => [new Date(m.planned_start_date!).getTime(), new Date(m.planned_end_date!).getTime()]);
  const rangeStart = Math.min(...allDates);
  const rangeEnd = Math.max(...allDates);
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1);
  const today = Date.now();
  const todayPct = ((today - rangeStart) / rangeSpan) * 100;

  const statusColor: Record<string, string> = {
    complete: 'bg-success',
    in_progress: 'bg-accent',
    not_started: 'bg-ink-soft',
  };

  // A handful of evenly-spaced date labels along the top of the chart.
  const labelCount = 5;
  const dateLabels = Array.from({ length: labelCount }, (_, i) => {
    const t = rangeStart + (rangeSpan * i) / (labelCount - 1);
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-4 text-xs text-ink-soft">
        Set a milestone's Planned Start and Planned End dates on its own page (Milestones tab) to place it
        here. The vertical orange line marks today.
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-white p-4 sm:p-6">
        <div className="min-w-[600px]">
          {/* Date axis */}
          <div className="mb-2 ml-40 flex justify-between text-[11px] text-ink-soft sm:ml-48">
            {dateLabels.map((label, i) => <span key={i}>{label}</span>)}
          </div>

          <div className="relative">
            {/* Today marker, spans the full chart height */}
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-accent"
                style={{ left: `calc(10rem + ${todayPct}% * (100% - 10rem) / 100)` }}
              />
            )}

            <div className="space-y-2">
              {scheduled.map((m) => {
                const start = new Date(m.planned_start_date!).getTime();
                const end = new Date(m.planned_end_date!).getTime();
                const leftPct = ((start - rangeStart) / rangeSpan) * 100;
                const widthPct = Math.max(((end - start) / rangeSpan) * 100, 1.5);

                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-xs font-medium text-navy sm:w-48" title={m.name}>
                      {m.name}
                    </div>
                    <div className="relative h-6 flex-1 rounded bg-paper">
                      <div
                        className={`absolute top-0 h-6 rounded ${statusColor[m.status]}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${m.planned_start_date} → ${m.planned_end_date} (${m.completion_percent}%)`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink-soft" /> Not started</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> In progress</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" /> Complete</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-accent" /> Today</span>
          </div>
        </div>
      </div>

      {(milestones ?? []).length > scheduled.length && (
        <p className="text-xs text-ink-soft">
          {(milestones ?? []).length - scheduled.length} milestone{(milestones ?? []).length - scheduled.length !== 1 ? 's' : ''} not
          shown yet — set their planned dates to add them to this timeline.
        </p>
      )}
    </div>
  );
}
