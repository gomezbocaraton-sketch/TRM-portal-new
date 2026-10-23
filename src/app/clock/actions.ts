'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE = 'clock_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type ClockLocation = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  distance_ft: number;
  radius_ft: number;
  rule: 'block' | 'flag';
  inside: boolean;
};

export type ClockData = {
  error?: string;
  name?: string;
  assigned?: number;
  open?: { since: string; location: string } | null;
  nearest?: ClockLocation | null;
  recent?: { clock_in: string; clock_out: string | null; location_name: string }[];
};

export async function clockLogin(phone: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clock_login', { p_phone: phone, p_password: password });
  if (error) return { ok: false, error: 'Could not sign in right now. Please try again.' };
  const res = data as { ok: boolean; token?: string; error?: string };
  if (!res.ok || !res.token) return { ok: false, error: res.error ?? 'Wrong phone number or password.' };
  const jar = await cookies();
  jar.set(COOKIE, res.token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS });
  return { ok: true };
}

export async function clockLogout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const supabase = await createClient();
    await supabase.rpc('clock_logout', { p_token: token });
  }
  jar.delete(COOKIE);
}

export async function clockState(lat: number | null, lng: number | null, acc: number | null): Promise<ClockData> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return { error: 'invalid' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clock_state', { p_token: token, p_lat: lat, p_lng: lng, p_acc: acc });
  if (error) return { error: 'Could not reach the server. Please try again.' };
  return data as ClockData;
}

export async function clockPunch(
  action: 'in' | 'out',
  lat: number,
  lng: number,
  acc: number | null
): Promise<{ ok: boolean; error?: string }> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return { ok: false, error: 'Please sign in again.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clock_punch', { p_token: token, p_action: action, p_lat: lat, p_lng: lng, p_acc: acc });
  if (error) return { ok: false, error: 'Could not reach the server. Please try again.' };
  return data as { ok: boolean; error?: string };
}
