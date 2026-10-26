import { createClient } from '@/lib/supabase/server';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';
import { removePlanFile, setPlanStatus, uploadPlanFile } from '@/app/admin/projects/[id]/purchasing/actions';

type Row = Record<string, unknown>;

function day(iso: string | null | undefined): string {
  if (!iso) return 'no date';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Plans for a project, with a date on each one, because plans get amended.
// Shown on the project Overview and on the Purchasing tab.
export async function PlansBox({ projectId, note }: { projectId: string; note?: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('category', 'plans')
    .order('uploaded_at', { ascending: false });
  const rows = ((data ?? []) as Row[]).sort((a, b) => String(b.plan_date ?? '').localeCompare(String(a.plan_date ?? '')));
  const withUrls: (Row & { signedUrl: string | null })[] = await Promise.all(
    rows.map(async (d): Promise<Row & { signedUrl: string | null }> => {
      const { data: u } = await supabase.storage.from('project-files').createSignedUrl(String(d.storage_key), 3600);
      return Object.assign({}, d, { signedUrl: u?.signedUrl ?? null });
    })
  );
  const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';

  return (
    <div className="mb-4 rounded-lg border border-line p-4">
      <p className="mb-1 text-sm font-medium text-navy">Plans</p>
      <p className="mb-3 text-xs text-ink-soft">
        Add the plans and every amendment, each with the date on it. {note ?? 'Only plans marked Current are used when the system reads the plans for purchasing.'}
      </p>

      {withUrls.length > 0 && (
        <div className="mb-4 space-y-2">
          {withUrls.map((d) => {
            const current = String(d.version_status ?? 'current') !== 'superseded';
            return (
              <div key={String(d.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-navy">
                    {String(d.notes || d.file_name)} · dated {day(d.plan_date as string | null)}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${current ? 'bg-success-tint text-success' : 'bg-white text-ink-soft'}`}>
                      {current ? 'Current' : 'Replaced'}
                    </span>
                  </p>
                  <p className="text-xs text-ink-soft">
                    {String(d.file_name)} · uploaded{' '}
                    {d.uploaded_at
                      ? new Date(String(d.uploaded_at)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
                      : ''}
                    {!String(d.storage_key).toLowerCase().endsWith('.pdf') ? ' · not a PDF, so it cannot be read' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {d.signedUrl ? (
                    <a href={String(d.signedUrl)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent-deep underline">
                      View
                    </a>
                  ) : null}
                  <form action={setPlanStatus.bind(null, Number(d.id), current ? 'superseded' : 'current')}>
                    <button className="text-xs font-semibold text-ink-soft underline decoration-dotted">{current ? 'Mark as replaced' : 'Make current'}</button>
                  </form>
                  <form action={removePlanFile.bind(null, Number(d.id), String(d.storage_key))}>
                    <button className="text-xs font-semibold text-red-600 underline decoration-dotted">Delete</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormWithFeedback action={uploadPlanFile.bind(null, projectId)} submitLabel="Save plans" pendingLabel="Saving…">
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="label" placeholder="e.g. Original plans, Amendment 1" className={input} />
          <div>
            <input type="date" name="planDate" className={input} aria-label="Date on the plans" />
            <span className="mt-1 block text-[11px] text-ink-soft">Date on the plans (signed or issued)</span>
          </div>
        </div>
        <DropFileInput name="file" pathPrefix={`${projectId}/plans`} compact />
        <label className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" name="replaces" /> This is an amendment: mark the earlier plans as replaced
        </label>
      </FormWithFeedback>
    </div>
  );
}
