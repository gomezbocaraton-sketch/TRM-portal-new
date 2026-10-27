// Reads a project's plan sheets (PDFs) and drafts the list of materials to buy.
// Needs ANTHROPIC_API_KEY in Vercel. The result is a draft: quantities must be confirmed by a person.
export type PlanItem = {
  name: string;
  quantity: number;
  unit: string | null;
  milestone: string | null;
  lead_days: number;
  note: string | null;
};

export const MAX_PLAN_BYTES = 24 * 1024 * 1024; // the API accepts about 32 MB of base64, so about 24 MB of files

export async function readPlans(
  files: { name: string; data: ArrayBuffer }[],
  milestoneNames: string[],
  projectName: string,
  context = ''
): Promise<PlanItem[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Reading plans is not connected yet. Add ANTHROPIC_API_KEY in Vercel.');

  const content: unknown[] = files.flatMap((f) => [
    { type: 'text', text: `Plan file: ${f.name}` },
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(f.data).toString('base64') } },
  ]);
  content.push({
    type: 'text',
    text:
      `These are the construction plans and specifications for "${projectName}". ` +
      (context ? `${context} Only list what appears on these pages. ` : '') +
      'List the materials, products, fixtures, finishes and appliances that must be purchased to build what the plans show. ' +
      'Skip labor, permits and demolition. Use the door, window, finish, fixture, lighting, plumbing and appliance schedules and the drawings. ' +
      'Count quantities from the drawings and schedules where you can. If you cannot determine a quantity, use 1 and say "confirm quantity" in the note. ' +
      `The project schedule steps are: ${milestoneNames.length ? milestoneNames.map((n) => `"${n}"`).join(', ') : '(none set)'}. ` +
      'For each item give the schedule step where it is first needed, copied exactly from that list, or null if none fits. ' +
      'Also give lead_days: the usual delivery time in days for that kind of item (for example cabinets 28, tile 10, lights 5, appliances 21, drywall 2). ' +
      'Reply with ONLY a JSON array, no other text. Each element: {"name": string, "quantity": number, "unit": string or null, "milestone": string or null, "lead_days": number, "note": string or null}.',
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 8000, messages: [{ role: 'user', content }] }),
    cache: 'no-store',
  });
  if (!res.ok) {
    let why = '';
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      why = j.error?.message ? ` ${j.error.message}` : '';
    } catch {
      // no readable body
    }
    throw new Error(`Reading the plans failed (${res.status}).${why}`.trim());
  }
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('No items could be read from the plans.');
  let parsed: Partial<PlanItem>[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Partial<PlanItem>[];
  } catch {
    throw new Error('The answer for these pages was cut off. Retry.');
  }
  return clean(parsed);
}

function clean(parsed: Partial<PlanItem>[]): PlanItem[] {
  return parsed
    .filter((l) => l && l.name && Number(l.quantity) > 0)
    .map((l) => ({
      name: String(l.name).slice(0, 200),
      quantity: Number(l.quantity),
      unit: l.unit ? String(l.unit).slice(0, 20) : null,
      milestone: l.milestone ? String(l.milestone) : null,
      lead_days: Number(l.lead_days) >= 0 ? Math.round(Number(l.lead_days)) : 7,
      note: l.note ? String(l.note).slice(0, 200) : null,
    }));
}

// Items read from different parts of a large plan set often repeat (a door shows on the plan and in the schedule).
// The same name and unit counts once, keeping the larger quantity so nothing is under-ordered; if the parts disagree
// the note asks for the quantity to be confirmed. This is instant, so it never runs into a server time limit.
export function combinePlanItems(items: PlanItem[]): PlanItem[] {
  const seen = new Map<string, PlanItem>();
  for (const i of items) {
    const k = `${i.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${(i.unit ?? '').toLowerCase()}`;
    const have = seen.get(k);
    if (!have) {
      seen.set(k, i);
      continue;
    }
    const bigger = i.quantity > have.quantity ? i : have;
    const disagree = i.quantity !== have.quantity;
    const note = [bigger.note ?? have.note, disagree ? 'confirm quantity (read differently on different sheets)' : null].filter(Boolean).join('; ');
    seen.set(k, { ...bigger, milestone: bigger.milestone ?? have.milestone ?? i.milestone, note: note ? note.slice(0, 200) : null });
  }
  return [...seen.values()];
}
