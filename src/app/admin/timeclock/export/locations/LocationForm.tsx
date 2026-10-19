'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GeoMap } from '@/components/GeoMap';
import { saveLocation } from '../actions';

type Initial = {
  id?: number;
  name: string;
  type: 'Office' | 'Job site';
  projectId: string;
  address: string;
  lat: number;
  lng: number;
  radiusFt: number;
  rule: 'block' | 'flag';
  active: boolean;
  employeeIds: number[];
};

// Boca Raton, used only as the starting view for a new location
const START = { lat: 26.3683, lng: -80.1289 };

export function LocationForm({
  projects,
  employees,
  initial,
}: {
  projects: { id: string; name: string }[];
  employees: { id: number; name: string }[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<'Office' | 'Job site'>(initial?.type ?? 'Job site');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(initial?.lat ?? START.lat);
  const [lng, setLng] = useState(initial?.lng ?? START.lng);
  const [pinSet, setPinSet] = useState(Boolean(initial));
  const [radius, setRadius] = useState(initial?.radiusFt ?? 300);
  const [rule, setRule] = useState<'block' | 'flag'>(initial?.rule ?? 'block');
  const [active, setActive] = useState(initial?.active ?? true);
  const [emps, setEmps] = useState<number[]>(initial?.employeeIds ?? []);

  const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-medium text-ink-soft';

  const moveTo = (la: number, ln: number) => {
    setLat(la);
    setLng(ln);
    setPinSet(true);
    setNote('');
  };

  async function searchAddress() {
    if (!address.trim()) return;
    setSearching(true);
    setNote('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address.trim())}`
      );
      const list = (await res.json()) as { lat: string; lon: string }[];
      if (list.length === 0) setNote('Address not found. Try adding the city and state, or click the map to place the pin.');
      else moveTo(parseFloat(list[0].lat), parseFloat(list[0].lon));
    } catch {
      setNote('The address search is not available right now. Click the map to place the pin.');
    }
    setSearching(false);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setNote('This browser cannot share its location.');
    navigator.geolocation.getCurrentPosition(
      (p) => moveTo(p.coords.latitude, p.coords.longitude),
      () => setNote('Could not read your location. Allow location access, or search the address instead.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function submit() {
    setError('');
    start(async () => {
      const res = await saveLocation({
        id: initial?.id,
        name,
        type,
        projectId,
        address,
        lat: pinSet ? lat : NaN,
        lng: pinSet ? lng : NaN,
        radiusFt: radius,
        rule,
        active,
        employeeIds: emps,
      });
      if (res.ok) router.push('/admin/timeclock/locations');
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-card border border-line bg-white p-6">
      <p className="mb-4 text-lg font-medium text-navy">{initial?.id ? 'Edit location' : 'New location'}</p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3">
            <label className={label}>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="TRM Office or the project name" />
          </div>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'Office' | 'Job site')} className={input}>
                <option>Job site</option>
                <option>Office</option>
              </select>
            </div>
            {type === 'Job site' && (
              <div>
                <label className={label}>Portal project *</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
                  <option value="">Choose a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mb-2">
            <label className={label}>Address</label>
            <div className="flex gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchAddress();
                  }
                }}
                className={input}
                placeholder="Street, city, state"
              />
              <button type="button" onClick={searchAddress} disabled={searching} className="rounded-lg border border-accent px-3 text-sm font-semibold text-accent disabled:opacity-50">
                {searching ? '…' : 'Find'}
              </button>
            </div>
          </div>
          <button type="button" onClick={useMyLocation} className="mb-1 text-xs font-semibold text-accent underline">
            Use my current location
          </button>
          {note && <p className="mb-2 text-xs text-accent-deep">{note}</p>}
          <p className="mb-3 text-xs text-ink-soft">Tip: click the map or drag the blue pin to place it exactly.</p>

          <div className="mb-3">
            <label className={label}>
              Distance allowed from the pin: <b>{radius.toLocaleString()} ft</b>
            </label>
            <input type="range" min={50} max={1500} step={25} value={Math.min(radius, 1500)} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" />
            <p className="text-xs text-ink-soft">Phones are accurate to about 30 to 100 feet, so avoid going under 100 to 150 feet.</p>
          </div>

          <div className="mb-3">
            <label className={label}>If someone is outside the circle</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['block', 'Block the punch', 'They cannot clock in.'],
                  ['flag', 'Allow, but flag it', 'You review it on the time sheet.'],
                ] as const
              ).map(([v, t, d]) => (
                <label key={v} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-xs ${rule === v ? 'border-accent bg-accent-tint' : 'border-line bg-white'}`}>
                  <input type="radio" name="rule" checked={rule === v} onChange={() => setRule(v)} />
                  <span>
                    <b className="text-ink">{t}</b>
                    <br />
                    {d}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="mb-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
        </div>

        <div>
          <GeoMap lat={lat} lng={lng} radiusFt={radius} editable onMove={moveTo} height={300} />
          {!pinSet && <p className="mt-1 text-xs text-accent-deep">Search the address or click the map to place the pin.</p>}
          <div className="mt-4">
            <label className={label}>Who can clock in here</label>
            {employees.length === 0 ? (
              <p className="text-xs text-ink-soft">No employees yet. Add them on the Employees tab, then come back and tick them here.</p>
            ) : (
              employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={emps.includes(e.id)}
                    onChange={(ev) => setEmps((prev) => (ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id)))}
                  />
                  {e.name}
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={submit} disabled={pending} className="mt-5 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Saving…' : 'Save location'}
      </button>
    </div>
  );
}
