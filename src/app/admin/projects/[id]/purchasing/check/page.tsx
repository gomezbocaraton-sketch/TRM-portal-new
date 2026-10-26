import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { money } from '@/lib/purchasing';
import type { BuyItem } from '@/lib/buyplan';
import { checkAgainstProposal, type CheckKind, type ProposalItem } from '@/lib/proposal';
import { extractConfigured } from '@/lib/proposal-extract';
import { acceptDifference, addProposalItem, deleteProposalItem, extractProposal, linkProposal } from '../actions';

type Row = Record<string, unknown>;
const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';

const LABEL: Record<CheckKind, { text: string; cls: string; row: string }> = {
  match: { text: '✓ Matches', cls: 'text-green-700', row: '' },
  price: { text: '⚠ Price is higher', cls: 'text-red-700', row: 'bg-red-50' },
  qty: { text: '⚠ Quantity differs', cls: 'text-amber-800', row: 'bg-amber-50' },
  different: { text: '⚠ Different product?', cls: 'text-amber-800', row: 'bg-amber-50' },
  notinproposal: { text: '⚠ Not in the proposal', cls: 'text-red-700', row: 'bg-red-50' },
};

export default async function ProposalCheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ids?: string | string[] }> }) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const idList = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).map(Number).filter((n) => Number.isFinite(n));
  let items: BuyItem[] = [];
  if (idList.length > 0) {
    const { data } = await supabase.from('buy_items').select('*').in('id', idList).eq('project_id', projectId);
    items = (data ?? []) as BuyItem[];
  } else {
    const { data } = await supabase.from('buy_items').select('*').eq('project_id', projectId).eq('status', 'planned');
    items = (data ?? []) as BuyItem[];
  }
  const projectIds = [projectId];

  const [{ data: projectData }, { data: proposalData }, { data: allData }] = await Promise.all([
    supabase.from('projects').select('*').in('id', projectIds.length ? projectIds : ['-1']),
    supabase.from('proposal_items').select('*').in('project_id', projectIds.length ? projectIds : ['-1']).order('id'),
    supabase.from('buy_items').select('*').in('project_id', projectIds.length ? projectIds : ['-1']),
  ]);
  const projects = (projectData ?? []) as Row[];
  const proposalAll = (proposalData ?? []) as ProposalItem[];
  const allItems = (allData ?? []) as BuyItem[];
  const canRead = extractConfigured();

  return (
    <div>
      <Link href={`/admin/projects/${projectId}/purchasing`} className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">&larr; Purchasing</Link>
      <h1 className="mb-4 text-xl font-semibold text-navy">Proposal check</h1>

      {projectIds.map((pid) => {
        const project = projects.find((p) => String(p.id) === pid);
        const name = String(project?.name ?? project?.address ?? project?.client_name ?? `Project ${pid}`);
        const mine = items.filter((i) => i.project_id === pid);
        const proposal = proposalAll.filter((p) => p.project_id === pid);
        const result = checkAgainstProposal(mine, proposal, allItems.filter((i) => i.project_id === pid));
        const count = (k: CheckKind) => result.rows.filter((r) => r.kind === k).length;
        const poIds = mine.filter((i) => i.status === 'planned').map((i) => `ids=${i.id}`).join('&');

        return (
          <section key={pid} className="mb-8">
            <p className="mb-3 text-base font-semibold text-navy">{name}</p>

            {proposal.length === 0 ? (
              <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                No proposal lines are saved for this project yet. Read them from the signed proposal PDF, or type them in below. Then the check can run.
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2 text-sm font-semibold">
                  <span className="rounded-card border border-line bg-white px-3 py-2"><b className="mr-1 text-green-700">{count('match')}</b>match</span>
                  <span className="rounded-card border border-line bg-white px-3 py-2"><b className="mr-1 text-red-700">{count('price')}</b>cost more</span>
                  <span className="rounded-card border border-line bg-white px-3 py-2"><b className="mr-1 text-amber-800">{count('qty') + count('different')}</b>differ</span>
                  <span className="rounded-card border border-line bg-white px-3 py-2"><b className="mr-1 text-red-700">{count('notinproposal') + result.notPurchased.length}</b>not matched</span>
                </div>
                {result.differences > 0 ? (
                  <div className="mb-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <b>{result.differences} difference{result.differences === 1 ? '' : 's'} found.</b> Fix them or accept each with a note. Vanessa will see this list on the order.
                  </div>
                ) : (
                  <div className="mb-3 rounded-card border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">Everything matches the proposal.</div>
                )}

                <div className="mb-3 overflow-x-auto rounded-card border border-line bg-white">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Result</th>
                        <th className="px-3 py-2">Detail</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => {
                        const l = LABEL[r.kind];
                        return (
                          <tr key={r.item.id} className={`border-b border-line align-top last:border-0 ${r.item.ack_note ? '' : l.row}`}>
                            <td className="px-3 py-2">{r.item.name}</td>
                            <td className={`px-3 py-2 font-semibold ${r.item.ack_note ? 'text-ink-soft' : l.cls}`}>{r.item.ack_note ? '✓ Accepted' : l.text}</td>
                            <td className="px-3 py-2 text-ink-soft">
                              {r.detail}
                              {r.item.ack_note ? <span className="block text-xs">Note: {r.item.ack_note}</span> : null}
                            </td>
                            <td className="min-w-[220px] px-3 py-2">
                              {r.kind !== 'match' && !r.item.ack_note && (
                                <div className="space-y-2">
                                  <FormWithFeedback action={acceptDifference.bind(null, r.item.id)} submitLabel="Accept with a note">
                                    <input name="note" placeholder="Why this is fine" className={input} />
                                  </FormWithFeedback>
                                  <FormWithFeedback action={linkProposal.bind(null, r.item.id)} submitLabel="Link to proposal line">
                                    <select name="proposalItemId" defaultValue={r.item.proposal_item_id ? String(r.item.proposal_item_id) : ''} className={input}>
                                      <option value="">Choose the matching proposal line…</option>
                                      {proposal.map((p) => (
                                        <option key={p.id} value={p.id}>{p.description}</option>
                                      ))}
                                    </select>
                                  </FormWithFeedback>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {result.notPurchased.map((p) => (
                        <tr key={`np-${p.id}`} className="border-b border-line bg-amber-50 last:border-0">
                          <td className="px-3 py-2">{p.description}</td>
                          <td className="px-3 py-2 font-semibold text-amber-800">⚠ Not on the plan yet</td>
                          <td className="px-3 py-2 text-ink-soft">In the proposal ({money(Number(p.unit_price) * Number(p.quantity))}) but not on any buy plan item</td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {poIds && (
                  <Link href={`/admin/projects/${projectId}/purchasing/po?${poIds}`} className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
                    Generate PO from these items →
                  </Link>
                )}
              </>
            )}

            <div className="mt-5 rounded-card border border-line bg-white p-4 sm:p-6">
              <p className="mb-1 text-sm font-semibold text-navy">Proposal lines</p>
              <p className="mb-3 text-xs text-ink-soft">What the client signed. The check compares your purchases to these lines.</p>
              <FormWithFeedback action={extractProposal.bind(null, pid)} submitLabel="Read lines from the proposal PDF" pendingLabel="Reading the PDF…">
                {!canRead && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Reading the PDF is not connected yet (needs ANTHROPIC_API_KEY in Vercel). Type the lines in below until then.</p>}
                <p className="text-xs text-ink-soft">Uses the estimate file on the project Overview tab (or the contract if there is no estimate). This replaces lines read earlier from a PDF.</p>
              </FormWithFeedback>

              {proposal.length > 0 && (
                <table className="my-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                      <th className="py-1">Line</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Price each</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="py-1.5">{p.description}</td>
                        <td className="py-1.5 text-right">{Number(p.quantity)}</td>
                        <td className="py-1.5 text-right">{money(Number(p.unit_price))}</td>
                        <td className="py-1.5 text-right">
                          <form action={deleteProposalItem.bind(null, Number(p.id))}>
                            <button className="text-xs text-red-700 underline">Remove</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p className="mb-2 mt-4 text-xs font-medium text-ink-soft">Add a proposal line</p>
              <FormWithFeedback action={addProposalItem.bind(null, pid)} submitLabel="Add line">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input name="description" placeholder="Item as written in the proposal" className={`${input} sm:col-span-2`} />
                  <input name="quantity" placeholder="Qty" defaultValue="1" className={input} />
                  <input name="unitPrice" placeholder="Price each" className={input} />
                </div>
              </FormWithFeedback>
            </div>
          </section>
        );
      })}
    </div>
  );
}
