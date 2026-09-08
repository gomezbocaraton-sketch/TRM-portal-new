import { createClient } from '@/lib/supabase/server';
import { addSubcontractor, addQuote, decideQuote, uploadInvoice, uploadLienWaiver, recordSubPayment } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

async function signedUrl(supabase: Awaited<ReturnType<typeof createClient>>, key: string | null): Promise<string | null> {
  if (!key) return null;
  const { data } = await supabase.storage.from('project-files').createSignedUrl(key, 3600);
  return data?.signedUrl ?? null;
}

function expiryStatus(dateStr: string | null): 'expired' | 'soon' | 'ok' | null {
  if (!dateStr) return null;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return 'ok';
}

function ExpiryBadge({ label, dateStr }: { label: string; dateStr: string | null }) {
  const status = expiryStatus(dateStr);
  if (!status) return null;
  const style = status === 'expired' ? 'bg-red-50 text-red-700' : status === 'soon' ? 'bg-accent-tint text-accent-deep' : 'bg-paper text-ink-soft';
  const text = status === 'expired' ? `${label} expired ${dateStr}` : `${label} expires ${dateStr}`;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{text}</span>;
}

type FlaggedItem = { contractorName: string; label: string; dateStr: string; status: 'expired' | 'soon' };

function buildFlaggedItems(subs: { name: string; insurance_expiry: string | null; license_expiry: string | null }[]): FlaggedItem[] {
  const items: FlaggedItem[] = [];
  for (const sub of subs) {
    const insStatus = expiryStatus(sub.insurance_expiry);
    if (insStatus === 'expired' || insStatus === 'soon') items.push({ contractorName: sub.name, label: 'Insurance', dateStr: sub.insurance_expiry!, status: insStatus });
    const licStatus = expiryStatus(sub.license_expiry);
    if (licStatus === 'expired' || licStatus === 'soon') items.push({ contractorName: sub.name, label: 'License', dateStr: sub.license_expiry!, status: licStatus });
  }
  return items.sort((a, b) => (a.status === b.status ? a.dateStr.localeCompare(b.dateStr) : a.status === 'expired' ? -1 : 1));
}

function ExpiryWarningBanner({ items }: { items: FlaggedItem[] }) {
  if (items.length === 0) return null;
  const hasExpired = items.some((i) => i.status === 'expired');
  return (
    <div className={`rounded-card border p-4 ${hasExpired ? 'border-red-200 bg-red-50' : 'border-accent bg-accent-tint'}`}>
      <p className={`mb-2 text-sm font-semibold ${hasExpired ? 'text-red-700' : 'text-accent-deep'}`}>{items.length} document{items.length > 1 ? 's' : ''} {hasExpired ? 'expired or ' : ''}expiring within 30 days</p>
      <div className="space-y-1">{items.map((item, i) => (<p key={i} className="text-xs text-ink"><span className="font-semibold">{item.contractorName}</span> — {item.label} {item.status === 'expired' ? 'expired' : 'expires'} {item.dateStr}</p>))}</div>
    </div>
  );
}

