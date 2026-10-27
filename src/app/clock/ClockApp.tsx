'use client';

import { useCallback, useEffect, useState } from 'react';
import { GeoMap } from '@/components/GeoMap';
import { etLocalToIso, isoToEtLocal } from '@/lib/timeclock';
import {
  clockBreakAdd, clockBreakDelete, clockBreakEnd, clockBreakStart, clockLogin, clockLogout, clockPunch, clockSetNote, clockShift, clockState, clockSubmit,
  type ClockData, type ShiftBreak, type ShiftData, type ShiftRow,
} from './actions';

const APPROVER = 'Marcela Perez';

function hm(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
function breakMin(bs: ShiftBreak[], now: number): number {
  return bs.reduce((s, b) => s + Math.max(0, ((b.end ? new Date(b.end).getTime() : now) - new Date(b.start).getTime()) / 60000), 0);
}
const STATUS: Record<string, { text: string; cls: string }> = {
  open: { text: 'Not sent', cls: 'bg-paper text-ink-soft' },
  submitted: { text: 'Waiting for approval', cls: 'bg-amber-100 text-amber-800' },
  approved: { text: 'Approved', cls: 'bg-green-100 text-green-800' },
};

// Full-screen "Submit time for approval", like the Workyard screen: review the shift, fix breaks, add a note, send.
function SubmitPanel({ shift, onClose, onDone, onReload }: { shift: ShiftRow; onClose: () => void; onDone: () => void; onReload: () => Promise<void> }) {
  const breaks = shift.breaks;
  const [note, setNote] = useState(shift.notes ?? '');
  const [bs, setBs] = useState('');
  const [be, setBe] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const day = isoToEtLocal(shift.clock_in).slice(0, 10);
  const total = ((new Date(shift.clock_out ?? shift.clock_in).getTime() - new Date(shift.clock_in).getTime()) / 60000) - breakMin(breaks, Date.now());
  const row = 'flex items-center justify-between border-b border-line bg-white px-4 py-3 text-sm';

  async function add() {
    setError('');
    const a = etLocalToIso(`${day}T${bs}`);
    const b = etLocalToIso(`${day}T${be}`);
    if (!a || !b) return setError('Enter the break start and end times.');
    setBusy(true);
    const res = await clockBreakAdd(shift.id, a, b);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not add the break.');
    await onReload();
    setBs('');
    setBe('');
  }
  async function del(b: ShiftBreak) {
    setBusy(true);
    const res = await clockBreakDelete(b.id);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not remove the break.');
    await onReload();
  }
  async function send() {
    setBusy(true);
    setError('');
    const res = await clockSubmit(shift.id, note);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not send.');
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <button onClick={onClose} className="text-2xl leading-none text-navy" aria-label="Close">×</button>
          <p className="text-base font-bold text-navy">Submit time for approval</p>
          <span className="w-6" />
        </div>
        <div className="bg-navy py-8 text-center text-5xl font-bold text-white">{hm(total)}</div>
        <div className={row}><b>Location</b><span className="text-navy">{shift.location_name ?? '—'}</span></div>
        <div className={row}><b>Time approver</b><span className="text-navy">{APPROVER}</span></div>
        <div className={row}><b>Start</b><span className="text-navy">{fmtDay(shift.clock_in)} {fmtTime(shift.clock_in)}</span></div>
        <div className={row}><b>Finish</b><span className="text-navy">{shift.clock_out ? `${fmtDay(shift.clock_out)} ${fmtTime(shift.clock_out)}` : '—'}</span></div>
        <p className="bg-paper px-4 pb-1 pt-4 text-xs font-bold tracking-wide text-navy">BREAKS</p>
        {breaks.length === 0 && <div className={`${row} text-ink-soft`}>No breaks</div>}
        {breaks.map((b) => (
          <div key={b.id} className={row}>
            <span className="text-navy">{fmtTime(b.start)} to {b.end ? fmtTime(b.end) : '…'}</span>
            <button disabled={busy} onClick={() => del(b)} className="text-xs font-semibold text-red-600">Remove</button>
          </div>
        ))}
        <div className="border-b border-line bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-accent">+ ADD BREAK</p>
          <div className="flex items-center gap-2">
            <input type="time" value={bs} onChange={(e) => setBs(e.target.value)} className="w-full rounded-lg border border-line px-2 py-2 text-sm" />
            <span className="text-xs text-ink-soft">to</span>
            <input type="time" value={be} onChange={(e) => setBe(e.target.value)} className="w-full rounded-lg border border-line px-2 py-2 text-sm" />
            <button disabled={busy} onClick={add} className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent">Add</button>
          </div>
        </div>
        <div className="border-b border-line bg-white px-4 py-3">
          <label className="mb-1 block text-xs font-bold text-navy">Notes (share work progress)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
        <p className="px-4 pt-3 text-xs text-ink-soft">If your start or finish time is wrong, tell the office. They can correct it.</p>
        {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="p-4">
          <button disabled={busy} onClick={send} className="w-full rounded-lg bg-[#00D4BE] px-4 py-3 text-base font-extrabold tracking-wide text-black disabled:opacity-60">
            {busy ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );
}


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
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [locError, setLocError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<'clock' | 'time'>('clock');
  const [submitId, setSubmitId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const loadShift = useCallback(async () => {
    const sh = await clockShift();
    setShift(sh);
    if (sh.open) setNote((n) => n || sh.open?.notes || '');
  }, []);

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
    if (!d.error) await loadShift();
    setLocating(false);
  }, [loadShift]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
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
      else if (action === 'in') setNote('');
      await refresh();
      if (res.ok && action === 'out') {
        const sh = await clockShift();
        const last = (sh.recent ?? []).find((r) => r.clock_out && r.status === 'open');
        if (last) setSubmitId(last.id);
      }
    } catch {
      setMessage('Could not read your location. Allow location access and try again.');
    }
    setBusy(false);
  }

  async function toggleBreak(onBreak: boolean) {
    setBusy(true);
    setMessage('');
    const res = onBreak ? await clockBreakEnd() : await clockBreakStart();
    if (!res.ok) setMessage(res.error ?? 'Something went wrong.');
    await loadShift();
    setBusy(false);
  }

  async function removeBreak(id: number) {
    const res = await clockBreakDelete(id);
    if (!res.ok) setMessage(res.error ?? 'Could not remove the break.');
    await loadShift();
  }

  async function saveNote(punchId: number) {
    const res = await clockSetNote(punchId, note);
    setNoteSaved(res.ok);
    setTimeout(() => setNoteSaved(false), 2000);
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
  const ready = shift !== null && !shift.error; // false until the time clock v2 SQL has been run
  const shiftOpen = ready ? shift.open ?? null : null;
  const onBreak = Boolean(shiftOpen?.breaks.some((b) => !b.end));
  const canIn = !open && near && (near.inside || near.rule === 'flag');
  const disabled = busy || locating || (open ? false : !canIn);
  const recent: ShiftRow[] = ready ? shift.recent ?? [] : [];
  const toSubmit = recent.filter((r) => r.clock_out && r.status === 'open');
  const submitShift = recent.find((r) => r.id === submitId) ?? null;
  const netNow = shiftOpen ? (now - new Date(shiftOpen.since).getTime()) / 60000 - breakMin(shiftOpen.breaks, now) : 0;
  const weekMin = (shift?.week_min ?? 0);

  const nav = (k: 'clock' | 'time', label: string) => (
    <button onClick={() => setTab(k)} className={`flex-1 rounded-xl px-3 py-3 text-sm font-semibold ${tab === k ? 'bg-navy text-white' : 'text-ink-soft'}`}>
      {label}
      {k === 'time' && toSubmit.length > 0 ? <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white">{toSubmit.length}</span> : null}
    </button>
  );

  return (
    <div className="pb-24">
      <Header onLogout={logout} />

      {submitShift && (
        <SubmitPanel
          key={submitShift.id + '-' + submitShift.breaks.length}
          shift={submitShift}
          onClose={() => setSubmitId(null)}
          onDone={async () => {
            setSubmitId(null);
            await loadShift();
          }}
          onReload={loadShift}
        />
      )}

      {tab === 'clock' && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-navy">Hi, {data.name?.split(' ')[0]}</h1>
            <span className={`rounded-md px-3 py-1 text-xs font-bold ${open ? (onBreak ? 'bg-orange-100 text-orange-700' : 'bg-green-600 text-white') : 'bg-paper text-ink-soft'}`}>
              {open ? (onBreak ? 'ON BREAK' : 'CLOCKED IN') : 'CLOCKED OUT'}
            </span>
          </div>

          {near && (
            <div className="mb-3">
              <GeoMap lat={near.lat} lng={near.lng} radiusFt={near.radius_ft} user={pos ? { lat: pos.lat, lng: pos.lng } : null} height={open ? 160 : 190} />
            </div>
          )}

          {locError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{locError}</p>}
          {!locError && near && (
            <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${near.inside ? 'bg-success-tint text-success' : 'bg-red-50 text-red-700'}`}>
              {near.inside
                ? `✓ You are at ${near.name} (${near.distance_ft.toLocaleString()} ft from the center)`
                : open
                  ? `You are ${near.distance_ft.toLocaleString()} ft from ${near.name}, outside the work area. The office will see this.`
                  : near.rule === 'block'
                    ? `✕ You are ${near.distance_ft.toLocaleString()} ft from ${near.name}. Move within ${near.radius_ft.toLocaleString()} ft to clock in.`
                    : `You are ${near.distance_ft.toLocaleString()} ft from ${near.name}, outside the work area. This will be flagged for review.`}
            </p>
          )}
          {!locError && !near && !locating && (data.assigned ?? 0) === 0 && (
            <p className="mb-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-deep">No work location is assigned to you yet. Ask the office.</p>
          )}
          {message && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
          {shift?.error === 'notready' && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Breaks and notes are not turned on yet. The office needs to finish the update.</p>}

          {open ? (
            <>
              <div className="mb-3 flex gap-2">
                <div className="flex flex-1 items-center justify-center rounded-xl border border-line bg-white px-3 text-lg font-bold text-navy">
                  {ready ? hm(netNow) : elapsed(open.since, now)}
                </div>
                {ready && (
                  <button disabled={busy} onClick={() => toggleBreak(onBreak)} className={`flex-1 rounded-xl px-3 py-4 text-base font-bold text-white disabled:opacity-60 ${onBreak ? 'bg-green-600' : 'bg-orange-500'}`}>
                    {onBreak ? 'END BREAK' : 'BREAK'}
                  </button>
                )}
                <button disabled={disabled} onClick={() => punch('out')} className="flex-1 rounded-xl bg-red-600 px-3 py-4 text-base font-bold text-white disabled:opacity-60">
                  {busy ? '…' : 'FINISH'}
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-line bg-white">
                <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
                  <b className="text-navy">Start time</b>
                  <span className="text-navy">{fmtTime(open.since)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <b className="text-navy">Location</b>
                  <span className="text-navy">{open.location}</span>
                </div>
              </div>

              {ready && shiftOpen && (
                <>
                  <div className="mb-3 rounded-xl border border-line bg-white">
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <b className="text-navy">Break time</b>
                      <span className="font-semibold text-navy">{hm(breakMin(shiftOpen.breaks, now))}</span>
                    </div>
                    {shiftOpen.breaks.map((b) => (
                      <div key={b.id} className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
                        <span className="text-navy">{fmtTime(b.start)} to {b.end ? fmtTime(b.end) : 'now'}</span>
                        {b.end && <button onClick={() => removeBreak(b.id)} className="text-xs font-semibold text-red-600">Remove</button>}
                      </div>
                    ))}
                  </div>
                  <div className="mb-3 rounded-xl border border-line bg-white px-4 py-3">
                    <label className="mb-1 block text-sm font-bold text-navy">Notes</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => saveNote(shiftOpen.id)}
                      rows={3}
                      placeholder="Share work progress"
                      className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    />
                    {noteSaved && <p className="mt-1 text-xs font-semibold text-success">Saved ✓</p>}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-line bg-white py-5 text-center">
                <p className="text-xs font-medium text-ink-soft">{shift?.week_label ?? 'This week'}</p>
                <p className="text-4xl font-bold text-navy">{hm(weekMin)}</p>
              </div>
              <button
                disabled={disabled}
                onClick={() => punch('in')}
                className="w-full rounded-xl bg-success px-4 py-4 text-lg font-bold text-white disabled:bg-[#C9C6BE]"
              >
                {busy ? 'Checking your location…' : 'Start work'}
              </button>
              {toSubmit.length > 0 && (
                <button onClick={() => setSubmitId(toSubmit[0].id)} className="mt-3 w-full rounded-xl border border-accent bg-accent-tint px-4 py-3 text-sm font-bold text-accent-deep">
                  {toSubmit.length} shift{toSubmit.length === 1 ? '' : 's'} to send for approval
                </button>
              )}
            </>
          )}

          <button onClick={refresh} disabled={locating || busy} className="mt-3 w-full text-center text-sm font-semibold text-accent underline disabled:opacity-50">
            {locating ? 'Finding your location…' : 'Refresh my location'}
          </button>
        </>
      )}

      {tab === 'time' && (
        <>
          <div className="mb-4 rounded-xl border border-line bg-white py-4 text-center">
            <p className="text-xs font-medium text-ink-soft">{shift?.week_label ?? 'This week'} · regular</p>
            <p className="text-3xl font-bold text-navy">{hm(weekMin)}</p>
          </div>
          {recent.length === 0 && <p className="text-sm text-ink-soft">No shifts yet.</p>}
          <div className="space-y-2">
            {recent.map((r) => {
              const st = STATUS[r.status] ?? STATUS.open;
              return (
                <div key={r.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy">{fmtDay(r.clock_in)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.text}</span>
                  </div>
                  <p className="text-ink">{fmtTime(r.clock_in)} to {r.clock_out ? fmtTime(r.clock_out) : 'now'} · <b>{r.net_min != null ? hm(r.net_min) : 'working'}</b></p>
                  <p className="text-xs text-ink-soft">{r.location_name}{r.break_min > 0 ? ` · break ${hm(r.break_min)}` : ''}</p>
                  {r.notes && <p className="mt-1 text-xs text-ink-soft">“{r.notes}”</p>}
                  {r.clock_out && r.status === 'open' && (
                    <button onClick={() => setSubmitId(r.id)} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">Review and send</button>
                  )}
                </div>
              );
            })}
          </div>
          {!ready && (data.recent ?? []).length > 0 && (
            <div className="space-y-2">
              {(data.recent ?? []).map((r) => (
                <div key={r.clock_in} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-navy">{fmtDay(r.clock_in)}</span> · {fmtTime(r.clock_in)} to {r.clock_out ? fmtTime(r.clock_out) : 'now'}
                  <div className="text-xs text-ink-soft">{r.location_name}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 py-2">
        <div className="mx-auto flex max-w-md gap-2">
          {nav('clock', 'Clock')}
          {nav('time', 'Time sheet')}
        </div>
      </div>
    </div>
  );
}
