import { createClient } from '@/lib/supabase/server';
import { addTour } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

export default async function MatterportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();
  const { data: tours } = await supabase.from('matterport_tours').select('*').eq('project_id', projectId).order('scan_date', { ascending: false });
  const addWithId = addTour.bind(null, projectId);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Add tour</p>
        <FormWithFeedback action={addWithId} submitLabel="Save tour">
          <input name="title" placeholder="Tour title" className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="date" name="scanDate" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="url" placeholder="Matterport share link" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
        </FormWithFeedback>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(tours ?? []).map((t) => (
          <a key={t.id} href={t.matterport_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-card border border-line bg-white hover:border-accent">
            <div className="flex aspect-video items-center justify-center bg-navy-tint"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">▶</span></div>
            <div className="p-4"><p className="text-sm font-semibold text-navy">{t.title}</p><p className="text-xs text-ink-soft">{t.scan_date}</p></div>
          </a>
        ))}
      </div>
    </div>
  );
}
