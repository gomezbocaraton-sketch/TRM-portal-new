import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PayRuleForm, DeleteRuleButton } from './PayRuleForm';
import { etYmd } from '@/lib/timepay';

type Row = Record<string, unknown>;

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empId = Number(id);
  const supabase = await createClient();
  const [{ data: emp }, { data: rules, error }] = await Promise.all([
    supabase.from('time_employees').select('id, full_name').eq('id', empId).maybeSingle(),
    supabase.from('time_pay_rules').select('*').eq('employee_id', empId).order('effective_date', { ascending: false }),
  ]);
  if (!emp) return <p className="text-sm text-ink-soft">Employee not found.</p>;
  const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-soft';

  return (
    <div>
      <Link href="/admin/timeclock/employees" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Employees</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy">{String((emp as Row).full_name)}: pay &amp; overtime</h2>
        <PayRuleForm employeeId={empId} today={etYmd(new Date().toISOString())} />
      </div>
      {error && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Run the time clock pay SQL (timeclock_v3) in Supabase to turn this on.</p>}
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper">
              <th className={th}>Effective date</th><th className={th}>Pay type</th><th className={th}>Pay rate</th><th className={th}>Exemption</th><th className={th}>Overtime rule</th><th className={th}>Meal break</th><th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {((rules ?? []) as Row[]).length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-soft">No rules yet. Breaks are unpaid and no pay is estimated until you add one.</td></tr>
            )}
            {((rules ?? []) as Row[]).map((r) => (
              <tr key={String(r.id)} className="border-b border-line last:border-0">
                <td className="px-3 py-3">{String(r.effective_date)}</td>
                <td className="px-3 py-3">{String(r.pay_type)}</td>
                <td className="px-3 py-3">{r.pay_rate != null ? `$${Number(r.pay_rate).toFixed(2)}/${String(r.rate_unit)}` : '—'}</td>
                <td className="px-3 py-3">{String(r.exemption)}</td>
                <td className="px-3 py-3">{String(r.overtime_rule)}</td>
                <td className="px-3 py-3">{String(r.meal_break_policy)}</td>
                <td className="px-3 py-3 text-right"><DeleteRuleButton id={Number(r.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
