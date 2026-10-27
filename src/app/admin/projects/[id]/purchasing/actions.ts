'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createPurchase } from '@/app/admin/purchasing/actions';
import { searchPrices, searchQueryFor } from '@/lib/price-search';
import { extractProposalLines } from '@/lib/proposal-extract';
import { MAX_PLAN_BYTES, combinePlanItems, readPlans as readPlansWithAi, type PlanItem } from '@/lib/plans-read';
import { checkAgainstProposal, summarize, type ProposalItem } from '@/lib/proposal';
import type { BuyItem } from '@/lib/buyplan';

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

function refresh() {
  revalidatePath('/admin', 'layout');
}

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const n = parseFloat(String(v ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export async function addBuyItem(formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const projectId = String(formData.get('projectId') ?? '').trim();
    const name = String(formData.get('name') ?? '').trim();
    if (!projectId) throw new Error('Choose a project.');
    if (!name) throw new Error('Enter the item.');
    const quantity = num(formData.get('quantity'), 1);
    if (!(quantity > 0)) throw new Error('Quantity must be more than 0.');
    const neededOn = String(formData.get('neededOn') ?? '').trim();
    const milestoneId = String(formData.get('milestoneId') ?? '').trim();
    if (!neededOn && !milestoneId) throw new Error('Pick the schedule step that needs this item, or type the date it must be on site.');
    const supabase = await createClient();
    const { error } = await supabase.from('buy_items').insert({
      project_id: projectId,
      name,
      quantity,
      unit: String(formData.get('unit') ?? '').trim() || null,
      unit_price: num(formData.get('unitPrice')),
      vendor: String(formData.get('vendor') ?? '').trim() || null,
      milestone_id: milestoneId || null,
      needed_on: neededOn || null,
      lead_days: Math.max(0, Math.round(num(formData.get('leadDays'), 7))),
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function deleteBuyItem(itemId: number): Promise<void> {
  const supabase = await createClient();
  const { data: it } = await supabase.from('buy_items').select('project_id').eq('id', itemId).maybeSingle();
  await supabase.from('buy_items').delete().eq('id', itemId).eq('status', 'planned');
  refresh();
  redirect(it ? `/admin/projects/${it.project_id}/purchasing` : '/admin');
}

export async function searchWebPrices(itemId: number, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const supabase = await createClient();
    const { data: item } = await supabase.from('buy_items').select('name').eq('id', itemId).maybeSingle();
    if (!item) throw new Error('Item not found.');
    const query = String(formData.get('query') ?? '').trim() || String(item.name);
    const found = await searchPrices(query);
    await supabase.from('price_quotes').delete().eq('buy_item_id', itemId).eq('source', 'web');
    const { error } = await supabase.from('price_quotes').insert(
      found.map((f) => ({
        buy_item_id: itemId,
        category: f.category,
        store: f.store,
        title: f.title,
        price: f.price,
        delivery: f.delivery,
        rating: f.rating,
        url: f.url,
        source: 'web',
      }))
    );
    if (error) throw new Error(error.message);
    refresh();
  });
}

// Finds the three web prices for one item using a cleaned-up search. The screen calls this for each item in turn.
export async function findPricesFor(itemId: number): Promise<Outcome> {
  return guard(async () => {
    const supabase = await createClient();
    const { data: item } = await supabase.from('buy_items').select('name').eq('id', itemId).maybeSingle();
    if (!item) throw new Error('Item not found.');
    const found = await searchPrices(searchQueryFor(String(item.name)));
    await supabase.from('price_quotes').delete().eq('buy_item_id', itemId).eq('source', 'web');
    const { error } = await supabase.from('price_quotes').insert(
      found.map((f) => ({
        buy_item_id: itemId,
        category: f.category,
        store: f.store,
        title: f.title,
        price: f.price,
        delivery: f.delivery,
        rating: f.rating,
        url: f.url,
        source: 'web',
      }))
    );
    if (error) throw new Error(error.message);
  });
}

export async function addManualQuote(itemId: number, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const store = String(formData.get('store') ?? '').trim();
    const price = num(formData.get('price'), NaN);
    if (!store) throw new Error('Enter the store or vendor.');
    if (!(price > 0)) throw new Error('Enter the price.');
    const category = String(formData.get('category') ?? 'other');
    const supabase = await createClient();
    const { error } = await supabase.from('price_quotes').insert({
      buy_item_id: itemId,
      category: ['lowest', 'value', 'fast'].includes(category) ? category : 'other',
      store,
      title: String(formData.get('title') ?? '').trim() || null,
      price,
      delivery: String(formData.get('delivery') ?? '').trim() || null,
      url: String(formData.get('url') ?? '').trim() || null,
      source: 'manual',
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function useQuote(itemId: number, quoteId: number, _formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const supabase = await createClient();
    const { data: q } = await supabase.from('price_quotes').select('*').eq('id', quoteId).eq('buy_item_id', itemId).maybeSingle();
    if (!q) throw new Error('That quote was not found.');
    const { error } = await supabase
      .from('buy_items')
      .update({ unit_price: q.price, vendor: q.store, quote_url: q.url })
      .eq('id', itemId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function addProposalItem(projectId: string, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const description = String(formData.get('description') ?? '').trim();
    if (!description) throw new Error('Enter the proposal line.');
    const quantity = num(formData.get('quantity'), 1);
    if (!(quantity > 0)) throw new Error('Quantity must be more than 0.');
    const supabase = await createClient();
    const { error } = await supabase.from('proposal_items').insert({
      project_id: projectId,
      description,
      quantity,
      unit: String(formData.get('unit') ?? '').trim() || null,
      unit_price: num(formData.get('unitPrice')),
      source: 'manual',
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function deleteProposalItem(proposalId: number): Promise<void> {
  const supabase = await createClient();
  await supabase.from('proposal_items').delete().eq('id', proposalId);
  refresh();
}

export async function extractProposal(projectId: string, _formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const supabase = await createClient();
    const { data: project } = await supabase.from('projects').select('estimate_file_key, contract_file_key').eq('id', projectId).maybeSingle();
    const key = String(project?.estimate_file_key || project?.contract_file_key || '');
    if (!key) throw new Error('This project has no estimate or contract file. Upload one on the project Overview tab, or type the lines in by hand.');
    if (!key.toLowerCase().endsWith('.pdf')) throw new Error('The proposal file is not a PDF. Type the lines in by hand.');
    const { data: file, error: dlError } = await supabase.storage.from('project-files').download(key);
    if (dlError || !file) throw new Error('Could not open the proposal file.');
    const lines = await extractProposalLines(await file.arrayBuffer());
    if (lines.length === 0) throw new Error('No product lines were found in that PDF.');
    await supabase.from('proposal_items').delete().eq('project_id', projectId).eq('source', 'pdf');
    const { error } = await supabase.from('proposal_items').insert(
      lines.map((l) => ({ project_id: projectId, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, source: 'pdf' }))
    );
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function linkProposal(itemId: number, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const v = String(formData.get('proposalItemId') ?? '');
    const supabase = await createClient();
    const { error } = await supabase.from('buy_items').update({ proposal_item_id: v ? Number(v) : null }).eq('id', itemId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function acceptDifference(itemId: number, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const note = String(formData.get('note') ?? '').trim();
    if (!note) throw new Error('Write a short note about why this is fine.');
    const supabase = await createClient();
    const { error } = await supabase.from('buy_items').update({ ack_note: note }).eq('id', itemId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

// Turns the chosen buy-plan items into purchase orders (one per project and vendor).
// Over the approval amount the order waits for Vanessa; at or under it is approved automatically.
export async function createPoFromItems(formData: FormData): Promise<Outcome> {
  const ids = formData.getAll('ids').map((v) => Number(v)).filter((n) => Number.isFinite(n));
  let target = '/admin';
  const result = await guard(async () => {
    if (ids.length === 0) throw new Error('Choose at least one item.');
    const supabase = await createClient();
    const { data } = await supabase.from('buy_items').select('*').in('id', ids).eq('status', 'planned');
    const items = (data ?? []) as BuyItem[];
    if (items.length === 0) throw new Error('Those items were already ordered.');
    for (const it of items) {
      if (!(Number(it.unit_price) > 0)) throw new Error(`Enter a price for "${it.name}" first (use Find prices).`);
    }

    const projectIds = Array.from(new Set(items.map((i) => i.project_id)));
    const [{ data: proposalData }, { data: allData }] = await Promise.all([
      supabase.from('proposal_items').select('*').in('project_id', projectIds),
      supabase.from('buy_items').select('*').in('project_id', projectIds),
    ]);
    const proposal = (proposalData ?? []) as ProposalItem[];
    const allItems = (allData ?? []) as BuyItem[];

    let openDifferences = 0;
    const summaryByProject = new Map<string, string>();
    for (const pid of projectIds) {
      const mine = items.filter((i) => i.project_id === pid);
      const prop = proposal.filter((p) => p.project_id === pid);
      if (prop.length === 0) continue;
      const res = checkAgainstProposal(mine, prop, allItems.filter((i) => i.project_id === pid));
      openDifferences += res.rows.filter((r) => r.kind !== 'match' && !r.item.ack_note).length;
      summaryByProject.set(pid, summarize(res));
    }
    if (openDifferences > 0 && formData.get('reviewed') !== 'on') {
      throw new Error(`${openDifferences} difference${openDifferences === 1 ? '' : 's'} from the proposal. Tick "I reviewed the differences" to continue.`);
    }

    const groups = new Map<string, BuyItem[]>();
    for (const it of items) {
      const key = `${it.project_id}||${(it.vendor ?? '').trim() || 'Vendor to be chosen'}`;
      groups.set(key, [...(groups.get(key) ?? []), it]);
    }

    const created: number[] = [];
    for (const [key, group] of groups) {
      const [pid, vendor] = key.split('||');
      const res = await createPurchase({
        projectId: pid,
        vendor,
        notes: 'Created from the buy plan',
        items: group.map((g) => ({ description: g.name, quantity: String(g.quantity), unit: g.unit ?? '', unitPrice: String(g.unit_price) })),
        filePath: '',
        fileCategory: 'Quote',
      });
      if (!res.ok) throw new Error(res.error);
      created.push(res.id);
      await supabase.from('buy_items').update({ status: 'ordered', purchase_id: res.id }).in('id', group.map((g) => g.id));
      const summary = summaryByProject.get(pid);
      if (summary) {
        await supabase.from('purchase_events').insert({ purchase_id: res.id, event: 'Proposal check', who: 'System', note: summary });
      }
    }
    target = created.length === 1 ? `/admin/purchasing/${created[0]}` : `/admin/projects/${projectIds[0]}/purchasing`;
  });
  if (result.error) return result;
  refresh();
  redirect(target);
}

export type DraftItem = {
  key: number;
  name: string;
  quantity: number;
  unit: string;
  milestoneId: string;
  leadDays: number;
  note: string;
};

// Large plan sets are read in parts. The browser cuts the PDF into small page ranges (no server size or time limit applies there)
// and uploads each part; the server then reads one small part at a time. The screen runs the parts one by one.
export async function planReadFiles(projectId: string): Promise<{ error?: string; files?: { name: string; url: string }[] }> {
  try {
    const supabase = await createClient();
    const { data: docs } = await supabase
      .from('documents')
      .select('file_name, storage_key, version_status, category')
      .eq('project_id', projectId)
      .in('category', ['plans', 'appliances_specs'])
      .order('uploaded_at', { ascending: false });
    const pdfs = (docs ?? []).filter((d) => d.version_status !== 'superseded' && String(d.storage_key).toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) return { error: 'No plan PDFs found. Upload the plans on the Documents tab (category Plans) as PDF files first.' };
    const files: { name: string; url: string }[] = [];
    for (const d of pdfs) {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(String(d.storage_key), 3600);
      if (data?.signedUrl) files.push({ name: String(d.file_name), url: data.signedUrl });
    }
    if (files.length === 0) return { error: 'The plan files could not be opened.' };
    return { files };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong while preparing the plans.' };
  }
}

// Reads one uploaded part (a few pages cut from the plans) and removes the temporary copy.
export async function readPlanChunk(
  projectId: string,
  chunkPath: string,
  fileName: string,
  from: number,
  to: number,
  pages: number
): Promise<{ error?: string; tooBig?: boolean; items?: PlanItem[] }> {
  try {
    if (!chunkPath.startsWith(`${projectId}/plans/read-tmp/`) || chunkPath.includes('..')) return { error: 'Invalid part.' };
    const supabase = await createClient();
    const { data: blob } = await supabase.storage.from('project-files').download(chunkPath);
    if (!blob) return { error: 'The uploaded part could not be opened.' };
    const data = await blob.arrayBuffer();
    if (data.byteLength > MAX_PLAN_BYTES) return { tooBig: true };
    const { data: project } = await supabase.from('projects').select('name, client_name').eq('id', projectId).maybeSingle();
    const { data: ms } = await supabase.from('project_milestones').select('name').eq('project_id', projectId).order('sort_order');
    const items = await readPlansWithAi(
      [{ name: fileName, data }],
      (ms ?? []).map((m: { name: string }) => m.name),
      String(project?.name ?? project?.client_name ?? 'this project'),
      `This is pages ${from} to ${to} of ${pages} in the file "${fileName}".`
    );
    await supabase.storage.from('project-files').remove([chunkPath]);
    return { items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong while reading these pages.' };
  }
}

// Combines the items read from every part, removes repeats and anything already in the buy plan.
export async function finishPlanRead(projectId: string, found: PlanItem[]): Promise<{ error?: string; items?: DraftItem[] }> {
  try {
    const supabase = await createClient();
    const { data: ms } = await supabase.from('project_milestones').select('id, name').eq('project_id', projectId).order('sort_order');
    const milestones = (ms ?? []) as { id: string | number; name: string }[];
    const merged = combinePlanItems(found);
    const { data: existing } = await supabase.from('buy_items').select('name').eq('project_id', projectId);
    const have = new Set((existing ?? []).map((e: { name: string }) => e.name.trim().toLowerCase()));
    const fresh = merged.filter((i) => !have.has(i.name.trim().toLowerCase()));
    return {
      items: fresh.map((i, k) => {
        const hit = milestones.find((m) => i.milestone && m.name.trim().toLowerCase() === i.milestone.trim().toLowerCase());
        return {
          key: k,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit ?? '',
          milestoneId: hit ? String(hit.id) : '',
          leadDays: i.lead_days,
          note: i.note ?? '',
        };
      }),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong while combining the list.' };
  }
}

export async function addDraftItems(projectId: string, drafts: DraftItem[]): Promise<Outcome> {
  return guard(async () => {
    const rows = drafts
      .filter((d) => d.name.trim() && d.milestoneId && d.quantity > 0)
      .map((d) => ({
        project_id: projectId,
        name: d.name.trim().slice(0, 200),
        quantity: d.quantity,
        unit: d.unit.trim() || null,
        milestone_id: d.milestoneId,
        lead_days: Math.max(0, Math.round(d.leadDays)),
      }));
    if (rows.length === 0) throw new Error('Choose at least one item, and pick the schedule step for each.');
    const supabase = await createClient();
    const { error } = await supabase.from('buy_items').insert(rows);
    if (error) throw new Error(error.message);
    refresh();
  });
}

// Plan files are saved on the project Documents tab (category Plans), so they show in every place that lists plans.
// Plans get amended, so each file has a label (Original, Amendment 1...) and the date printed or signed on the plan.
export async function uploadPlanFile(projectId: string, formData: FormData): Promise<Outcome> {
  return guard(async () => {
    const path = String(formData.get('file') ?? '').trim();
    if (!path) throw new Error('Please choose a file first and wait for it to finish uploading.');
    const label = String(formData.get('label') ?? '').trim();
    const planDate = String(formData.get('planDate') ?? '').trim();
    if (!planDate) throw new Error('Enter the date on the plans (the date they were signed or issued).');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('documents')
      .insert({
        project_id: projectId,
        category: 'plans',
        file_name: path.split('/').pop() ?? path,
        storage_key: path,
        notes: label || 'Plans',
        plan_date: planDate,
      })
      .select('id')
      .single();
    if (error) {
      if (error.message.includes('plan_date')) throw new Error('The database is not ready for plan dates yet. Run the plan date SQL in Supabase first.');
      throw new Error(error.message);
    }
    if (formData.get('replaces') === 'on' && data) {
      await supabase
        .from('documents')
        .update({ version_status: 'superseded' })
        .eq('project_id', projectId)
        .eq('category', 'plans')
        .neq('id', data.id);
    }
    refresh();
  });
}

export async function setPlanStatus(docId: number, status: 'current' | 'superseded'): Promise<void> {
  const supabase = await createClient();
  await supabase.from('documents').update({ version_status: status }).eq('id', docId).in('category', ['plans', 'appliances_specs']);
  refresh();
}

export async function removePlanFile(docId: number, storageKey: string): Promise<void> {
  const supabase = await createClient();
  await supabase.storage.from('project-files').remove([storageKey]);
  await supabase.from('documents').delete().eq('id', docId).in('category', ['plans', 'appliances_specs']);
  refresh();
}
