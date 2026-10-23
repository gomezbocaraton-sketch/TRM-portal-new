import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function MilestonesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const { data: milestones } = await supabase
    .from('project_milestones')
    .select('id, name, status, completion_percent, sort_order')
    .eq('project_id', projectId)
    .order('sort_order');

  const statusStyle: Record<string, string> = {
    complete: 'bg-success-tint text-success',
    in_progress: 'bg-accent-tint text-accent-deep',
    not_started: 'bg-paper text-ink-soft',
  };

  return (
    <div className="space-y-2">
      {(milestones ?? []).map((m) => (
        <Link key={m.id} href={`/admin/projects/${projectId}/milestones/${m.id}`} className="flex items-center justify-between rounded-card border border-line bg-white px-5 py-3.5 hover:border-accent">
          <span className="text-sm font-medium text-navy">{m.name}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[m.status]}`}>
            {m.status === 'not_started' ? 'Not started' : m.status === 'in_progress' ? `${m.completion_percent}%` : 'Complete'}
          </span>
        </Link>
      ))}
    </div>
  );
}
