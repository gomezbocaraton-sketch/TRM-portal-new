import { createClient } from '@/lib/supabase/server';
import { uploadDocument, setDocumentStatus } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

const CATEGORIES = ['plans', 'permits', 'insurance', 'appliances_specs', 'other'] as const;
const LABELS: Record<string, string> = { plans: 'Plans', permits: 'Permits', insurance: 'Insurance', appliances_specs: 'Appliances & Specs', other: 'Other' };

export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();
  const { data: docs } = await supabase.from('documents').select('*').eq('project_id', projectId).order('uploaded_at', { ascending: false });
  const uploadWithId = uploadDocument.bind(null, projectId);
  const docsWithUrls = await Promise.all((docs ?? []).map(async (d) => {
    const { data } = await supabase.storage.from('project-files').createSignedUrl(d.storage_key, 3600);
    return { ...d, signedUrl: data?.signedUrl ?? null };
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Upload document</p>
        <FormWithFeedback action={uploadWithId} submitLabel="Save document" pendingLabel="Uploading…">
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <select name="category" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">{CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}</select>
            <DropFileInput name="file" />
          </div>
          <input name="notes" placeholder="Notes (optional)" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        </FormWithFeedback>
      </div>
      {CATEGORIES.map((cat) => {
        const inCategory = docsWithUrls.filter((d) => d.category === cat).sort((a, b) => (a.version_status === b.version_status ? 0 : a.version_status === 'current' ? -1 : 1));
        return (
          <div key={cat}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{LABELS[cat]}</p>
            {inCategory.length === 0 ? <p className="mb-4 text-xs text-ink-soft">No {LABELS[cat].toLowerCase()} uploaded yet.</p> : (
              <div className="mb-4 space-y-2">
                {inCategory.map((d) => {
                  const isSuperseded = d.version_status === 'superseded';
                  const toggleAction = setDocumentStatus.bind(null, projectId, d.id, isSuperseded ? 'current' : 'superseded');
                  return (
                    <div key={d.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 ${isSuperseded ? 'border-line bg-paper opacity-70' : 'border-line bg-white'}`}>
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <p className="text-sm font-semibold text-navy">{d.file_name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isSuperseded ? 'bg-paper text-ink-soft' : 'bg-success-tint text-success'}`}>{isSuperseded ? 'Superseded' : 'Current'}</span>
                        </div>
                        <p className="text-xs text-ink-soft">{d.notes ? `${d.notes} · ` : ''}{d.uploaded_at?.slice(0, 10)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:border-accent">View</a>}
                        <form action={toggleAction}><button className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:border-accent">{isSuperseded ? 'Mark as current' : 'Mark as superseded'}</button></form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
