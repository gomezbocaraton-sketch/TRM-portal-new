import { createClient } from '@/lib/supabase/server';
import { recordCost } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

const CATEGORIES = ['Materials', 'Labor', 'Subcontractor', 'Permits', 'Other'];

export default async function ProfitabilityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const [{ data: adjustedValue }, { data: costs }] = await Promise.all([
    supabase.rpc('project_adjusted_contract_value', { p_project_id: projectId }),
    supabase.from('project_costs').select('*').eq('project_id', projectId).order('cost_date', { ascending: false }),
  ]);

  const revenue = Number(adjustedValue ?? 0);
  const totalCosts = (costs ?? []).reduce((sum, c) => sum + Number(c.amount), 0);
  const grossProfit = revenue - totalCosts;
  const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
  const recordWithId = recordCost.bind(null, projectId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-5"><p className="mb-1 text-xs text-ink-soft">Revenue (contract)</p><p className="text-2xl font-medium text-navy">${revenue.toLocaleString()}</p></div>
        <div className="rounded-card border border-line bg-white p-5"><p className="mb-1 text-xs text-ink-soft">Costs to date</p><p className="text-2xl font-medium text-accent-deep">${totalCosts.toLocaleString()}</p></div>
        <div className="rounded-card border border-line bg-white p-5"><p className="mb-1 text-xs text-ink-soft">Gross profit</p><p className="text-2xl font-medium text-success">${grossProfit.toLocaleString()}</p></div>
      </div>
      <div className="rounded-card border border-line bg-white p-5">
        <p className="mb-2 text-xs text-ink-soft">Gross margin</p>
        <p className="mb-2 text-3xl font-medium text-navy">{marginPct}%</p>
        <div className="h-2.5 overflow-hidden rounded-full bg-paper"><div className="h-full bg-gradient-to-r from-accent to-navy" style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} /></div>
      </div>
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Record cost</p>
        <FormWithFeedback action={recordWithId} submitLabel="Record cost">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <select name="category" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <input name="vendor" placeholder="Vendor" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="number" name="amount" placeholder="Amount ($)" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="date" name="costDate" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
        </FormWithFeedback>
      </div>
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Cost breakdown</p>
        <div className="space-y-2">{(costs ?? []).map((c) => (<div key={c.id} className="flex justify-between border-b border-line py-2 text-sm last:border-0"><span className="text-ink-soft">{c.cost_date} &middot; {c.category} &middot; {c.vendor}</span><span className="font-semibold text-accent-deep">${Number(c.amount).toLocaleString()}</span></div>))}</div>
      </div>
    </div>
  );
}
