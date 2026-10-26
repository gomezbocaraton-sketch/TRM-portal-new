'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createPurchase } from '@/app/admin/purchasing/actions';
import { searchPrices } from '@/lib/price-search';
import { extractProposalLines } from '@/lib/proposal-extract';
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
