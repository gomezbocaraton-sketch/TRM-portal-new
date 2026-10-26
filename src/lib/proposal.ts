import type { BuyItem } from '@/lib/buyplan';

export type ProposalItem = {
  id: number;
  project_id: string;
  description: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
  source: string;
};

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'with', 'in', 'to', 'x', 'pk', 'pack', 'set', 'ea', 'each', 'new', 'inch', 'in.', 'per']);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  );
}

export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter++;
  });
  const jaccard = inter / (A.size + B.size - inter);
  const containment = inter / Math.min(A.size, B.size);
  return 0.5 * jaccard + 0.5 * containment;
}

export type CheckKind = 'match' | 'price' | 'qty' | 'different' | 'notinproposal';

export type CheckRow = {
  item: BuyItem;
  kind: CheckKind;
  proposal: ProposalItem | null;
  detail: string;
};

export type CheckResult = {
  rows: CheckRow[];
  notPurchased: ProposalItem[];
  differences: number;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compares what we plan to buy with the lines of the signed proposal.
export function checkAgainstProposal(items: BuyItem[], proposal: ProposalItem[], allProjectItems: BuyItem[]): CheckResult {
  const rows: CheckRow[] = items.map((item) => {
    const linked = item.proposal_item_id ? proposal.find((p) => Number(p.id) === Number(item.proposal_item_id)) : undefined;
    let best: ProposalItem | null = linked ?? null;
    let score = linked ? 1 : 0;
    if (!best) {
      for (const p of proposal) {
        const s = similarity(item.name, p.description);
        if (s > score) {
          score = s;
          best = p;
        }
      }
    }
    if (!best || score < 0.3) {
      return { item, kind: 'notinproposal', proposal: null, detail: 'Not found anywhere in the proposal' };
    }
    if (score < 0.6) {
      return { item, kind: 'different', proposal: best, detail: `Closest proposal line: "${best.description}". Is it a different product?` };
    }
    const q = Number(item.quantity);
    const pq = Number(best.quantity);
    const price = Number(item.unit_price);
    const pp = Number(best.unit_price);
    if (Math.abs(q - pq) > 0.001) {
      return { item, kind: 'qty', proposal: best, detail: `Proposal ${pq} → purchase ${q} (${q > pq ? '+' : ''}${Math.round((q - pq) * 100) / 100})` };
    }
    if (pp > 0 && price > pp * 1.005) {
      const diff = (price - pp) * q;
      return {
        item,
        kind: 'price',
        proposal: best,
        detail: `Proposal ${money(pp)} each → purchase ${money(price)} each (+${money(diff)}, ${Math.round(((price - pp) / pp) * 100)}%)`,
      };
    }
    return { item, kind: 'match', proposal: best, detail: 'Same item, quantity and price' };
  });

  // Proposal lines that no planned purchase (in this project) matches yet.
  const covered = new Set<number>();
  for (const it of allProjectItems) {
    let best: ProposalItem | null = null;
    let score = 0;
    const linked = it.proposal_item_id ? proposal.find((p) => Number(p.id) === Number(it.proposal_item_id)) : undefined;
    if (linked) {
      best = linked;
      score = 1;
    } else {
      for (const p of proposal) {
        const s = similarity(it.name, p.description);
        if (s > score) {
          score = s;
          best = p;
        }
      }
    }
    if (best && score >= 0.3) covered.add(Number(best.id));
  }
  const notPurchased = proposal.filter((p) => !covered.has(Number(p.id)));

  const differences = rows.filter((r) => r.kind !== 'match' && !r.item.ack_note).length + notPurchased.length;
  return { rows, notPurchased, differences };
}

export function summarize(result: CheckResult): string {
  const lines = result.rows
    .filter((r) => r.kind !== 'match')
    .map((r) => `${r.item.name}: ${r.detail}${r.item.ack_note ? ` (accepted: ${r.item.ack_note})` : ''}`);
  if (lines.length === 0) return 'Everything matches the proposal.';
  return lines.join(' | ');
}
