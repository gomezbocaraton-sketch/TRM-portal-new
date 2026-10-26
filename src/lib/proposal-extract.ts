// Reads the project's signed estimate/contract PDF and lists the material and product lines in it.
// Needs ANTHROPIC_API_KEY in Vercel. Uses a small amount of API credit per file.
export type ExtractedLine = { description: string; quantity: number; unit: string | null; unit_price: number };

export function extractConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractProposalLines(pdf: ArrayBuffer): Promise<ExtractedLine[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Reading the proposal PDF is not connected yet. Add ANTHROPIC_API_KEY in Vercel, or type the proposal lines in by hand.');

  const data = Buffer.from(pdf).toString('base64');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
            {
              type: 'text',
              text:
                'This is a construction proposal or estimate. List every material, product, fixture or appliance line that would be purchased (skip labor-only lines, permits and general conditions). ' +
                'Reply with ONLY a JSON array, no other text. Each element: {"description": string, "quantity": number, "unit": string or null, "unit_price": number}. ' +
                'unit_price is the price for ONE unit in US dollars; if the proposal gives only a line total, divide by the quantity. Use 0 if no price is shown.',
            },
          ],
        },
      ],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Reading the proposal failed (${res.status}).`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Could not find any lines in that proposal.');
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ExtractedLine>[];
  return parsed
    .filter((l) => l.description && Number(l.quantity) > 0)
    .map((l) => ({
      description: String(l.description).slice(0, 200),
      quantity: Number(l.quantity),
      unit: l.unit ? String(l.unit).slice(0, 20) : null,
      unit_price: Number(l.unit_price) >= 0 ? Number(l.unit_price) : 0,
    }));
}
