import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { getPurchasingContext } from '@/lib/purchasing';
import { NewPurchaseForm } from './NewPurchaseForm';

type Row = Record<string, unknown>;

export default async function NewPurchasePage() {
  const supabase = await createClient();
  const ctx = await getPurchasingContext(supabase);
  const { data } = await supabase.from('projects').select('*').order('id', { ascending: false });

  const projects = ((data ?? []) as Row[]).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? p.title ?? p.address ?? p.client_name ?? `Project ${p.id}`),
  }));

  return (
    <div>
      <Link href="/admin/purchasing" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Purchasing
      </Link>
      <div className="rounded-card border border-line bg-white p-6">
        <h1 className="mb-4 text-lg font-semibold text-navy">New purchase</h1>
        <NewPurchaseForm projects={projects} threshold={ctx.threshold} />
      </div>
    </div>
  );
}
