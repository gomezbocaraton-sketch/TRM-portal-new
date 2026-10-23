'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveEmployee, setEmployeeActive } from '../actions';

export type EmployeeRow = {
  id: number;
  name: string;
  phone: string;
  email: string;
  active: boolean;
  locations: string[];
};

type Invite = { name: string; phone: string; email: string; password: string };

function fmtPhone(p: string): string {
  return p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p;
}

function buildMessage(lang: 'en' | 'es', inv: Invite, origin: string): string {
  const first = inv.name.split(' ')[0];
  const link = `${origin}/clock`;
  if (lang === 'es') {
    return [
      `Hola ${first}, ya puedes marcar tu entrada y salida de AQOR by TRM desde tu celular.`,
      '',
      `1. Abre: ${link}`,
      `2. Teléfono: ${fmtPhone(inv.phone)}`,
      `3. Contraseña: ${inv.password || '(te la da la oficina)'}`,
      '',
      'Permite el acceso a la ubicación cuando te lo pida. Consejo: guarda la página en la pantalla de inicio de tu celular.',
    ].join('\n');
  }
  return [
    `Hi ${first}, you can now clock in and out for AQOR by TRM from your phone.`,
    '',
    `1. Open: ${link}`,
    `2. Phone: ${fmtPhone(inv.phone)}`,
    `3. Password: ${inv.password || '(the office will give it to you)'}`,
    '',
    'Allow location access when it asks. Tip: save the page to your phone home screen.',
  ].join('\n');
}

function InvitePanel({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [password, setPassword] = useState(invite.password);
  const message = buildMessage(lang, { ...invite, password }, origin);
  const enc = encodeURIComponent(message);
  const [copied, setCopied] = useState(false);

  const btn = 'rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-white';
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy">Invitation for {invite.name}</p>
        <div className="flex gap-2 text-xs">
          {(['en', 'es'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-full border px-3 py-1 font-medium ${lang === l ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink-soft'}`}
            >
              {l === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>
      </div>
      <label className="mb-2 block text-xs text-ink-soft">
        Password to include in the message (the portal cannot show it later)
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-64"
          placeholder="Leave empty to not include it"
        />
      </label>
      <pre className="mb-3 whitespace-pre-wrap rounded-lg border border-line bg-white p-3 text-xs text-ink">{message}</pre>
      <div className="flex flex-wrap gap-2">
        <a className={btn} href={`sms:+1${invite.phone}?&body=${enc}`}>
          Text message
        </a>
        <a className={btn} href={`https://wa.me/1${invite.phone}?text=${enc}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        {invite.email && (
          <a className={btn} href={`mailto:${invite.email}?subject=${encodeURIComponent('AQOR by TRM time clock')}&body=${enc}`}>
            Email
          </a>
        )}
        <button
          type="button"
          className={btn}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button type="button" onClick={onClose} className="px-2 text-sm text-ink-soft underline">
          Done
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Text message and WhatsApp open on your phone or computer with the message ready. You tap Send.
      </p>
    </div>
  );
}

function EmployeeForm({
  initial,
  onDone,
}: {
  initial?: EmployeeRow;
  onDone: (invite: Invite | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
  const label = 'mb-1 block text-xs font-medium text-ink-soft';

  const submit = () => {
    setError('');
    start(async () => {
      const res = await saveEmployee({ id: initial?.id, name, phone, email, password });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone({ name, phone: phone.replace(/\D/g, '').slice(-10), email, password });
    });
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Full name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Cell phone (this is their login) *</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={input} placeholder="(561) 555-1234" />
        </div>
        <div>
          <label className={label}>{initial ? 'New password (leave empty to keep the current one)' : 'Password you choose *'}</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="At least 6 characters" />
        </div>
        <div>
          <label className={label}>Email (optional, only for sending the invitation)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={input} />
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Save and prepare invitation'}
        </button>
        <button type="button" onClick={() => onDone(null)} className="text-sm text-ink-soft underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EmployeeManager({ employees }: { employees: EmployeeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [invite, setInvite] = useState<{ forId: number | 'new'; data: Invite } | null>(null);
  const [error, setError] = useState('');

  const toggle = (e: EmployeeRow) => {
    setError('');
    start(async () => {
      const res = await setEmployeeActive(e.id, !e.active);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Employees sign in at <b>/clock</b> with their cell phone number and the password you set.
        </p>
        <button onClick={() => setAdding(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Add employee
        </button>
      </div>

      {adding && (
        <div className="mb-4">
          <EmployeeForm
            onDone={(inv) => {
              setAdding(false);
              if (inv) setInvite({ forId: 'new', data: inv });
            }}
          />
        </div>
      )}
      {invite?.forId === 'new' && <div className="mb-4"><InvitePanel invite={invite.data} onClose={() => setInvite(null)} /></div>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {employees.length === 0 && !adding ? (
        <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-soft">
          No employees yet. Click Add employee, then send them the invitation.
        </p>
      ) : (
        <div className="space-y-3">
          {employees.map((e) => (
            <div key={e.id} className="rounded-card border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-navy">{e.name}</p>
                  <p className="text-xs text-ink-soft">
                    {fmtPhone(e.phone)}
                    {e.locations.length > 0 ? ` · ${e.locations.join(', ')}` : ' · No locations yet (tick them on the Locations tab)'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${e.active ? 'bg-success-tint text-success' : 'bg-paper text-ink-soft'}`}>
                  {e.active ? 'Active' : 'Deactivated'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
                <button className="text-accent underline" onClick={() => setInvite({ forId: e.id, data: { name: e.name, phone: e.phone, email: e.email, password: '' } })}>
                  Send invitation
                </button>
                <button className="text-accent underline" onClick={() => setEditId(editId === e.id ? null : e.id)}>
                  {editId === e.id ? 'Close' : 'Edit / new password'}
                </button>
                <button disabled={pending} className="text-ink-soft underline" onClick={() => toggle(e)}>
                  {e.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
              {editId === e.id && (
                <div className="mt-3">
                  <EmployeeForm
                    initial={e}
                    onDone={(inv) => {
                      setEditId(null);
                      if (inv && inv.password) setInvite({ forId: e.id, data: inv });
                    }}
                  />
                </div>
              )}
              {invite?.forId === e.id && <InvitePanel invite={invite.data} onClose={() => setInvite(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
