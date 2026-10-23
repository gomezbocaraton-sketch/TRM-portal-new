import type { SupabaseClient } from '@supabase/supabase-js';
import type { QboConnection } from '@/lib/qbo';
import { getInvoice, latestPaymentDates } from '@/lib/qbo-invoices';

// Reads every QuickBooks invoice created from this project and records money received in the portal.
// Used by the "Sync" button (signed-in user) and by the automatic daily sync (service key).
export async function syncProject(
  supabase: SupabaseClient,
  conn: QboConnection,
  projectId: number
): Promise<'ok' | 'no-link'> {
  const { data: link } = await supabase.from('project_qbo_link').select('*').eq('project_id', String(projectId)).maybeSingle();
  if (!link) return 'no-link';
  const { data: rows } = await supabase.from('schedule_qbo').select('*').eq('project_id', String(projectId));
  if (!rows || rows.length === 0) return 'ok';

  const paidDates = await latestPaymentDates(conn, String(link.customer_id));
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const inv = await getInvoice(conn, String(row.qbo_invoice_id));
    const received = Math.round((Number(inv.TotalAmt) - Number(inv.Balance)) * 100) / 100;
    let paymentId: string | null = row.payment_id ? String(row.payment_id) : null;
    const payDate = paidDates.get(String(row.qbo_invoice_id)) ?? today;

    if (paymentId) {
      await supabase.from('payments').update({ amount: received, payment_date: payDate }).eq('id', paymentId);
    } else if (received > 0) {
      const { data: inserted, error } = await supabase
        .from('payments')
        .insert({
          project_id: projectId,
          amount: received,
          payment_date: payDate,
          method: 'QuickBooks',
          reference: inv.DocNumber ?? '',
          notes: 'Synced from QuickBooks invoice',
          source: 'manual',
        })
        .select('id')
        .single();
      if (error) throw new Error(`Could not record the payment for invoice ${inv.DocNumber ?? inv.Id}: ${error.message}`);
      paymentId = String(inserted.id);
    }

    if (Number(inv.Balance) === 0) {
      await supabase.from('payment_schedule').update({ status: 'paid' }).eq('id', String(row.schedule_id));
    }

    await supabase
      .from('schedule_qbo')
      .update({
        total: inv.TotalAmt,
        balance: inv.Balance,
        doc_number: inv.DocNumber ?? row.doc_number,
        payment_id: paymentId,
        last_synced: new Date().toISOString(),
      })
      .eq('schedule_id', String(row.schedule_id));
  }
  return 'ok';
}
