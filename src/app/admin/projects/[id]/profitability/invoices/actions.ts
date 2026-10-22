'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getConnection } from '@/lib/qbo';
import {
  createCustomer,
  createInvoice,
  emailInvoice,
  ensureBillingItem,
  getCustomer,
  getInvoice,
  latestPaymentDates,
} from '@/lib/qbo-invoices';


type Outcome = { error?: string };

// Next.js hides thrown messages in production, so errors are returned as text instead.
async function guard(fn: () => Promise<void>): Promise<Outcome> {
  try {
    await fn();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

function done(projectId: number) {
  revalidatePath(`/admin/projects/${projectId}/profitability/invoices`);
  revalidatePath(`/admin/projects/${projectId}/profitability`);
  revalidatePath(`/admin/projects/${projectId}/financials`);
}

async function requireConn() {
  const conn = await getConnection();
  if (!conn) throw new Error('QuickBooks is not connected. Connect it from the QuickBooks page first.');
  return conn;
}

async function linkCustomerImpl(projectId: number, formData: FormData) {
  const customerId = String(formData.get('customerId') ?? '').trim();
  if (!customerId) throw new Error('Choose a QuickBooks customer.');
  const conn = await requireConn();
  const customer = await getCustomer(conn, customerId);
  if (!customer) throw new Error('That customer was not found in QuickBooks.');
  const supabase = await createClient();
  const { error } = await supabase
    .from('project_qbo_link')
    .upsert({ project_id: String(projectId), customer_id: customer.Id, customer_name: customer.DisplayName });
  if (error) throw new Error('Could not save the link.');
  done(projectId);
}

async function createAndLinkCustomerImpl(projectId: number, _formData: FormData) {
  const conn = await requireConn();
  const supabase = await createClient();
  const { data: project } = await supabase.from('projects').select('client_name, name').eq('id', projectId).single();
  const name = String(project?.client_name ?? '').trim();
  if (!name) throw new Error('This project has no client name.');
  const customer = await createCustomer(conn, name);
  const { error } = await supabase
    .from('project_qbo_link')
    .upsert({ project_id: String(projectId), customer_id: customer.Id, customer_name: customer.DisplayName });
  if (error) throw new Error('Created the customer in QuickBooks but could not save the link.');
  done(projectId);
}

async function unlinkCustomerImpl(projectId: number, _formData: FormData) {
  const supabase = await createClient();
  const { count } = await supabase
    .from('schedule_qbo')
    .select('schedule_id', { count: 'exact', head: true })
    .eq('project_id', String(projectId));
  if ((count ?? 0) > 0) throw new Error('Invoices were already created for this customer, so the link cannot be removed.');
  await supabase.from('project_qbo_link').delete().eq('project_id', String(projectId));
  done(projectId);
}

async function sendInvoiceFromScheduleImpl(projectId: number, scheduleId: string, formData: FormData) {
  const conn = await requireConn();
  const supabase = await createClient();

  const { data: link } = await supabase.from('project_qbo_link').select('*').eq('project_id', String(projectId)).maybeSingle();
  if (!link) throw new Error('Link this project to a QuickBooks customer first.');

  const { data: existing } = await supabase.from('schedule_qbo').select('schedule_id').eq('schedule_id', scheduleId).maybeSingle();
  if (existing) throw new Error('An invoice was already created for this payment.');

  const { data: item } = await supabase
    .from('payment_schedule')
    .select('*')
    .eq('id', scheduleId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (!item) throw new Error('That scheduled payment was not found.');

  const amount = Number(item.amount);
  if (!(amount > 0)) throw new Error('The scheduled payment needs an amount greater than 0.');

  const sendEmail = formData.get('sendEmail') === 'on';
  const email = String(formData.get('email') ?? '').trim();
  if (sendEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid client email, or untick "Email it".');

  const itemId = await ensureBillingItem(conn);
  const invoice = await createInvoice(conn, {
    customerId: String(link.customer_id),
    itemId,
    description: String(item.description ?? 'Progress payment'),
    amount,
    dueDate: item.due_date ? String(item.due_date).slice(0, 10) : null,
    email: sendEmail ? email : null,
    note: `Created from the TRM portal (project ${projectId})`,
  });

  const { error: saveError } = await supabase.from('schedule_qbo').insert({
    schedule_id: scheduleId,
    project_id: String(projectId),
    qbo_invoice_id: invoice.Id,
    doc_number: invoice.DocNumber ?? null,
    total: invoice.TotalAmt,
    balance: invoice.Balance,
    sent_to: sendEmail ? email : null,
    sent_at: null,
    last_synced: new Date().toISOString(),
  });
  if (saveError) {
    throw new Error(`Invoice ${invoice.DocNumber ?? invoice.Id} was created in QuickBooks but could not be saved here. Do not press send again; tell Claude.`);
  }

  if (sendEmail) {
    try {
      await emailInvoice(conn, invoice.Id, email);
      await supabase.from('schedule_qbo').update({ sent_at: new Date().toISOString() }).eq('schedule_id', scheduleId);
    } catch (e) {
      done(projectId);
      const why = e instanceof Error ? e.message : '';
      throw new Error(`Invoice created, but the email did not go out. Use Resend. ${why}`.trim());
    }
  }
  done(projectId);
}

async function resendInvoiceImpl(projectId: number, scheduleId: string, formData: FormData) {
  const conn = await requireConn();
  const supabase = await createClient();
  const { data: row } = await supabase.from('schedule_qbo').select('*').eq('schedule_id', scheduleId).maybeSingle();
  if (!row) throw new Error('No invoice found for this payment.');
  const email = String(formData.get('email') ?? row.sent_to ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid client email.');
  await emailInvoice(conn, String(row.qbo_invoice_id), email);
  await supabase.from('schedule_qbo').update({ sent_to: email, sent_at: new Date().toISOString() }).eq('schedule_id', scheduleId);
  done(projectId);
}

// Reads every invoice created from this project, and records money received in the portal.
async function syncProjectInvoicesImpl(projectId: number, _formData: FormData) {
  const conn = await requireConn();
  const supabase = await createClient();

  const { data: link } = await supabase.from('project_qbo_link').select('*').eq('project_id', String(projectId)).maybeSingle();
  if (!link) throw new Error('Link this project to a QuickBooks customer first.');
  const { data: rows } = await supabase.from('schedule_qbo').select('*').eq('project_id', String(projectId));
  if (!rows || rows.length === 0) {
    done(projectId);
    return;
  }

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
          source: 'quickbooks',
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
  done(projectId);
}

export async function linkCustomer(projectId: number, formData: FormData): Promise<Outcome> {
  return guard(() => linkCustomerImpl(projectId, formData));
}

export async function createAndLinkCustomer(projectId: number, _formData: FormData): Promise<Outcome> {
  return guard(() => createAndLinkCustomerImpl(projectId, _formData));
}

export async function unlinkCustomer(projectId: number, _formData: FormData): Promise<Outcome> {
  return guard(() => unlinkCustomerImpl(projectId, _formData));
}

export async function sendInvoiceFromSchedule(projectId: number, scheduleId: string, formData: FormData): Promise<Outcome> {
  return guard(() => sendInvoiceFromScheduleImpl(projectId, scheduleId, formData));
}

export async function resendInvoice(projectId: number, scheduleId: string, formData: FormData): Promise<Outcome> {
  return guard(() => resendInvoiceImpl(projectId, scheduleId, formData));
}

export async function syncProjectInvoices(projectId: number, _formData: FormData): Promise<Outcome> {
  return guard(() => syncProjectInvoicesImpl(projectId, _formData));
}
