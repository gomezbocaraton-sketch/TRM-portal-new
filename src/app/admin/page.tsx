import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, client_name, status')
    .order('created_at', { ascending: false });

  const projectsWithCompletion = await Promise.all(
    (projects ?? []).map(async (p) => {
      const { data: pct } = await supabase.rpc('project_completion_percent', {
        p_project_id: p.id,
      });
      return { ...p, completion: pct ?? 0 };
    })
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-medium text-navy sm:text-2xl">Projects</h1>
        <Link
          href="/admin/projects/new"
          className="inline-block w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          + Add project
        </Link>
      </div>

      <div className="space-y-2">
        {projectsWithCompletion.map((p) => (
          <Link
            key={p.id}
            href={`/admin/projects/${p.id}`}
            className="flex flex-col gap-3 rounded-card border border-line bg-white px-4 py-4 hover:border-accent sm:flex-row sm:items-center sm:justify-between sm:px-6"
          >
            <div>
              <p className="font-semibold text-navy">{p.name}</p>
              <p className="text-sm text-ink-soft">Client: {p.client_name}</p>
            </div>
            <div className="sm:w-56">
              <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-accent" style={{ width: `${p.completion}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-soft">{p.completion}% overall</p>
            </div>
          </Link>
        ))}

        {projectsWithCompletion.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-soft">
            No projects yet — add your first one to get started.
          </p>
        )}
      </div>
    </main>
  );
}
