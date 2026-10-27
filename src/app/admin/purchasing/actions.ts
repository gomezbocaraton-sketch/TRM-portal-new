'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getPurchasingContext, PURCHASE_DOC_CATEGORIES } from '@/lib/purchasing';
import { sendApprovalRequest } from '@/lib/purchasing-email';
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

// Books the closed order to QuickBooks as a bill from the vendor, tied to the project's QuickBooks customer.
// Returns the problem as text (and saves it on the order) instead of failing, so closing the order never depends on QuickBooks.
async function sendBillToQbo(purchaseId: number): Promise<string | null> {
  const supabase = await createClient();
  const { data: p } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
  if (!p) return 'Order not found.';
  const fail = async (msg: string) => {
    await supabase.from('purchases').update({ qbo_error: msg }).eq('id', purchaseId);
    return msg;
  };
  try {
    if (p.qbo_bill_id) return null;
    if (!(Number(p.invoice_amount) > 0)) return await fail('There is no invoice amount to send.');
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
    const po = 'PO-' + String(p.id).padStart(4, '0');
    const billId = await createBill(conn, {
      vendorId,
      accountId,
      txnDate: String(p.invoice_date ?? new Date().toISOString().slice(0, 10)),
      docNumber: String(p.invoice_number || po),
      amount: Number(p.invoice_amount),
      description: `${po} materials purchase`,
      customerId,
      note: `Created from ${po} in the TRM portal`,
    });
    await supabase.from('purchases').update({ qbo_bill_id: billId, qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', purchaseId);
    await supabase.from('purchase_events').insert({
      purchase_id: purchaseId,
      event: 'Bill sent to QuickBooks',
      who: 'System',
      note: customerId ? `Bill ${billId}, linked to the project's customer` : `Bill ${billId} (this project is not linked to a QuickBooks customer yet)`,
    });
    return null;
  } catch (e) {
    return await fail(e instanceof Error ? e.message : 'QuickBooks did not accept the bill.');
  }
}

// Closes an approved order: the items were bought. Records the invoice as a project cost (Profitability) and a QuickBooks bill.
export async function closePurchase(purchaseId: number, formData: FormData): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    const { data: p } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
    if (!p) return { error: 'Order not found.' };
    if (p.status !== 'approved') return { error: 'Only an approved order can be closed.' };
    if (p.closed_at) return { error: 'This order is already closed.' };

    const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim();
    const invoiceDate = String(formData.get('invoiceDate') ?? '').trim() || new Date().toISOString().slice(0, 10);
    const amount = num(String(formData.get('invoiceAmount') ?? ''));
    const category = String(formData.get('category') ?? '').trim() || 'Materials';
    const milestone = String(formData.get('milestone') ?? '').trim();
    const filePath = String(formData.get('file') ?? '').trim();
    const sendQbo = formData.get('sendQbo') === 'on';
    if (!(amount > 0)) return { error: 'Enter the invoice amount.' };

    const now = new Date().toISOString();
    const { error: closeErr } = await supabase
      .from('purchases')
      .update({ closed_at: now, closed_by_name: ctx.name, invoice_number: invoiceNumber || null, invoice_date: invoiceDate, invoice_amount: amount })
      .eq('id', purchaseId)
      .is('closed_at', null);
    if (closeErr) {
      if (closeErr.message.includes('closed_at') || closeErr.message.includes('invoice_')) {
        return { error: 'The database is not ready for closing orders yet. Run the close-order SQL in Supabase first.' };
      }
      return { error: closeErr.message };
    }

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
          description: `PO-${String(p.id).padStart(4, '0')}${invoiceNumber ? ` · invoice ${invoiceNumber}` : ''}`,
          file_name: filePath ? filePath.split('/').pop() ?? filePath : null,
          storage_key: filePath || null,
        })
        .select('id')
        .single();
      if (costErr) {
        await supabase.from('purchases').update({ closed_at: null, invoice_number: null, invoice_date: null, invoice_amount: null }).eq('id', purchaseId);
        return { error: `The cost could not be added to Profitability: ${costErr.message}` };
      }
      costId = String(cost.id);
      await supabase.from('purchases').update({ cost_id: costId }).eq('id', purchaseId);
    }

    if (filePath) {
      await supabase.from('purchase_files').insert({
        purchase_id: purchaseId,
        file_name: filePath.split('/').pop() ?? filePath,
        storage_key: filePath,
        category: 'Invoice',
      });
    }
    await supabase.from('purchase_events').insert({
      purchase_id: purchaseId,
      event: 'Closed: items bought',
      who: ctx.name,
      note: `Invoice ${invoiceNumber || '(no number)'} for ${'$' + amount.toFixed(2)}${costId ? ', added to Profitability' : ''}`,
    });

    if (sendQbo) await sendBillToQbo(purchaseId);

    refresh(purchaseId);
    if (p.project_id != null) revalidatePath(`/admin/projects/${p.project_id}/profitability`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function retryQboBill(purchaseId: number): Promise<{ error?: string }> {
  try {
    const err = await sendBillToQbo(purchaseId);
    refresh(purchaseId);
    return err ? { error: err } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}
