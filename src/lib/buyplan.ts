// Order-by dates for the buy plan: the day an item must be on site, minus its delivery time, minus a cushion.
export const CUSHION_DAYS = 3;
export const SOON_DAYS = 14;

export type Urgency = 'now' | 'soon' | 'later' | 'nodate';

export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const t = new Date(utcDay(iso) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcDay(toIso) - utcDay(fromIso)) / 86_400_000);
}

export function orderByDate(neededOn: string | null, leadDays: number): string | null {
  if (!neededOn) return null;
  return addDays(neededOn, -(leadDays + CUSHION_DAYS));
}

export function urgencyOf(orderBy: string | null, today = todayET()): { urgency: Urgency; daysLeft: number | null } {
  if (!orderBy) return { urgency: 'nodate', daysLeft: null };
  const left = daysBetween(today, orderBy);
  return { urgency: left <= 3 ? 'now' : left <= SOON_DAYS ? 'soon' : 'later', daysLeft: left };
}

export function shortDay(iso: string | null): string {
  if (!iso) return 'No date';
  return new Date(utcDay(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dueLabel(urgency: Urgency, left: number | null): string {
  if (left === null) return 'Set a schedule date';
  if (left < 0) return `${-left} day${left === -1 ? '' : 's'} late`;
  if (left === 0) return 'Order today';
  return urgency === 'now' ? `Order in ${left} day${left === 1 ? '' : 's'}` : `In ${left} days`;
}

export type BuyItem = {
  id: number;
  project_id: string;
  name: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
  vendor: string | null;
  quote_url: string | null;
  milestone_id: string | null;
  needed_on: string | null;
  lead_days: number;
  status: 'planned' | 'ordered';
  purchase_id: number | null;
  proposal_item_id: number | null;
  ack_note: string | null;
};

// "Needed on site" comes from the linked schedule milestone (its planned start) unless a date was typed in.
export function neededOnSite(item: BuyItem, milestoneStarts: Map<string, string | null>): string | null {
  if (item.needed_on) return String(item.needed_on).slice(0, 10);
  if (item.milestone_id) return milestoneStarts.get(String(item.milestone_id)) ?? null;
  return null;
}
