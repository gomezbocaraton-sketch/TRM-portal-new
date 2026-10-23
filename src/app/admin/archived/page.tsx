import { createClient } from '@/lib/supabase/server';
import { unarchiveProject } from '../actions';
import Link from 'next/link';

export default async function ArchivedProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('archived', true)
    .order('archived_at', { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Archived projects</h1>
        <Link href="/admin" className="text-sm text-ink-soft hover:text-navy">&larr; Active projects</Link>
      </div>

      {(!projects || projects.length === 0) ? (
        <p className="text-sm text-ink-soft">No archived projects.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const unarchiveWithId = unarchiveProject.bind(null, p.id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded-card border border-line bg-white p-4 sm:p-6">
                <Link href={`/admin/projects/${p.id}`} className="flex-1">
                  <p className="text-lg font-semibold text-navy">{p.client_entity_name || p.client_name}</p>
                  <p className="text-sm text-ink-soft">Client: {p.client_name}</p>
                </Link>
                <form action={unarchiveWithId}>
                  <button className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy hover:border-accent">
                    Unarchive
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
