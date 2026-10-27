'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getPurchasingContext, PURCHASE_DOC_CATEGORIES } from '@/lib/purchasing';
import { sendApprovalRequest } from '@/lib/purchasing-email';
import { buildPoPdf } from '@/lib/po-pdf';
import { loadPoPdfData } from '@/lib/po-data';
import { getConnection } from '@/lib/qbo';
import { createBill, ensureVendor, pickExpenseAccount } from '@/lib/qbo-bills';

type ItemInput = { description: string; quantity: string; unit: string; unitPrice: string };

export type CreatePurchaseInput = {
  projectId: string;
  vendor: string;
  notes: string;
  items: ItemInput[];
  filePath: string;
  fileCategory: string;
};

export type CreateResult = { ok: true; id: number } | { ok: false; error: string };

function num(s: string): number {
  return parseFloat(String(s).replace(/[$,]/g, ''));
}

function refresh(id?: number) {
  revalidatePath('/admin/purchasing');
  if (id) revalidatePath(`/admin/purchasing/${id}`);
}

export async function createPurchase(input: CreatePurchaseInput): Promise<CreateResult> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);

    const vendor = input.vendor.trim();
    if (!vendor) return { ok: false, error: 'Enter the vendor.' };

    const items = input.items
      .filter((i) => i.description.trim() !== '')
      .map((i) => ({
        description: i.description.trim(),
        quantity: num(i.quantity),
        unit: i.unit.trim() || null,
        unit_price: num(i.unitPrice),
      }));
    if (items.length === 0) return { ok: false, error: 'Add at least one item.' };
    for (const it of items) {
      if (!(it.quantity > 0)) return { ok: false, error: `Enter a quantity for "${it.description}".` };
      if (!(it.unit_price >= 0)) return { ok: false, error: `Enter a price for "${it.description}".` };
    }

    const total = Math.round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;
    const auto = total <= ctx.threshold;
    const now = new Date().toISOString();

    const { data: created, error } = await supabase
      .from('purchases')
      .insert({
        project_id: input.projectId || null,
        vendor,
        notes: input.notes.trim() || null,
        total,
        status: auto ? 'approved' : 'pending',
        created_by: ctx.userId,
        created_by_name: ctx.name,
        decided_at: auto ? now : null,
        decision_note: auto ? 'Auto-approved: order is $1,000.00 or less, no approval needed' : null,
      })
      .select('id')
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? 'Could not save the order.' };
    const id = Number(created.id);

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(items.map((i) => ({ ...i, purchase_id: id })));
    if (itemsError) {
      await supabase.from('purchases').delete().eq('id', id);
      return { ok: false, error: itemsError.message };
    }

    if (input.filePath) {
      const category = PURCHASE_DOC_CATEGORIES.includes(input.fileCategory) ? input.fileCategory : 'Quote';
      await supabase.from('purchase_files').insert({
        purchase_id: id,
        file_name: input.filePath.split('/').pop() ?? input.filePath,
        storage_key: input.filePath,
        category,
      });
    }

    await supabase.from('purchase_events').insert([
      { purchase_id: id, event: 'Order entered', who: ctx.name },
      ...(auto ? [{ purchase_id: id, event: 'Auto-approved (under the approval amount)', who: 'System' }] : []),
    ]);

    if (!auto) {
      await sendApprovalRequest({
        to: ctx.approverEmail,
        purchaseId: id,
        vendor,
        total,
        createdBy: ctx.name,
      });
    }

    refresh(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function decidePurchase(
  id: number,
  decision: 'approved' | 'rejected',
  note: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    if (!ctx.isApprover) return { ok: false, error: 'Only the approver can approve or reject purchases.' };
    if (decision === 'rejected' && !note.trim()) return { ok: false, error: 'Please give a reason for rejecting.' };

    const { data, error } = await supabase
      .from('purchases')
      .update({
        status: decision,
        decided_by_name: ctx.name,
        decided_at: new Date().toISOString(),
        decision_note: note.trim() || null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: 'This order was already decided.' };

    await supabase.from('purchase_events').insert({
      purchase_id: id,
      event: decision === 'approved' ? 'Approved' : 'Rejected',
      who: ctx.name,
      note: note.trim() || null,
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// Removes an order that is still waiting for approval (for example, entered by mistake).
export async function cancelPurchase(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: files } = await supabase.from('purchase_files').select('storage_key').eq('purchase_id', id);
    const { data, error } = await supabase.from('purchases').delete().eq('id', id).eq('status', 'pending').select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: 'Only orders waiting for approval can be cancelled.' };
    const keys = (files ?? []).map((f: { storage_key: string }) => f.storage_key);
    if (keys.length) await supabase.storage.from('project-files').remove(keys);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function addPurchaseDocument(purchaseId: number, formData: FormData) {
  const supabase = await createClient();
  const ctx = await getPurchasingContext(supabase);
  const path = String(formData.get('file') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  if (!path) throw new Error('Please choose a file.');
  if (!PURCHASE_DOC_CATEGORIES.includes(category)) throw new Error('Choose what kind of document this is.');

  const { error } = await supabase.from('purchase_files').insert({
    purchase_id: purchaseId,
    file_name: path.split('/').pop() ?? path,
    storage_key: path,
    category,
  });
  if (error) throw new Error(error.message);
  await supabase
    .from('purchase_events')
    .insert({ purchase_id: purchaseId, event: `Document added (${category})`, who: ctx.name });
  refresh(purchaseId);
}

export async function deletePurchaseDocument(purchaseId: number, fileId: number | string) {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('purchase_files')
    .select('storage_key')
    .eq('id', fileId)
    .eq('purchase_id', purchaseId)
    .single();
  const { error } = await supabase.from('purchase_files').delete().eq('id', fileId).eq('purchase_id', purchaseId);
  if (error) throw new Error(error.message);
  if (file?.storage_key) await supabase.storage.from('project-files').remove([file.storage_key]);
  refresh(purchaseId);
}

type Result = { error?: string };
const money2 = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const poLabel = (id: number | string) => 'PO-' + String(id).padStart(4, '0');

function notReady(msg: string, cols: string[]): string | null {
  return cols.some((c) => msg.includes(c)) ? 'The database is not ready for this yet. Run the purchase order SQL (po_procore) in Supabase first.' : null;
}

// Books one invoice to QuickBooks as a bill from the vendor, tied to the project's QuickBooks customer.
// Returns the problem as text (and saves it on the invoice) instead of failing, so recording an invoice never depends on QuickBooks.
async function sendBillToQbo(invoiceId: number): Promise<string | null> {
  const supabase = await createClient();
  const { data: inv } = await supabase.from('purchase_invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv) return 'Invoice not found.';
  const { data: p } = await supabase.from('purchases').select('*').eq('id', inv.purchase_id).maybeSingle();
  if (!p) return 'Order not found.';
  const fail = async (msg: string) => {
    await supabase.from('purchase_invoices').update({ qbo_error: msg }).eq('id', invoiceId);
    return msg;
  };
  try {
    if (inv.qbo_bill_id) return null;
    if (!(Number(inv.amount) > 0)) return await fail('There is no invoice amount to send.');
    const vendor = String(p.vendor ?? '').trim();
    if (!vendor || vendor === 'Vendor to be chosen') return await fail('Set the real vendor name on the order before sending it to QuickBooks.');
    const conn = await getConnection();
    if (!conn) return await fail('QuickBooks is not connected. Connect it on the QuickBooks page, then click Send to QuickBooks.');
    const vendorId = await ensureVendor(conn, vendor);
    const accountId = await pickExpenseAccount(conn);
    let customerId: string | null = null;
    if (p.project_id != null) {
      const { data: link } = await supabase.from('project_qbo_link').select('customer_id').eq('project_id', String(p.project_id)).maybeSingle();
      customerId = link?.customer_id ? String(link.customer_id) : null;
    }
    const po = poLabel(p.id);
    const billId = await createBill(conn, {
      vendorId,
      accountId,
      txnDate: String(inv.invoice_date ?? new Date().toISOString().slice(0, 10)),
      docNumber: String(inv.invoice_number || `${po}-${inv.id}`),
      amount: Number(inv.amount),
      description: `${po} materials purchase`,
      customerId,
      note: `Created from ${po} in the TRM portal`,
    });
    await supabase.from('purchase_invoices').update({ qbo_bill_id: billId, qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', invoiceId);
    await supabase.from('purchase_events').insert({
      purchase_id: p.id,
      event: 'Bill sent to QuickBooks',
      who: 'System',
      note: customerId ? `Bill ${billId} for ${money2(Number(inv.amount))}, linked to the project's customer` : `Bill ${billId} (this project is not linked to a QuickBooks customer yet)`,
    });
    return null;
  } catch (e) {
    return await fail(e instanceof Error ? e.message : 'QuickBooks did not accept the bill.');
  }
}

// Records a vendor invoice against an approved order. An order can have several (partial billing).
// Each invoice becomes a project cost on the Profitability tab and, if ticked, a QuickBooks bill.
export async function recordInvoice(purchaseId: number, formData: FormData): Promise<Result> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    const { data: p } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
    if (!p) return { error: 'Order not found.' };
    if (p.status !== 'approved') return { error: 'Only an approved order can be invoiced.' };
    if (p.closed_at) return { error: 'This order is closed.' };

    const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim();
    const invoiceDate = String(formData.get('invoiceDate') ?? '').trim() || new Date().toISOString().slice(0, 10);
    const amount = num(String(formData.get('invoiceAmount') ?? ''));
    const category = String(formData.get('category') ?? '').trim() || 'Materials';
    const milestone = String(formData.get('milestone') ?? '').trim();
    const filePath = String(formData.get('file') ?? '').trim();
    const sendQbo = formData.get('sendQbo') === 'on';
    if (!(amount > 0)) return { error: 'Enter the invoice amount.' };

    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .insert({
        purchase_id: purchaseId,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate,
        amount,
        category,
        milestone_id: milestone && milestone !== 'general' ? milestone : null,
        file_name: filePath ? filePath.split('/').pop() ?? filePath : null,
        storage_key: filePath || null,
        created_by_name: ctx.name,
      })
      .select('id')
      .single();
    if (invErr || !inv) return { error: notReady(invErr?.message ?? '', ['purchase_invoices']) ?? invErr?.message ?? 'Could not save the invoice.' };

    let costId: string | null = null;
    if (p.project_id != null) {
      const { data: cost, error: costErr } = await supabase
        .from('project_costs')
        .insert({
          project_id: p.project_id,
          category,
          vendor: p.vendor,
          amount,
          cost_date: invoiceDate,
          milestone_id: milestone && milestone !== 'general' ? milestone : null,
          doc_type: filePath ? 'Invoice' : null,
          description: `${poLabel(p.id)}${invoiceNumber ? ` · invoice ${invoiceNumber}` : ''}`,
          file_name: filePath ? filePath.split('/').pop() ?? filePath : null,
          storage_key: filePath || null,
        })
        .select('id')
        .single();
      if (costErr) {
        await supabase.from('purchase_invoices').delete().eq('id', inv.id);
        return { error: `The cost could not be added to Profitability: ${costErr.message}` };
      }
      costId = String(cost.id);
      await supabase.from('purchase_invoices').update({ cost_id: costId }).eq('id', inv.id);
    }

    if (filePath) {
      await supabase.from('purchase_files').insert({ purchase_id: purchaseId, file_name: filePath.split('/').pop() ?? filePath, storage_key: filePath, category: 'Invoice' });
    }

    const { data: all } = await supabase.from('purchase_invoices').select('amount').eq('purchase_id', purchaseId);
    const billed = ((all ?? []) as { amount: number | string }[]).reduce((s, r) => s + Number(r.amount), 0);
    await supabase.from('purchase_events').insert({
      purchase_id: purchaseId,
      event: 'Invoice recorded',
      who: ctx.name,
      note: `${invoiceNumber ? `#${invoiceNumber} ` : ''}${money2(amount)}. Invoiced so far ${money2(billed)} of ${money2(Number(p.total))}${costId ? '. Added to Profitability' : ''}`,
    });

    if (sendQbo) await sendBillToQbo(Number(inv.id));

    refresh(purchaseId);
    if (p.project_id != null) revalidatePath(`/admin/projects/${p.project_id}/profitability`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// Closes the order: bought and invoiced. At least one invoice is needed. Every item on it turns to Purchased.
export async function closeOrder(purchaseId: number): Promise<Result> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    const { data: p } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
    if (!p) return { error: 'Order not found.' };
    if (p.status !== 'approved') return { error: 'Only an approved order can be closed.' };
    if (p.closed_at) return { error: 'This order is already closed.' };
    const { data: invs, error: invErr } = await supabase.from('purchase_invoices').select('amount').eq('purchase_id', purchaseId);
    if (invErr) return { error: notReady(invErr.message, ['purchase_invoices']) ?? invErr.message };
    const billed = ((invs ?? []) as { amount: number | string }[]).reduce((s, r) => s + Number(r.amount), 0);
    if ((invs ?? []).length === 0) return { error: 'Record at least one invoice before closing the order.' };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('purchases')
      .update({ closed_at: now, closed_by_name: ctx.name, invoice_amount: billed })
      .eq('id', purchaseId)
      .is('closed_at', null);
    if (error) return { error: notReady(error.message, ['closed_at', 'invoice_']) ?? error.message };

    await supabase.from('buy_items').update({ purchased_at: now }).eq('purchase_id', purchaseId).is('purchased_at', null);
    const total = Number(p.total);
    const diff = Math.round((billed - total) * 100) / 100;
    await supabase.from('purchase_events').insert({
      purchase_id: purchaseId,
      event: 'Closed: items bought and invoiced',
      who: ctx.name,
      note: `Invoiced ${money2(billed)} against ${money2(total)}${diff === 0 ? ': no difference' : `: ${diff > 0 ? 'over' : 'under'} by ${money2(Math.abs(diff))}`}`,
    });
    refresh(purchaseId);
    if (p.project_id != null) {
      revalidatePath(`/admin/projects/${p.project_id}/profitability`);
      revalidatePath(`/admin/projects/${p.project_id}/purchasing`);
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// Records what arrived. Partly received orders show as Partially received; when every line is in, Received.
export async function receiveItems(purchaseId: number, lines: { id: number; qty: number }[]): Promise<Result> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    const { data: p } = await supabase.from('purchases').select('status, closed_at, project_id').eq('id', purchaseId).maybeSingle();
    if (!p) return { error: 'Order not found.' };
    if (p.status !== 'approved') return { error: 'The order must be approved before items can be received.' };
    if (p.closed_at) return { error: 'This order is closed.' };

    const { data: rows, error } = await supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('id');
    if (error) return { error: notReady(error.message, ['received_qty']) ?? error.message };
    const items = (rows ?? []) as { id: number; description: string; quantity: number | string; received_qty: number | string | null }[];
    const now = new Date().toISOString();
    const got: string[] = [];
    const fullNow: string[] = [];
    for (const l of lines) {
      const it = items.find((x) => Number(x.id) === Number(l.id));
      if (!it || !(l.qty > 0)) continue;
      const before = Number(it.received_qty ?? 0);
      const after = Math.min(Number(it.quantity), Math.round((before + l.qty) * 100) / 100);
      if (after === before) continue;
      const { error: upErr } = await supabase.from('purchase_items').update({ received_qty: after, received_at: now }).eq('id', it.id);
      if (upErr) return { error: upErr.message };
      it.received_qty = after;
      got.push(`${it.description} (${after} of ${Number(it.quantity)})`);
      if (after >= Number(it.quantity)) fullNow.push(it.description);
    }
    if (got.length === 0) return { error: 'Enter how many arrived for at least one item.' };

    const allIn = items.every((i) => Number(i.received_qty ?? 0) >= Number(i.quantity));
    const anyIn = items.some((i) => Number(i.received_qty ?? 0) > 0);
    await supabase.from('purchases').update({ receipt_status: allIn ? 'received' : anyIn ? 'partial' : 'none' }).eq('id', purchaseId);

    // A fully received line turns its buy-plan item to Purchased.
    for (const name of fullNow) {
      await supabase.from('buy_items').update({ purchased_at: now }).eq('purchase_id', purchaseId).ilike('name', name).is('purchased_at', null);
    }
    await supabase.from('purchase_events').insert({ purchase_id: purchaseId, event: allIn ? 'All items received' : 'Items received', who: ctx.name, note: got.join('; ') });
    refresh(purchaseId);
    if (p.project_id != null) revalidatePath(`/admin/projects/${p.project_id}/purchasing`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// Emails the PO as a PDF to the vendor (after approval). Needs RESEND_API_KEY and PURCHASING_FROM in Vercel.
export async function sendPoToVendor(purchaseId: number, formData: FormData): Promise<Result> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    const to = String(formData.get('to') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: 'Enter the vendor email address.' };
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.PURCHASING_FROM;
    if (!apiKey || !from) return { error: 'Email is not connected yet. It needs RESEND_API_KEY and PURCHASING_FROM added in Vercel. You can download the PDF and email it yourself.' };

    const loaded = await loadPoPdfData(supabase, purchaseId);
    if (!loaded) return { error: 'Order not found.' };
    const p = loaded.purchase;
    if (p.status !== 'approved') return { error: 'The order must be approved before it is sent to the vendor.' };
    const bytes = await buildPoPdf(loaded.data);
    const po = poLabel(p.id);
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        bcc: ctx.email ? [ctx.email] : undefined,
        reply_to: ctx.email || undefined,
        subject: `Purchase order ${po} from TRM Partners LLC`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14284B"><p>Hello,</p><p>Please find purchase order <b>${po}</b> attached${loaded.data.projectName ? ` for ${esc(loaded.data.projectName)}` : ''}. Total: <b>${money2(Number(p.total))}</b>.</p>${message ? `<p>${esc(message)}</p>` : ''}<p>Please confirm receipt and the delivery date by replying to this email.</p><p>${esc(ctx.name)}<br>TRM Partners LLC</p></div>`,
        attachments: [{ filename: `${po}.pdf`, content: Buffer.from(bytes).toString('base64') }],
      }),
    });
    if (!res.ok) {
      let why = '';
      try {
        const j = (await res.json()) as { message?: string };
        why = j.message ? ` ${j.message}` : '';
      } catch {
        // no readable body
      }
      return { error: `The email was not sent (${res.status}).${why}` };
    }
    await supabase.from('purchases').update({ sent_at: new Date().toISOString(), sent_to: to, vendor_email: to }).eq('id', purchaseId);
    await supabase.from('purchase_events').insert({ purchase_id: purchaseId, event: 'Sent to vendor', who: ctx.name, note: to });
    refresh(purchaseId);
    if (p.project_id != null) revalidatePath(`/admin/projects/${p.project_id}/purchasing`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function retryQboBill(invoiceId: number): Promise<Result> {
  try {
    const supabase = await createClient();
    const { data: inv } = await supabase.from('purchase_invoices').select('purchase_id').eq('id', invoiceId).maybeSingle();
    const err = await sendBillToQbo(invoiceId);
    if (inv) refresh(Number(inv.purchase_id));
    return err ? { error: err } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}
