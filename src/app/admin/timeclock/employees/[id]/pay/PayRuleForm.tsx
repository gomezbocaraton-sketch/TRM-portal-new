'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePayRule, savePayRule } from '../../../actions';
import { MEAL_POLICIES, OVERTIME_RULES, PAY_TYPES } from '@/lib/timepay';

export function PayRuleForm({ employeeId, today }: { employeeId: number; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({ effectiveDate: today, payType: PAY_TYPES[0], payRate: '', rateUnit: 'hour', exemption: 'Non-exempt', overtimeRule: OVERTIME_RULES[0], mealBreakPolicy: MEAL_POLICIES[0] });
  const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-medium text-ink-soft';
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
        + Pay &amp; overtime rule
      </button>
    );
  }
  return (
    <div className="rounded-card border border-line bg-white p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className={label}>Effective date</label><input type="date" value={f.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} className={input} /></div>
        <div><label className={label}>Pay type</label><select value={f.payType} onChange={(e) => set('payType', e.target.value)} className={input}>{PAY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="flex gap-2">
          <div className="flex-1"><label className={label}>Pay rate ($)</label><input value={f.payRate} onChange={(e) => set('payRate', e.target.value)} inputMode="decimal" className={input} placeholder="180.00" /></div>
          <div className="w-28"><label className={label}>Per</label><select value={f.rateUnit} onChange={(e) => set('rateUnit', e.target.value)} className={input}><option value="hour">hour</option><option value="day">day</option></select></div>
        </div>
        <div><label className={label}>Exemption status</label><select value={f.exemption} onChange={(e) => set('exemption', e.target.value)} className={input}><option>Non-exempt</option><option>Exempt</option></select></div>
        <div><label className={label}>Overtime rule</label><select value={f.overtimeRule} onChange={(e) => set('overtimeRule', e.target.value)} className={input}>{OVERTIME_RULES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className={label}>Meal break policy</label><select value={f.mealBreakPolicy} onChange={(e) => set('mealBreakPolicy', e.target.value)} className={input}>{MEAL_POLICIES.map((t) => <option key={t}>{t}</option>)}</select></div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Unpaid: break time is taken off the hours. Paid: breaks count as worked time. Overtime only applies to non-exempt hourly pay.</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError('');
              const res = await savePayRule({ employeeId, ...f });
              if (!res.ok) setError(res.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save rule'}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-ink-soft underline">Cancel</button>
      </div>
    </div>
  );
}

export function DeleteRuleButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deletePayRule(id);
          router.refresh();
        })
      }
      className="text-xs text-ink-soft underline"
    >
      Delete
    </button>
  );
}
