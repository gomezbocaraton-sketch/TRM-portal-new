import { createClient } from '@/lib/supabase/server';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR_VERSION = '75';

export type QboConnection = {
  realm_id: string;
  environment: string;
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

export function qboEnvironment(): 'sandbox' | 'production' {
  return process.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

export function qboRedirectUri(): string {
  return process.env.QBO_REDIRECT_URI || 'https://trm-portal-new.vercel.app/api/qbo/callback';
}

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function basicAuth(): string {
  const raw = `${process.env.QBO_CLIENT_ID ?? ''}:${process.env.QBO_CLIENT_SECRET ?? ''}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function apiBase(env: string): string {
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID ?? '',
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: qboRedirectUri(),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`QuickBooks sign-in failed (${res.status}).`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: qboRedirectUri(),
    })
  );
}

async function saveTokens(realmId: string, tokens: TokenResponse): Promise<void> {
  const supabase = await createClient();
  const now = Date.now();
  const accessExp = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExp = tokens.x_refresh_token_expires_in
    ? new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null;
  const { error } = await supabase.rpc('qbo_save_connection', {
    p_realm: realmId,
    p_env: qboEnvironment(),
    p_access: tokens.access_token,
    p_access_exp: accessExp,
    p_refresh: tokens.refresh_token,
    p_refresh_exp: refreshExp,
  });
  if (error) throw new Error('Could not save the QuickBooks connection.');
}

export async function storeNewConnection(realmId: string, tokens: TokenResponse): Promise<void> {
  await saveTokens(realmId, tokens);
}

export async function getConnection(): Promise<QboConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('qbo_get_connection');
  if (error || !data) return null;
  return data as QboConnection;
}

async function freshAccessToken(conn: QboConnection): Promise<string> {
  const expiresSoon = new Date(conn.access_expires_at).getTime() - Date.now() < 120_000;
  if (!expiresSoon) return conn.access_token;
  const tokens = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token })
  );
  await saveTokens(conn.realm_id, tokens);
  return tokens.access_token;
}

export async function qboRequest<T>(
  conn: QboConnection,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown; contentType?: string }
): Promise<T> {
  const token = await freshAccessToken(conn);
  const sep = path.includes('?') ? '&' : '?';
  const url = `${apiBase(conn.environment)}/v3/company/${conn.realm_id}${path}${sep}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.contentType
        ? { 'Content-Type': init.contentType }
        : init?.body
          ? { 'Content-Type': 'application/json' }
          : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { Fault?: { Error?: { Message?: string; Detail?: string }[] } };
      const first = body.Fault?.Error?.[0];
      detail = first ? ` ${first.Message ?? ''} ${first.Detail ?? ''}`.trim() : '';
    } catch {
      // no readable error body
    }
    throw new Error(`QuickBooks returned an error (${res.status}). ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export async function qboQuery<T>(conn: QboConnection, sql: string): Promise<T> {
  return qboRequest<T>(conn, `/query?query=${encodeURIComponent(sql)}`);
}

export async function revokeAndClear(conn: QboConnection | null): Promise<void> {
  if (conn) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: conn.refresh_token }),
        cache: 'no-store',
      });
    } catch {
      // Even if Intuit cannot be reached, we still remove our copy of the keys.
    }
  }
  const supabase = await createClient();
  await supabase.rpc('qbo_clear_connection');
}
