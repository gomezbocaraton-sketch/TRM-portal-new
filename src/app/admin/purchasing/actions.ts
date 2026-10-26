'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getPurchasingContext, PURCHASE_DOC_CATEGORIES } from '@/lib/purchasing';
import { sendApprovalRequest } from '@/lib/purchasing-email';

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
