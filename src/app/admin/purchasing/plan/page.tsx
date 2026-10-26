import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { money } from '@/lib/purchasing';
import {
  dueLabel,
  neededOnSite,
  orderByDate,
  shortDay,
  todayET,
  urgencyOf,
  CUSHION_DAYS,
  type BuyItem,
  type Urgency,
} from '@/lib/buyplan';
import { addBuyItem } from './actions';

type Row = Record<string, unknown>;

const input = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm';

export default async function BuyPlanPage({ searchParams }: { searchParams: Promise<{ f?: string; project?: string }> }) {
  const { f, project } = await searchParams;
  const filter: Urgency | 'all' = f === 'now' || f === 'soon' || f === 'later' ? f : 'all';
  const supabase = await createClient();

  const [{ data: projectData }, { data: itemData }] = await Promise.all([
    supabase.from('projects').select('*').order('id', { ascending: false }),
    supabase.from('buy_items').select('*').eq('status', 'planned').order('id'),
  ]);
  const projects = (projectData ?? []) as Row[];
  const projectName = new Map(projects.map((p) => [String(p.id), String(p.name ?? p.address ?? p.client_name ?? `Project ${p.id}`)]));

  const allItems = (itemData ?? []) as BuyItem[];
  const items = project ? allItems.filter((i) => String(i.project_id) === project) : allItems;

  const { data: msData } = await supabase
    .from('project_milestones')
    .select('id, name, project_id, planned_start_date, sort_order')
    .order('sort_order');
  const milestones = (msData ?? []) as Row[];
  const starts = new Map(milestones.map((m) => [String(m.id), (m.planned_start_date as string | null) ?? null]));
  const msName = new Map(milestones.map((m) => [String(m.id), String(m.name)]));

  const today = todayET();
  const rows = items
    .map((item) => {
      const needed = neededOnSite(item, starts);
      const by = orderByDate(needed, item.lead_days);
      const { urgency, daysLeft } = urgencyOf(by, today);
      return { item, needed, by, urgency, daysLeft };
    })
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const count = (u: Urgency) => rows.filter((r) => r.urgency === u).length;
  const shown = rows.filter((r) => filter === 'all' || r.urgency === filter || (filter === 'later' && r.urgency === 'nodate'));

  const base = project ? `/admin/purchasing/plan?project=${project}` : '/admin/purchasing/plan';
  const filterHref = (v: string) => (filter === v ? base : `${base}${project ? '&' : '?'}f=${v}`);
  const statClass = (on: boolean, extra: string) => `rounded-card border p-4 text-left ${extra} ${on ? 'outline outline-2 outline-navy' : ''}`;

  const projectMilestones = project ? milestones.filter((m) => String(m.project_id) === project) : [];

  return (
    <div>
      <Link href="/admin/purchasing" className="mb-4 inline-block text-sm text-ink-soft hover:text-navy">
        &larr; Purchasing
      </Link>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-navy">Buy plan{project ? ` · ${projectName.get(project) ?? ''}` : ''}</h1>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        Dates come from the project schedule: the day each item must be on site, minus its delivery time and a {CUSHION_DAYS}-day cushion.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/purchasing/plan" className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${!project ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft'}`}>
          All projects
        </Link>
        {projects.map((p) => (
          <Link
            key={String(p.id)}
            href={`/admin/purchasing/plan?project=${p.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${project === String(p.id) ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft hover:border-accent'}`}
          >
            {projectName.get(String(p.id))}
          </Link>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href={filterHref('now')} className={statClass(filter === 'now', 'border-red-300 bg-red-50')}>
          <p className="text-2xl font-semibold text-red-700">{count('now')}</p>
          <p className="text-xs text-ink-soft">Needs purchase now</p>
        </Link>
        <Link href={filterHref('soon')} className={statClass(filter === 'soon', 'border-amber-300 bg-amber-50')}>
          <p className="text-2xl font-semibold text-amber-700">{count('soon')}</p>
          <p className="text-xs text-ink-soft">Order in the next 14 days</p>
        </Link>
        <Link href={filterHref('later')} className={statClass(filter === 'later', 'border-line bg-white')}>
          <p className="text-2xl font-semibold text-navy">{count('later') + count('nodate')}</p>
          <p className="text-xs text-ink-soft">Later or no date yet</p>
        </Link>
      </div>

      <form method="get">
        <div className="space-y-2">
          {shown.length === 0 && (
            <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-soft">
              {items.length === 0 ? 'No items in the buy plan yet. Choose a project above, then add the items from the plans.' : 'Nothing in this group.'}
            </p>
          )}
          {shown.map(({ item, needed, by, urgency, daysLeft }) => {
            const border = urgency === 'now' ? 'border-l-red-600' : urgency === 'soon' ? 'border-l-amber-500' : 'border-l-line';
            const tag =
              urgency === 'now'
                ? 'bg-red-600 text-white'
                : urgency === 'soon'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-paper text-ink-soft';
            return (
              <div key={item.id} className={`flex flex-wrap items-center gap-3 rounded-card border border-l-4 border-line bg-white p-4 ${border}`}>
                <input type="checkbox" name="ids" value={item.id} defaultChecked={urgency === 'now'} className="h-4 w-4" />
                <div className="min-w-[200px] flex-1">
                  <Link href={`/admin/purchasing/plan/item/${item.id}`} className="text-sm font-semibold text-navy hover:underline">
                    {item.name}
                  </Link>
                  <p className="text-xs text-ink-soft">
                    {!project && `${projectName.get(String(item.project_id)) ?? 'Project'} · `}
                    Needed for: {item.milestone_id ? msName.get(String(item.milestone_id)) ?? 'schedule step' : 'a set date'} ({shortDay(needed)})
                    {Number(item.unit_price) > 0 ? ` · ${money(Number(item.unit_price) * Number(item.quantity))}` : ' · no price yet'}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-navy">Order by {shortDay(by)}</p>
                  <p className="text-xs text-ink-soft">{item.lead_days}-day delivery</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${tag}`}>{dueLabel(urgency, daysLeft)}</span>
                <div className="flex gap-2">
                  <Link href={`/admin/purchasing/plan/item/${item.id}`} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-soft hover:border-accent">
                    Find prices
                  </Link>
                  {urgency === 'now' && (
                    <Link href={`/admin/purchasing/plan/po?ids=${item.id}`} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
                      Buy now
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {shown.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-navy p-4 text-sm text-white">
            <span>Tick the items you want, then choose what to do with them.</span>
            <span className="flex flex-wrap gap-2">
              <button formAction="/admin/purchasing/plan/check" className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy">
                Check against proposal
              </button>
              <button formAction="/admin/purchasing/plan/po" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
                Generate PO
              </button>
            </span>
          </div>
        )}
      </form>

      <div className="mt-8 rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-navy">Add an item to the plan</p>
        {!project ? (
          <p className="text-sm text-ink-soft">Choose a project above first. Its schedule steps will be offered here.</p>
        ) : (
          <FormWithFeedback action={addBuyItem} submitLabel="Add item" pendingLabel="Adding…">
            <input type="hidden" name="projectId" value={project} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-soft">Item</label>
                <input name="name" className={input} placeholder="e.g. Kitchen cabinets (base and wall)" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Quantity</label>
                <input name="quantity" defaultValue="1" className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Unit (optional)</label>
                <input name="unit" className={input} placeholder="each, sq ft, box" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Needed for which schedule step</label>
                <select name="milestoneId" className={input} defaultValue="">
                  <option value="">Choose a step…</option>
                  {projectMilestones.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>
                      {String(m.name)} ({shortDay((m.planned_start_date as string | null) ?? null)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Or the date it must be on site</label>
                <input type="date" name="neededOn" className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Delivery time (days)</label>
                <input name="leadDays" defaultValue="7" className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Estimated price each (optional)</label>
                <input name="unitPrice" className={input} placeholder="You can find it next" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-soft">Vendor (optional)</label>
                <input name="vendor" className={input} />
              </div>
            </div>
          </FormWithFeedback>
        )}
      </div>
    </div>
  );
}
