import { TZ } from '@/lib/timeclock';

export type PayRule = {
  employee_id: number;
  effective_date: string; // YYYY-MM-DD
  pay_type: string;
  pay_rate: number | null;
  rate_unit: 'hour' | 'day';
  exemption: string;
  overtime_rule: string;
  meal_break_policy: string;
};

export const PAY_TYPES = ['Employee (W-2)', 'Contractor (1099)'];
export const OVERTIME_RULES = ['None', 'Over 40 hours a week at 1.5x'];
export const MEAL_POLICIES = ['Unpaid', 'Paid'];

export function etYmd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function ruleOn(rules: PayRule[], empId: number, ymd: string): PayRule | null {
  let best: PayRule | null = null;
  for (const r of rules) {
    if (r.employee_id !== empId || r.effective_date > ymd) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best;
}

// Monday of the week (YYYY-MM-DD) for a YYYY-MM-DD date.
export function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  const back = (dow + 6) % 7;
  const dt = new Date(t - back * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function fmtHrs(h: number, format: 'decimal' | 'hhmm'): string {
  if (format === 'decimal') return h.toFixed(2);
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// Hours that are paid for one shift. Unpaid meal-break policy subtracts the breaks.
export function payableHours(shiftMin: number, breakMin: number, policy: string | undefined): number {
  const paid = policy === 'Paid' ? shiftMin : shiftMin - breakMin;
  return Math.max(0, paid) / 60;
}
