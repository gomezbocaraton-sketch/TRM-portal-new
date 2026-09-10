import { createClient } from '@/lib/supabase/server';
import { addPunchItem, toggleItem } from './actions';
import { DropFileInput } from '@/components/DropFileInput';

export default async function PunchListTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const { data: items } = await supabase.from('punch_list_items').select('*').eq('project_id', projectId).order('status').order('created_at', { ascending: false });
  const addWithId = addPunchItem.bind(null, projectId);
  const open = (items ?? []).filter((i) => i.status === 'open');
  const complete = (items ?? []).filter((i) => i.status === 'complete');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-4 text-xs text-ink-soft">
        A punch list is separate from Milestones — small corrective/incomplete items tracked and closed out before final walkthrough.
      </div>
      <form action={addWithId} className="rounded-card border border-line bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-navy">New punch list item</p>
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-ink-soft">Description</label>
          <textarea name="description" rows={2} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        </div>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <input name="location" placeholder="Location" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <input name="trade" placeholder="Trade" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <DropFileInput name="photo" />
        </div>
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Add item</button>
      </form>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Open ({open.length})</p>
        <div className="space-y-2">
          {open.map((item) => <PunchRow key={item.id} projectId={projectId} item={item} />)}
          {open.length === 0 && <p className="text-xs text-ink-soft">No open items.</p>}
        </div>
      </div>
      {complete.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Complete ({complete.length})</p>
          <div className="space-y-2">{complete.map((item) => <PunchRow key={item.id} projectId={projectId} item={item} />)}</div>
        </div>
      )}
    </div>
  );
}

function PunchRow({ projectId, item }: { projectId: number; item: { id: number; description: string; location: string | null; trade: string | null; status: string } }) {
  const toggleWithIds = toggleItem.bind(null, projectId, item.id, item.status !== 'complete');
  const done = item.status === 'complete';
  return (
    <form action={toggleWithIds} className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3">
      <button type="submit" className="flex flex-1 items-center gap-3 text-left">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${done ? 'border-accent bg-accent text-white' : 'border-line'}`}>{done ? '✓' : ''}</span>
        <span>
          <p className={`text-sm ${done ? 'text-ink-soft line-through' : 'text-navy'}`}>{item.description}</p>
          <p className="text-xs text-ink-soft">{item.location}{item.trade ? ` · ${item.trade}` : ''}</p>
        </span>
      </button>
    </form>
  );
}
