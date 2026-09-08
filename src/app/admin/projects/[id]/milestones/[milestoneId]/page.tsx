import { createClient } from '@/lib/supabase/server';
import { updateMilestone, addTodo, toggleTodo, uploadPhoto } from '../actions';
import Link from 'next/link';

export default async function MilestoneDetailPage({ params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const { id, milestoneId } = await params;
  const projectId = Number(id);
  const mId = Number(milestoneId);
  const supabase = await createClient();

  const [{ data: milestone }, { data: todos }, { data: photos }] = await Promise.all([
    supabase.from('project_milestones').select('*').eq('id', mId).single(),
    supabase.from('milestone_todos').select('*').eq('milestone_id', mId).order('created_at'),
    supabase.from('photos').select('*').eq('milestone_id', mId).order('uploaded_at', { ascending: false }),
  ]);

  if (!milestone) return null;

  const updateWithIds = updateMilestone.bind(null, projectId, mId);
  const addTodoWithIds = addTodo.bind(null, projectId, mId);
  const uploadPhotoWithIds = uploadPhoto.bind(null, projectId, mId);

  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(p.storage_key, 3600);
      return { ...p, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div>
      <Link href={`/admin/projects/${projectId}/milestones`} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; All milestones</Link>
      <div className="rounded-card border border-line bg-white p-6">
        <p className="mb-4 text-lg font-medium text-navy">{milestone.name}</p>

        <form action={updateWithIds} className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Status</label>
              <select name="status" defaultValue={milestone.status} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Completion %</label>
              <input type="number" name="completionPercent" min={0} max={100} defaultValue={milestone.completion_percent} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Notes</label>
            <textarea name="notes" rows={2} defaultValue={milestone.notes ?? ''} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Save</button>
        </form>

        <div className="mb-6 border-t border-line pt-4">
          <p className="mb-2 text-sm font-semibold text-navy">To-dos</p>
          <div className="mb-3 space-y-1">
            {(todos ?? []).map((t) => <ToggleTodoRow key={t.id} projectId={projectId} milestoneId={mId} todo={t} />)}
          </div>
          <form action={addTodoWithIds} className="flex gap-2">
            <input name="text" placeholder="Add a to-do" className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <button className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-navy">Add</button>
          </form>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-semibold text-navy">Photos</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {photosWithUrls.map((p) =>
              p.signedUrl ? (
                <a key={p.id} href={p.signedUrl} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg bg-navy-tint" title={p.caption ?? ''}>
                  <img src={p.signedUrl} alt={p.caption ?? ''} className="h-full w-full object-cover" />
                </a>
              ) : (
                <div key={p.id} className="aspect-square rounded-lg bg-navy-tint" title={p.caption ?? ''} />
              )
            )}
          </div>
          <form action={uploadPhotoWithIds} className="flex items-center gap-2">
            <input type="file" name="file" className="text-xs" />
            <input name="caption" placeholder="Caption (optional)" className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs" />
            <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy">Upload</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ToggleTodoRow({ projectId, milestoneId, todo }: { projectId: number; milestoneId: number; todo: { id: number; text: string; done: boolean } }) {
  const toggleWithIds = toggleTodo.bind(null, projectId, milestoneId, todo.id, !todo.done);
  return (
    <form action={toggleWithIds} className="flex items-center gap-2">
      <button type="submit" className="flex items-center gap-2 text-left">
        <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${todo.done ? 'border-accent bg-accent text-white' : 'border-line'}`}>{todo.done ? '✓' : ''}</span>
        <span className={`text-sm ${todo.done ? 'text-ink-soft line-through' : 'text-ink'}`}>{todo.text}</span>
      </button>
    </form>
  );
}
