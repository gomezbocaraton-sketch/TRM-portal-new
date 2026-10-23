export const TZ = 'America/New_York';

export type TimeLocation = {
  id: number;
  name: string;
  type: 'Office' | 'Job site';
  project_id: number | string | null;
  address: string | null;
  lat: number;
  lng: number;
  radius_ft: number;
  rule: 'block' | 'flag';
  active: boolean;
};

export function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

export function fmtDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}

export function hoursBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}

export function fmtHours(h: number | null): string {
  if (h == null) return '';
  return h.toFixed(2) + ' h';
}

function etOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return (asUtc - d.getTime()) / 60000;
}

// "2026-10-19T07:30" typed in Eastern time -> a UTC ISO string
export function etLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = etOffsetMinutes(new Date(guess));
  let t = guess - off * 60000;
  const off2 = etOffsetMinutes(new Date(t));
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t).toISOString();
}

// A UTC ISO string -> "2026-10-19T07:30" in Eastern time (for datetime-local inputs)
export function isoToEtLocal(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

function etTodayYmd(): { y: number; m: number; d: number; dow: number } {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return { y, m, d, dow };
}

function ymdStr(t: number): string {
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export type RangeKey = 'week' | 'last' | 'month';

export function rangeBounds(range: RangeKey): { start: string; end: string; label: string } {
  const { y, m, d, dow } = etTodayYmd();
  const today = Date.UTC(y, m - 1, d);
  const mondayOffset = (dow + 6) % 7;
  let startMs: number;
  let endMs: number;
  let label: string;
  if (range === 'month') {
    startMs = Date.UTC(y, m - 1, 1);
    endMs = Date.UTC(y, m, 1);
    label = 'This month';
  } else if (range === 'last') {
    startMs = today - (mondayOffset + 7) * 86400000;
    endMs = today - mondayOffset * 86400000;
    label = 'Last week';
  } else {
    startMs = today - mondayOffset * 86400000;
    endMs = startMs + 7 * 86400000;
    label = 'This week';
  }
  return {
    start: etLocalToIso(`${ymdStr(startMs)}T00:00`) as string,
    end: etLocalToIso(`${ymdStr(endMs)}T00:00`) as string,
    label,
  };
}

export function asRange(v: string | undefined): RangeKey {
  return v === 'last' || v === 'month' ? v : 'week';
}
