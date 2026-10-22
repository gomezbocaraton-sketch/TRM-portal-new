import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getConnection } from '@/lib/qbo';
import { getCustomer, listCustomers, type QboCustomer } from '@/lib/qbo-invoices';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import {
  createAndLinkCustomer,
  linkCustomer,
  resendInvoice,
  sendInvoiceFromSchedule,
  syncProjectInvoices,
  unlinkCustomer,
} from './actions';

type Row = Record<string, unknown>;
const money = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: unknown) =>
  s ? new Date(String(s).length <= 10 ? `${String(s)}T12:00:00` : String(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

export default async function InvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();
  const conn = await getConnection();

  if (!conn) {
    return (
      <div className="rounded-card border border-line bg-white p-6 text-sm">
        <p className="mb-3 text-ink-soft">QuickBooks is not connected yet.</p>
        <Link href="/admin/quickbooks" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Go to QuickBooks
        </Link>
      </div>
    );
  }

  const [{ data: link }, { data: schedule }, { data: invoices }] = await Promise.all([
    supabase.from('project_qbo_link').select('*').eq('project_id', String(projectId)).maybeSingle(),
    supabase.from('payment_schedule').select('*').eq('project_id', projectId).order('due_date'),
    supabase.from('schedule_qbo').select('*').eq('project_id', String(projectId)),
  ]);

  const byId = new Map(((invoices ?? []) as Row[]).map((r) => [String(r.schedule_id), r]));

  let customers: QboCustomer[] = [];
  let customer: QboCustomer | null = null;
  let loadError: string | null = null;
  try {
    if (link) customer = await getCustomer(conn, String(link.customer_id));
    else customers = await listCustomers(conn);
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Could not reach QuickBooks.';
  }

  const linkAction = linkCustomer.bind(null, projectId);
  const createLinkAction = createAndLinkCustomer.bind(null, projectId);
  const unlinkAction = unlinkCustomer.bind(null, projectId);
  const syncAction = syncProjectInvoices.bind(null, projectId);

  return (
    <div className="space-y-6">
      <p className="text-xs text-ink-soft">
        {conn.environment === 'production' ? 'Live QuickBooks company' : 'Sandbox (test data), nothing here touches your real books'}
      </p>
      {loadError && <p className="rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-deep">{loadError}</p>}

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-navy">QuickBooks customer for this project</p>
        {link ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium text-ink">{String(link.customer_name)}</span>
              {customer?.Email && <span className="ml-2 text-ink-soft">{customer.Email}</span>}
            </span>
            <FormWithFeedback action={unlinkAction} submitLabel="Unlink" pendingLabel="Working…">
              <span className="text-xs text-ink-soft">Only possible before any invoice is created.</span>
            </FormWithFeedback>
          </div>
        ) : (
          <div className="space-y-4">
            <FormWithFeedback action={linkAction} submitLabel="Link customer">
              <select name="customerId" defaultValue="" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <option value="">Choose a customer from QuickBooks...</option>
                {customers.map((c) => (
                  <option key={c.Id} value={c.Id}>{c.DisplayName}</option>
                ))}
              </select>
            </FormWithFeedback>
            <FormWithFeedback action={createLinkAction} submitLabel="Create this client in QuickBooks" pendingLabel="Creating…">
              <span className="text-xs text-ink-soft">Or create a new QuickBooks customer from this project&apos;s client name.</span>
            </FormWithFeedback>
          </div>
        )}
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-navy">Invoices</p>
          {link && (
            <FormWithFeedback action={syncAction} submitLabel="Sync from QuickBooks" pendingLabel="Syncing…">
              <span />
            </FormWithFeedback>
          )}
        </div>
        <p className="mb-4 text-xs text-ink-soft">
          One row per scheduled payment. An invoice stays Open until QuickBooks shows the payment. After a sync, paid amounts are added to Total received.
        </p>

        <div className="space-y-3">
          {((schedule ?? []) as Row[]).map((s) => {
            const sid = String(s.id);
            const inv = byId.get(sid);
            const balance = inv ? Number(inv.balance) : null;
            const paid = inv != null && balance === 0;
            const sendAction = sendInvoiceFromSchedule.bind(null, projectId, sid);
            const resendAction = resendInvoice.bind(null, projectId, sid);
            return (
              <div key={sid} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy">{String(s.description)}</p>
                    <p className="text-xs text-ink-soft">
                      {money(Number(s.amount))} &middot; due {day(s.due_date)}
                      {inv && <> &middot; invoice {String(inv.doc_number ?? '')}</>}
                      {inv?.sent_at ? <> &middot; emailed {day(inv.sent_at)}</> : null}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                      paid ? 'bg-success-tint text-success' : inv ? 'bg-paper text-navy' : 'bg-accent-tint text-accent-deep'
                    }`}
                  >
                    {paid ? 'Paid' : inv ? `Open, ${money(balance ?? 0)} due` : 'Not invoiced'}
                  </span>
                </div>

                {!inv && link && (
                  <FormWithFeedback action={sendAction} submitLabel="Create invoice" pendingLabel="Creating…" className="mt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="email"
                        name="email"
                        defaultValue={customer?.Email ?? ''}
                        placeholder="Client email"
                        className="min-w-[220px] flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                      />
                      <label className="flex items-center gap-2 text-xs text-ink-soft">
                        <input type="checkbox" name="sendEmail" defaultChecked /> Email it from QuickBooks
                      </label>
                    </div>
                  </FormWithFeedback>
                )}
                {!inv && !link && <p className="mt-2 text-xs text-ink-soft">Link a QuickBooks customer above to invoice this payment.</p>}

                {inv && !paid && (
                  <FormWithFeedback action={resendAction} submitLabel="Resend email" pendingLabel="Sending…" className="mt-3">
                    <input
                      type="email"
                      name="email"
                      defaultValue={String(inv.sent_to ?? customer?.Email ?? '')}
                      placeholder="Client email"
                      className="w-full max-w-sm rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                    />
                  </FormWithFeedback>
                )}
              </div>
            );
          })}
          {(schedule ?? []).length === 0 && (
            <p className="text-sm text-ink-soft">No scheduled payments yet. Add them on the Financials tab.</p>
          )}
        </div>
      </div>
    </div>
  );
}
