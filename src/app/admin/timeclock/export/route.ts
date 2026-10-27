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

  const rowsAll = (data ?? []) as Row[];
  const brk = new Map<string, number>();
  if (rowsAll.length) {
    const { data: bk } = await supabase.from('time_breaks').select('punch_id, start_at, end_at').in('punch_id', rowsAll.map((r) => r.id as number));
    for (const b of (bk ?? []) as Row[]) {
      const m = ((b.end_at ? new Date(String(b.end_at)).getTime() : Date.now()) - new Date(String(b.start_at)).getTime()) / 60000;
      brk.set(String(b.punch_id), (brk.get(String(b.punch_id)) ?? 0) + Math.max(0, m));
    }
  }
  const lines = [['Date', 'Employee', 'Location', 'Clock in', 'Clock out', 'Break (min)', 'Hours (after breaks)', 'Status', 'Outside work area', 'Notes'].join(',')];
  for (const r of rowsAll) {
    const b = brk.get(String(r.id)) ?? 0;
    const h0 = hoursBetween(String(r.clock_in), (r.clock_out as string | null) ?? null);
    const h = h0 != null ? Math.max(0, h0 - b / 60) : null;
    lines.push(
      [
        fmtDay(String(r.clock_in)),
        (r.time_employees as Row | null)?.full_name,
        (r.time_locations as Row | null)?.name,
        fmtTime(String(r.clock_in)),
        r.clock_out ? fmtTime(String(r.clock_out)) : '',
        b > 0 ? Math.round(b) : '',
        h != null ? h.toFixed(2) : '',
        r.status === 'approved' ? 'Approved' : r.status === 'submitted' ? 'Sent' : 'Not sent',
        r.in_outside || r.out_outside ? 'Yes' : '',
        r.notes,
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
