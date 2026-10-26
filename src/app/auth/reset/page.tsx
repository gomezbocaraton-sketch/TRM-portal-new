'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Stage = 'checking' | 'ready' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  // The emailed link brings the user here with a one-time key in the address (after the #).
  const [supabase] = useState(() =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  );

  useEffect(() => {
    async function start() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (!access || !refresh) {
        const expired = params.get('error_code') === 'otp_expired';
        setProblem(
          expired
            ? 'This reset link has expired or was already used. Ask for a new one and open it right away.'
            : 'This reset link is not valid. Ask for a new one.'
        );
        setStage('invalid');
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
      if (sessionError) {
        setProblem('This reset link has expired or was already used. Ask for a new one and open it right away.');
        setStage('invalid');
        return;
      }
      window.history.replaceState(null, '', window.location.pathname);
      setStage('ready');
    }
    void start();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    setStage('done');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-white p-8 text-center">
        <img src="/trm-logo-full.png" alt="TRM Partners" className="mx-auto mb-4 h-auto w-full max-w-[280px]" />
        <p className="mb-6 text-sm text-ink-soft">Set a new password</p>

        {stage === 'checking' && <p className="text-sm text-ink-soft">One moment…</p>}

        {stage === 'invalid' && (
          <div className="space-y-4">
            <p className="text-sm text-red-600">{problem}</p>
            <a href="/login" className="inline-block text-sm font-semibold text-accent underline">
              Back to sign in
            </a>
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-4">
            <p className="text-sm text-ink">Your password was changed. You can sign in now.</p>
            <a href="/login" className="block w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white">
              Go to sign in
            </a>
          </div>
        )}

        {stage === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Type it again</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
