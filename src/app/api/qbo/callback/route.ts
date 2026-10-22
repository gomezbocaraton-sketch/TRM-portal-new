import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCode, storeNewConnection } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

function back(request: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/admin/quickbooks?${query}`, request.url));
  res.cookies.delete('qbo_state');
  return res;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return back(request, 'error=declined');

  const code = params.get('code');
  const realmId = params.get('realmId');
  const state = params.get('state');
  const saved = request.cookies.get('qbo_state')?.value;
  if (!code || !realmId || !state || !saved || state !== saved) {
    return back(request, 'error=state');
  }

  try {
    const tokens = await exchangeCode(code);
    await storeNewConnection(realmId, tokens);
  } catch {
    return back(request, 'error=exchange');
  }
  return back(request, 'connected=1');
}
