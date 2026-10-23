import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { buildAuthUrl, qboConfigured } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!qboConfigured()) {
    return NextResponse.redirect(new URL('/admin/quickbooks?error=missing_keys', request.url));
  }
  const state = randomBytes(24).toString('hex');
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set('qbo_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
