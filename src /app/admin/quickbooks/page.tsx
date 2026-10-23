import Link from 'next/link';
import { getConnection, qboConfigured, qboEnvironment, qboQuery, qboRequest } from '@/lib/qbo';
import { disconnectQuickBooks } from './actions';

type CompanyInfoResponse = { CompanyInfo?: { CompanyName?: string; LegalName?: string } };
type CountResponse = { QueryResponse?: { totalCount?: number } };

const ERRORS: Record<string, string> = {
  missing_keys: 'The QuickBooks keys are not set in Vercel yet (QBO_CLIENT_ID and QBO_CLIENT_SECRET).',
  declined: 'QuickBooks was not approved, so nothing was connected.',
  state: 'The sign-in could not be verified. Please press Connect again.',
  exchange: 'QuickBooks did not accept the sign-in. Check that the keys in Vercel match the Intuit app, then try again.',
};

function fmt(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
}

export default async function QuickBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const conn = await getConnection();
  const configured = qboConfigured();

  let company: string | null = null;
  let customerCount: number | null = null;
  let liveError: string | null = null;
  if (conn) {
    try {
      const info = await qboRequest<CompanyInfoResponse>(conn, `/companyinfo/${conn.realm_id}`);
      company = info.CompanyInfo?.CompanyName ?? info.CompanyInfo?.LegalName ?? null;
      const count = await qboQuery<CountResponse>(conn, 'select count(*) from Customer');
      customerCount = count.QueryResponse?.totalCount ?? 0;
    } catch (e) {
      liveError = e instanceof Error ? e.message : 'Could not reach QuickBooks.';
    }
  }

  const envLabel = (conn?.environment ?? qboEnvironment()) === 'production' ? 'Live company' : 'Sandbox (test data)';

  return (
    <div>
      <h1 className="mb-1 text-xl font-medium text-navy sm:text-2xl">QuickBooks</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Connect the portal to QuickBooks Online once. Invoices, payments and project costs will use this connection.
      </p>

      {connected && (
        <div className="mb-4 rounded-card border border-success bg-success-tint px-4 py-3 text-sm text-success">
          Connected to QuickBooks.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-card border border-accent bg-accent-tint px-4 py-3 text-sm text-accent-deep">
          {ERRORS[error] ?? 'Something went wrong while connecting.'}
        </div>
      )}

      <div className="rounded-card border border-line bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-navy">Connection</h2>
          {conn ? (
            <span className="rounded-full bg-success-tint px-3 py-0.5 text-xs font-bold text-success">Connected</span>
          ) : (
            <span className="rounded-full bg-paper px-3 py-0.5 text-xs font-bold text-ink-soft">Not connected</span>
          )}
          <span className="rounded-full bg-accent-tint px-3 py-0.5 text-xs font-bold text-accent-deep">{envLabel}</span>
        </div>

        {conn ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-[180px_1fr]">
              <span className="text-ink-soft">Company</span>
              <span className="font-medium text-ink">{company ?? '-'}</span>
              <span className="text-ink-soft">Customers found</span>
              <span className="font-medium text-ink">{customerCount ?? '-'}</span>
              <span className="text-ink-soft">Connected</span>
              <span className="text-ink">{fmt(conn.updated_at)}</span>
              <span className="text-ink-soft">Needs re-approval after</span>
              <span className="text-ink">{fmt(conn.refresh_expires_at)}</span>
            </div>
            {liveError && (
              <p className="rounded-lg bg-accent-tint px-3 py-2 text-accent-deep">{liveError} Try again, or disconnect and connect again.</p>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/admin/quickbooks" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-navy hover:border-accent">
                Test connection
              </Link>
              <form action={disconnectQuickBooks}>
                <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent">
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {!configured && (
              <p className="rounded-lg bg-accent-tint px-3 py-2 text-accent-deep">
                The QuickBooks keys are missing in Vercel. Add QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_ENVIRONMENT, then redeploy.
              </p>
            )}
            <p className="text-ink-soft">
              A QuickBooks administrator will be asked to approve the connection. The portal only gets access to accounting data, never to bank logins.
            </p>
            <a
              href="/api/qbo/connect"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Connect to QuickBooks
            </a>
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Need help with the QuickBooks connection? Email{' '}
        <a href="mailto:gomezbocaraton@gmail.com" className="underline">
          gomezbocaraton@gmail.com
        </a>
        . See also the{' '}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>{' '}
        and{' '}
        <a href="/terms" className="underline">
          Terms of Use
        </a>
        .
      </p>
    </div>
  );
}
