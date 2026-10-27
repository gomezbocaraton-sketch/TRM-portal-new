import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { etLocalToIso, fmtTime } from '@/lib/timeclock';
import { addDays, etYmd, fmtHrs, payableHours, ruleOn, weekStart, type PayRule } from '@/lib/timepay';

type Row = Record<string, unknown>;

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const latin = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '?');

async function pdfOf(title: string, sub: string, headers: string[], rows: string[][], widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792, H = 612, M = 36;
  const scale = (W - 2 * M) / widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => w * scale);
  let page = doc.addPage([W, H]);
  let y = H - M;
  const head = () => {
    let x = M;
    headers.forEach((h, i) => {
      page.drawText(latin(h), { x, y, size: 8, font: bold, color: rgb(0.08, 0.16, 0.29) });
      x += cols[i];
    });
    y -= 14;
  };
  page.drawText(latin(title), { x: M, y, size: 15, font: bold, color: rgb(0.08, 0.16, 0.29) });
  y -= 16;
  page.drawText(latin(sub), { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 22;
  head();
  for (const r of rows) {
    if (y < M + 14) {
      page = doc.addPage([W, H]);
      y = H - M;
      head();
    }
    let x = M;
    r.forEach((c, i) => {
      let t = latin(c);
      const max = Math.floor(cols[i] / 4.2);
      if (t.length > max) t = t.slice(0, Math.max(1, max - 1)) + '.';
      page.drawText(t, { x, y, size: 8, font });
      x += cols[i];
    });
    y -= 12;
  }
  return doc.save();
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const type = q.get('type') === 'summary' ? 'summary' : 'detail';
  const fmt = q.get('fmt') === 'hhmm' ? 'hhmm' : 'decimal';
  const out = q.get('out') === 'pdf' ? 'pdf' : 'csv';
  const wantNotes = q.has('notes');
  const wantStatus = q.has('status');
  const wantPay = q.has('pay');
  const all = q.has('all');
  const empIds = q.getAll('emp').map(Number).filter((n) => Number.isFinite(n));
  const loc = Number(q.get('loc')) || null;
  const startYmd = /^\d{4}-\d{2}-\d{2}$/.test(q.get('start') ?? '') ? (q.get('start') as string) : etYmd(new Date().toISOString());
  const endYmd = /^\d{4}-\d{2}-\d{2}$/.test(q.get('end') ?? '') ? (q.get('end') as string) : startYmd;
  const startIso = etLocalToIso(`${startYmd}T00:00`) as string;
  const endIso = etLocalToIso(`${addDays(endYmd, 1)}T00:00`) as string;

  const supabase = await createClient();
  let pq = supabase.from('time_punches').select('*, time_employees(full_name), time_locations(name)').gte('clock_in', startIso).lt('clock_in', endIso).order('clock_in', { ascending: true });
  if (loc) pq = pq.eq('location_id', loc);
  if (!all && empIds.length) pq = pq.in('employee_id', empIds);
  const { data } = await pq;
  const punches = (data ?? []) as Row[];

  const [{ data: bk }, { data: rl }] = await Promise.all([
    punches.length ? supabase.from('time_breaks').select('punch_id, start_at, end_at').in('punch_id', punches.map((p) => p.id as number)) : Promise.resolve({ data: [] as Row[] }),
    supabase.from('time_pay_rules').select('*'),
  ]);
  const rules = (rl ?? []) as unknown as PayRule[];
  const breakBy = new Map<string, number>();
  for (const b of (bk ?? []) as Row[]) {
    const m = ((b.end_at ? new Date(String(b.end_at)).getTime() : Date.now()) - new Date(String(b.start_at)).getTime()) / 60000;
    breakBy.set(String(b.punch_id), (breakBy.get(String(b.punch_id)) ?? 0) + Math.max(0, m));
  }

  type Item = { ymd: string; empId: number; emp: string; loc: string; inIso: string; outIso: string | null; brk: number; hrs: number; notes: string; status: string; rule: PayRule | null };
  const items: Item[] = punches.map((p) => {
    const ymd = etYmd(String(p.clock_in));
    const empId = Number(p.employee_id);
    const rule = ruleOn(rules, empId, ymd);
    const outIso = (p.clock_out as string | null) ?? null;
    const shift = ((outIso ? new Date(outIso).getTime() : Date.now()) - new Date(String(p.clock_in)).getTime()) / 60000;
    const brk = breakBy.get(String(p.id)) ?? 0;
    return {
      ymd, empId, emp: String((p.time_employees as Row | null)?.full_name ?? ''), loc: String((p.time_locations as Row | null)?.name ?? ''),
      inIso: String(p.clock_in), outIso, brk, hrs: payableHours(shift, brk, rule?.meal_break_policy), notes: String(p.notes ?? ''),
      status: p.status === 'approved' ? 'Approved' : p.status === 'submitted' ? 'Sent' : 'Not sent', rule,
    };
  });

  const money = (n: number) => '$' + n.toFixed(2);
  let headers: string[];
  let rows: string[][];
  let widths: number[];

  if (type === 'detail') {
    headers = ['Date', 'Employee', 'Location', 'In', 'Out', 'Break (min)', 'Hours'];
    widths = [60, 120, 130, 55, 55, 60, 50];
    if (wantStatus) { headers.push('Status'); widths.push(55); }
    if (wantPay) { headers.push('Est. pay'); widths.push(55); }
    if (wantNotes) { headers.push('Notes'); widths.push(140); }
    const dayPaid = new Set<string>();
    rows = items.map((it) => {
      const r = [it.ymd, it.emp, it.loc, fmtTime(it.inIso), it.outIso ? fmtTime(it.outIso) : '', it.brk ? String(Math.round(it.brk)) : '', it.outIso ? fmtHrs(it.hrs, fmt) : ''];
      if (wantStatus) r.push(it.status);
      if (wantPay) {
        let pay = '';
        if (it.rule?.pay_rate != null && it.outIso) {
          if (it.rule.rate_unit === 'day') {
            const k = `${it.empId}|${it.ymd}`;
            if (!dayPaid.has(k)) { dayPaid.add(k); pay = money(Number(it.rule.pay_rate)); }
          } else pay = money(it.hrs * Number(it.rule.pay_rate));
        }
        r.push(pay);
      }
      if (wantNotes) r.push(it.notes);
      return r;
    });
  } else {
    headers = ['Employee', 'Days', 'Regular hrs', 'Overtime hrs', 'Total hrs'];
    widths = [150, 50, 80, 80, 70];
    if (wantPay) { headers.push('Pay type', 'Est. pay'); widths.push(100, 70); }
    const by = new Map<number, Item[]>();
    for (const it of items.filter((i) => i.outIso)) by.set(it.empId, [...(by.get(it.empId) ?? []), it]);
    rows = [...by.entries()].map(([, list]) => {
      const days = new Set(list.map((i) => i.ymd));
      const weeks = new Map<string, Item[]>();
      for (const i of list) weeks.set(weekStart(i.ymd), [...(weeks.get(weekStart(i.ymd)) ?? []), i]);
      let reg = 0, ot = 0, pay = 0;
      for (const [, wk] of weeks) {
        const last = wk[wk.length - 1];
        const rule = last.rule;
        const h = wk.reduce((s, i) => s + i.hrs, 0);
        const hourly = rule?.rate_unit === 'hour';
        const otOn = Boolean(rule && hourly && rule.exemption === 'Non-exempt' && rule.overtime_rule !== 'None');
        const wOt = otOn ? Math.max(0, h - 40) : 0;
        reg += h - wOt;
        ot += wOt;
        if (rule?.pay_rate != null) {
          const rate = Number(rule.pay_rate);
          if (hourly) pay += (h - wOt) * rate + wOt * rate * 1.5;
          else pay += new Set(wk.map((i) => i.ymd)).size * rate;
        }
      }
      const r = [list[0].emp, String(days.size), fmtHrs(reg, fmt), fmtHrs(ot, fmt), fmtHrs(reg + ot, fmt)];
      if (wantPay) r.push(list[list.length - 1].rule?.pay_type ?? '', list.some((i) => i.rule?.pay_rate != null) ? money(pay) : '');
      return r;
    });
  }

  const name = `time-cards-${type}-${startYmd}-to-${endYmd}`;
  if (out === 'pdf') {
    const bytes = await pdfOf(`Time cards (${type})`, `${startYmd} to ${endYmd} · hours shown as ${fmt === 'hhmm' ? 'HH:MM' : 'decimal'} · breaks follow each employee's meal break policy`, headers, rows, widths);
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'no-store' } });
  }
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
}
