import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import TabNav from './TabNav';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, client_name')
    .eq('id', id)
    .single();

  if (!project) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/admin" className="mb-2 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Projects
      </Link>
      <h1 className="mb-1 text-xl font-medium text-navy sm:text-2xl">{project.name}</h1>
      <p className="mb-6 text-sm text-ink-soft">Client: {project.client_name}</p>

      <TabNav projectId={Number(id)} />

      {children}
    </main>
  );
}