export default async function SubcontractorsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const [{ data: subs }, { data: quotes }, { data: subPayments }] = await Promise.all([
    supabase.from('subcontractors').select('*').eq('project_id', projectId).order('name'),
    supabase.from('subcontractor_quotes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('subcontractor_payments').select('*').eq('project_id', projectId),
  ]);

  const subsWithUrls = await Promise.all((subs ?? []).map(async (s) => ({ ...s, licenseUrl: await signedUrl(supabase, s.license_file_key), insuranceUrl: await signedUrl(supabase, s.insurance_file_key) })));
  const quotesWithUrls = await Promise.all((quotes ?? []).map(async (q) => {
    const paymentsForQuote = (subPayments ?? []).filter((p) => p.quote_id === q.id);
    const paidSoFar = paymentsForQuote.reduce((sum, p) => sum + Number(p.amount), 0);
    return { ...q, quoteUrl: await signedUrl(supabase, q.quote_file_key), invoiceUrl: await signedUrl(supabase, q.invoice_file_key), paidSoFar, balance: Number(q.amount ?? 0) - paidSoFar, payments: paymentsForQuote };
  }));

  const addSubWithId = addSubcontractor.bind(null, projectId);
  const flaggedItems = buildFlaggedItems(subsWithUrls);

  return (
    <div className="space-y-6">
      <ExpiryWarningBanner items={flaggedItems} />
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Add contractor</p>
        <FormWithFeedback action={addSubWithId} submitLabel="Add contractor">
          <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input name="name" placeholder="Company name" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="trade" placeholder="Trade" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="contactName" placeholder="Contact name" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="phone" placeholder="Phone" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="email" type="email" placeholder="Email" className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
          <div className="mb-1 grid grid-cols-1 gap-4 border-t border-line pt-3 sm:grid-cols-2">
            <input name="licenseNumber" placeholder="License number" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="date" name="licenseExpiry" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="file" name="licenseFile" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="date" name="insuranceExpiry" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="file" name="insuranceFile" className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
        </FormWithFeedback>
      </div>

      <div className="space-y-4">
        {subsWithUrls.map((sub) => {
          const subQuotes = quotesWithUrls.filter((q) => q.subcontractor_id === sub.id);
          const addQuoteWithIds = addQuote.bind(null, projectId, sub.id);
          return (
            <div key={sub.id} className="rounded-card border border-line bg-white p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-semibold text-navy">{sub.name}</p><p className="text-xs text-ink-soft">{sub.trade}{sub.contact_name ? ` · ${sub.contact_name}` : ''}{sub.phone ? ` · ${sub.phone}` : ''}</p></div>
                <div className="flex gap-3 text-xs">
                  {sub.licenseUrl && <a href={sub.licenseUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent-deep underline">License</a>}
                  {sub.insuranceUrl && <a href={sub.insuranceUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent-deep underline">Insurance</a>}
                </div>
              </div>
              {(sub.insurance_expiry || sub.license_expiry) && (
                <div className="mb-4 flex flex-wrap gap-2"><ExpiryBadge label="Insurance" dateStr={sub.insurance_expiry} /><ExpiryBadge label="License" dateStr={sub.license_expiry} /></div>
              )}
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Quotes</p>
                <div className="mb-3 space-y-3">
                  {subQuotes.length === 0 && <p className="text-xs text-ink-soft">No quotes yet.</p>}
                  {subQuotes.map((q) => {
                    const approveWithIds = decideQuote.bind(null, projectId, q.id, 'approved');
                    const rejectWithIds = decideQuote.bind(null, projectId, q.id, 'rejected');
                    const invoiceWithIds = uploadInvoice.bind(null, projectId, q.id);
                    const waiverWithIds = uploadLienWaiver.bind(null, projectId, q.id);
                    const paymentWithIds = recordSubPayment.bind(null, projectId, q.id);
                    const statusStyle = q.status === 'approved' ? 'bg-success-tint text-success' : q.status === 'rejected' ? 'bg-paper text-ink-soft' : 'bg-accent-tint text-accent-deep';
                    return (
                      <div key={q.id} className="rounded-lg border border-line p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div><p className="text-sm text-navy">{q.description || 'Quote'}</p><p className="text-xs text-ink-soft">${Number(q.amount).toLocaleString()} · Submitted {q.submitted_date}</p></div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle}`}>{q.status}</span>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {q.quoteUrl && <a href={q.quoteUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy">View quote</a>}
                          {q.status === 'pending' && (<><form action={approveWithIds}><button className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white">Approve</button></form><form action={rejectWithIds}><button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy">Reject</button></form></>)}
                          {q.status === 'approved' && !q.invoiceUrl && (<form action={invoiceWithIds} className="flex items-center gap-2"><input type="file" name="invoiceFile" required className="text-xs" /><button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy">Upload invoice</button></form>)}
                          {q.invoiceUrl && <a href={q.invoiceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy">View invoice</a>}
                          {q.invoiceUrl && !q.lien_waiver_file_key && (<form action={waiverWithIds} className="flex items-center gap-2"><input type="file" name="waiverFile" required className="text-xs" /><button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy">Upload lien waiver</button></form>)}
                          {q.lien_waiver_file_key && <span className="rounded-full bg-success-tint px-2.5 py-1 text-xs font-semibold text-success">Lien waiver on file ({q.lien_waiver_received_date})</span>}
                        </div>
                        {q.status === 'approved' && (
                          <div className="mt-3 rounded-lg bg-paper p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-navy">Payments to contractor</p>
                              <p className="text-xs font-semibold text-ink-soft">Paid ${q.paidSoFar.toLocaleString()} of ${Number(q.amount).toLocaleString()} · <span className={q.balance > 0 ? 'text-accent-deep' : 'text-success'}>Balance ${q.balance.toLocaleString()}</span></p>
                            </div>
                            {q.payments.length > 0 && (
                              <div className="mb-2 space-y-1">{q.payments.map((p: { id: number; payment_date: string; method: string; amount: number }) => (<div key={p.id} className="flex justify-between text-xs text-ink-soft"><span>{p.payment_date} · {p.method}</span><span className="font-semibold text-navy">${Number(p.amount).toLocaleString()}</span></div>))}</div>
                            )}
                            {q.balance > 0 && (
                              <FormWithFeedback action={paymentWithIds} submitLabel="Record payment" className="flex flex-wrap items-center gap-2">
                                <input type="number" name="amount" placeholder="Amount" className="w-24 rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                                <input type="date" name="paymentDate" className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                                <input name="method" placeholder="Method" className="w-28 rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                                <input name="reference" placeholder="Reference" className="w-28 rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                              </FormWithFeedback>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <FormWithFeedback action={addQuoteWithIds} submitLabel="Add quote" className="flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3">
                  <input name="description" placeholder="Description" className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                  <input type="number" name="amount" placeholder="Amount" className="w-24 rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                  <input type="date" name="submittedDate" className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs" />
                  <input type="file" name="quoteFile" className="text-xs" />
                </FormWithFeedback>
              </div>
            </div>
          );
        })}
        {subsWithUrls.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">No contractors added yet.</p>}
      </div>
    </div>
  );
}
