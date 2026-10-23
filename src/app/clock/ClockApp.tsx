'use client';

import { useCallback, useEffect, useState } from 'react';
import { GeoMap } from '@/components/GeoMap';
import { clockLogin, clockLogout, clockPunch, clockState, type ClockData } from './actions';

type Pos = { lat: number; lng: number; acc: number };

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
function elapsed(since: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

function getPosition(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? 'denied' : 'failed')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function Header({ onLogout }: { onLogout?: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <img src="/trm-logo-full.png" alt="AQOR by TRM" className="h-7 w-auto" />
      {onLogout && (
        <button onClick={onLogout} className="text-xs font-medium text-ink-soft underline decoration-dotted">
          Log out
        </button>
      )}
    </div>
  );
}

function LoginForm({ onDone, notice }: { onDone: () => void; notice?: string }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = 'w-full rounded-lg border border-line bg-white px-3 py-3 text-base';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await clockLogin(phone, password);
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error ?? 'Could not sign in.');
  }

  return (
    <div>
      <Header />
      <form onSubmit={submit} className="rounded-card border border-line bg-white p-5">
        <h1 className="mb-1 text-lg font-semibold text-navy">Time clock</h1>
        <p className="mb-4 text-sm text-ink-soft">Sign in with your cell phone number and password.</p>
        {notice && <p className="mb-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-deep">{notice}</p>}
        <label className="mb-1 block text-xs font-medium text-ink-soft">Cell phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" className={`${input} mb-3`} placeholder="(561) 555-1234" />
        <label className="mb-1 block text-xs font-medium text-ink-soft">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className={`${input} mb-4`} />
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export function ClockApp() {
  const [data, setData] = useState<ClockData | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [locError, setLocError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLocating(true);
    setLocError('');
    let p: Pos | null = null;
    try {
      p = await getPosition();
      setPos(p);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'failed';
      setLocError(
        code === 'denied'
          ? 'Location is turned off for this page. Turn it on in your phone settings (Privacy, Location Services), allow it for your browser, then tap Refresh.'
          : 'Could not find your location. Go near a window or outside, then tap Refresh.'
      );
    }
    const d = await clockState(p?.lat ?? null, p?.lng ?? null, p?.acc ?? null);
    setData(d);
    setLocating(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function punch(action: 'in' | 'out') {
    setBusy(true);
    setMessage('');
    try {
      const p = await getPosition();
      setPos(p);
      const res = await clockPunch(action, p.lat, p.lng, p.acc);
      if (!res.ok) setMessage(res.error ?? 'Something went wrong.');
      await refresh();
    } catch {
      setMessage('Could not read your location. Allow location access and try again.');
    }
    setBusy(false);
  }

  async function logout() {
    await clockLogout();
    setData({ error: 'invalid' });
  }

  if (data === null) {
    return (
      <div>
        <Header />
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }
  if (data.error === 'invalid') return <LoginForm onDone={refresh} />;
  if (data.error) {
    return (
      <div>
        <Header />
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{data.error}</p>
        <button onClick={refresh} className="mt-3 text-sm font-semibold text-accent underline">Try again</button>
      </div>
    );
  }

  const near = data.nearest ?? null;
  const open = data.open ?? null;
  const canIn = !open && near && (near.inside || near.rule === 'flag');
  const disabled = busy || locating || (open ? false : !canIn);

  return (
    <div>
      <Header onLogout={logout} />
      <h1 className="mb-1 text-xl font-semibold text-navy">Hi, {data.name?.split(' ')[0]}</h1>
      <p className="mb-4 text-sm text-ink-soft">
        {open ? (
          <>
            Clocked in since <b>{fmtTime(open.since)}</b> at {open.location} ({elapsed(open.since, now)})
          </>
        ) : (
          'You are not clocked in.'
        )}
      </p>

      {near && (
        <div className="mb-3">
          <GeoMap lat={near.lat} lng={near.lng} radiusFt={near.radius_ft} user={pos ? { lat: pos.lat, lng: pos.lng } : null} height={190} />
        </div>
      )}

      {locError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{locError}</p>}
      {!locError && near && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${near.inside ? 'bg-success-tint text-success' : 'bg-red-50 text-red-700'}`}>
          {near.inside
            ? `✓ You are at ${near.name} (${near.distance_ft.toLocaleString()} ft from the center)`
            : near.rule === 'block' && !open
              ? `✕ You are ${near.distance_ft.toLocaleString()} ft from ${near.name}. Move within ${near.radius_ft.toLocaleString()} ft to clock in.`
              : `You are ${near.distance_ft.toLocaleString()} ft from ${near.name}, outside the work area. This will be flagged for review.`}
        </p>
      )}
      {!locError && !near && !locating && (data.assigned ?? 0) === 0 && (
        <p className="mb-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-deep">No work location is assigned to you yet. Ask the office.</p>
      )}
      {message && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

      <button
        disabled={disabled}
        onClick={() => punch(open ? 'out' : 'in')}
        className={`w-full rounded-xl px-4 py-4 text-lg font-bold text-white disabled:bg-[#C9C6BE] ${open ? 'bg-red-600' : 'bg-success'}`}
      >
        {busy ? 'Checking your location…' : open ? 'Clock out' : 'Clock in'}
      </button>
      <button onClick={refresh} disabled={locating || busy} className="mt-3 w-full text-center text-sm font-semibold text-accent underline disabled:opacity-50">
        {locating ? 'Finding your location…' : 'Refresh my location'}
      </button>

      {(data.recent ?? []).length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-navy">Last 7 days</p>
          <div className="space-y-2">
            {(data.recent ?? []).map((r) => (
              <div key={r.clock_in} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <span className="font-medium text-navy">{fmtDay(r.clock_in)}</span> · {fmtTime(r.clock_in)} to {r.clock_out ? fmtTime(r.clock_out) : 'now'}
                <div className="text-xs text-ink-soft">{r.location_name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
