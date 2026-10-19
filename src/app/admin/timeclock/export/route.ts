import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { asRange, fmtDay, fmtTime, hoursBetween, rangeBounds } from '@/lib/timeclock';

type Row = Record<string, unknown>;

function csv(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Time sheet as a spreadsheet (CSV) that opens in Excel or Google Sheets.
export async function GET(req: Request) {
  const range = asRange(new URL(req.url).searchParams.get('range') ?? undefined);
  const { start, end } = rangeBounds(range);
  const supabase = await createClient();

  const { data } = await supabase
    .from('time_punches')
    .select('*, time_employees(full_name), time_locations(name)')
    .gte('clock_in', start)
    .lt('clock_in', end)
    .order('clock_in', { ascending: true });

  const lines = [['Date', 'Employee', 'Location', 'Clock in', 'Clock out', 'Hours', 'Outside work area'].join(',')];
  for (const r of (data ?? []) as Row[]) {
    const h = hoursBetween(String(r.clock_in), (r.clock_out as string | null) ?? null);
    lines.push(
      [
        fmtDay(String(r.clock_in)),
        (r.time_employees as Row | null)?.full_name,
        (r.time_locations as Row | null)?.name,
        fmtTime(String(r.clock_in)),
        r.clock_out ? fmtTime(String(r.clock_out)) : '',
        h != null ? h.toFixed(2) : '',
        r.in_outside || r.out_outside ? 'Yes' : '',
      ].map(csv).join(',')
    );
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="time-sheet-${range}.csv"`,
    },
  });
}
