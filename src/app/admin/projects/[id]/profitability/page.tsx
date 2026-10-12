import { createClient } from '@/lib/supabase/server';
import { recordCostWithDoc } from './cost-actions';
import { CostsLedger, type CostRow } from './CostsLedger';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Drywall', 'Framing', 'Flooring', 'Paint', 'Roofing',
  'Windows & Doors', 'Cabinets & Countertops', 'General Construction', 'Permits',
  'Equipment Rental', 'Dumpster & Hauling', 'Materials', 'Labor', 'Subcontractor', 'Other',
];
const DOC_TYPES = ['Invoice', 'Purchase order', 'Receipt', 'Other'];

type Row = Record<string, unknown>;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export default async function ProfitabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId: string | number = /^\d+$/.test(id) ? Number(id) : id;
  const supabase = await createClient();

  const [{ data: adjustedValue }, { data: rawCosts }, { data: milestones }] = await Promise.all([
    supabase.rpc('project_adjusted_contract_value', { p_project_id: projectId }),
    supabase.from('project_costs').select('*').eq('project_id', projectId).order('cost_date', { ascending: false }),
    supabase.from('project_milestones').select('*').eq('project_id', projectId).order('id'),
  ]);

  const msName = new Map<string, string>(
    ((milestones ?? []) as Row[]).map((m) => [String(m.id), String(m.name ?? m.title ?? `Milestone ${m.id}`)])
  );

  const paths = ((rawCosts ?? []) as Row[]).map((c) => c.storage_key).filter(Boolean) as string[];
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('project-files').createSignedUrls(paths, 3600);
    (signed ?? []).forEach((s) => { if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl); });
  }

  const costs: CostRow[] = ((rawCosts ?? []) as Row[]).map((c) => ({
    id: c.id as string | number,
    category: String(c.category ?? 'Other'),
    vendor: String(c.vendor ?? '—'),
    amount: Number(c.amount ?? 0),
    cost_date: (c.cost_date as string | null) ?? null,
    description: (c.description as string | null) ?? null,
    doc_type: (c.doc_type as string | null) ?? null,
    file_name: (c.file_name as string | null) ?? null,
    signedUrl: c.storage_key ? urlByPath.get(String(c.storage_key)) ?? null : null,
    milestoneId: c.milestone_id != null ? String(c.milestone_id) : 'general',
    milestone: c.milestone_id != null ? msName.get(String(c.milestone_id)) ?? 'Milestone' : 'General (no milestone)',
  }));

  const revenue = Number(adjustedValue ?? 0);
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const grossProfit = revenue - totalCosts;
  const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
  const vendors = [...new Set(costs.map((c) => c.vendor))].sort();
  const today = new Date().toISOString().slice(0, 10);

  const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-medium text-ink-soft';

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Revenue (contract)</p>
          <p className="mt-1 text-2xl font-medium text-navy">{money(revenue)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Costs to date</p>
          <p className="mt-1 text-2xl font-medium text-accent-deep">{money(totalCosts)}</p>
        </div>
        <div className="rounded-card border border-line bg-white p-5">
          <p className="text-xs font-medium text-ink-soft">Gross profit</p>
          <p className={`mt-1 text-2xl font-medium ${grossProfit >= 0 ? 'text-success' : 'text-red-600'}`}>{money(grossProfit)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-card border border-line bg-white p-5">
        <p className="text-xs font-medium text-ink-soft">Gross margin</p>
        <p className="mt-1 text-2xl font-medium text-navy">{marginPct}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-gradient-to-r from-accent to-navy" style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} />
        </div>
      </div>

      <div className="mb-6 rounded-card border border-line bg-white p-6">
        <p className="text-sm font-semibold text-navy">Record cost</p>
        <p className="mb-4 text-xs text-ink-soft">Attach the invoice, purchase order or receipt, then tag the cost so it rolls up by category, vendor and milestone.</p>
        <FormWithFeedback action={recordCostWithDoc.bind(null, projectId)} submitLabel="Record cost" pendingLabel="Saving…">
          <div className="mb-4">
            <label className={label}>Document (optional)</label>
            <DropFileInput name="file" pathPrefix={`${projectId}/costs`} />
          </div>
          <div className="mb-4">
            <label className={label}>Document type</label>
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map((t, i) => (
                <label key={t} className="cursor-pointer">
                  <input type="radio" name="docType" value={t} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Category *</label>
              <select name="category" required defaultValue="" className={input}>
                <option value="" disabled>Choose a category…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Vendor *</label>
              <input name="vendor" required list="vendor-list" placeholder="e.g. The Home Depot" className={input} />
              <datalist id="vendor-list">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            </div>
            <div>
              <label className={label}>Milestone *</label>
              <select name="milestone" required defaultValue="" className={input}>
                <option value="" disabled>Choose a milestone…</option>
                {((milestones ?? []) as Row[]).map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>{String(m.name ?? m.title ?? `Milestone ${m.id}`)}</option>
                ))}
                <option value="general">General (no milestone)</option>
              </select>
            </div>
            <div>
              <label className={label}>Amount *</label>
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="$ 0.00" className={input} />
            </div>
            <div>
              <label className={label}>Date</label>
              <input name="costDate" type="date" defaultValue={today} className={input} />
            </div>
            <div>
              <label className={label}>Description</label>
              <input name="description" placeholder="What was it for? (optional)" className={input} />
            </div>
          </div>
        </FormWithFeedback>
      </div>

      <CostsLedger
        projectId={projectId}
        costs={costs}
        categories={CATEGORIES}
        docTypes={DOC_TYPES}
        milestoneOptions={((milestones ?? []) as Row[]).map((m) => ({
          id: String(m.id),
          name: String(m.name ?? m.title ?? `Milestone ${m.id}`),
        }))}
      />
    </div>
  );
}
