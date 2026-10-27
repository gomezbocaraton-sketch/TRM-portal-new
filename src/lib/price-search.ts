// Web price search through SerpApi (Google Shopping). Needs SERPAPI_KEY in Vercel.
export type FoundQuote = {
  category: 'lowest' | 'value' | 'fast';
  store: string;
  title: string;
  price: number;
  delivery: string | null;
  rating: number | null;
  url: string | null;
};

type Shopping = {
  title?: string;
  source?: string;
  extracted_price?: number;
  rating?: number;
  reviews?: number;
  delivery?: string;
  product_link?: string;
  link?: string;
};

// Item names from the plans often carry room lists in brackets; stores search better without them.
export function searchQueryFor(name: string): string {
  const q = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return q || name;
}

export function priceSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

const FAST = /(today|tomorrow|1[- ]day|2[- ]day|3[- ]day|same[- ]day|pickup|1\s*-\s*3\s*days?)/i;

export async function searchPrices(query: string): Promise<FoundQuote[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('Web price search is not connected yet. Add SERPAPI_KEY in Vercel, or enter quotes by hand.');

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('gl', 'us');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', key);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`The price search service returned an error (${res.status}).`);
  const json = (await res.json()) as { shopping_results?: Shopping[]; error?: string };
  if (json.error) throw new Error(`Price search: ${json.error}`);

  const results = (json.shopping_results ?? []).filter(
    (r) => typeof r.extracted_price === 'number' && r.extracted_price > 0 && r.source
  );
  if (results.length === 0) throw new Error('No prices were found for that search. Try more specific words.');

  const byPrice = [...results].sort((a, b) => (a.extracted_price ?? 0) - (b.extracted_price ?? 0));
  const used = new Set<Shopping>();
  const out: FoundQuote[] = [];
  const take = (r: Shopping | undefined, category: FoundQuote['category']) => {
    if (!r) return;
    used.add(r);
    out.push({
      category,
      store: String(r.source),
      title: String(r.title ?? query),
      price: Number(r.extracted_price),
      delivery: r.delivery ?? null,
      rating: typeof r.rating === 'number' ? r.rating : null,
      url: r.product_link ?? r.link ?? null,
    });
  };

  take(byPrice[0], 'lowest');

  const lowest = byPrice[0].extracted_price ?? 0;
  const valueCandidates = byPrice
    .filter((r) => !used.has(r) && (r.rating ?? 0) >= 4 && (r.extracted_price ?? 0) <= lowest * 1.4)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0));
  take(valueCandidates[0] ?? byPrice.find((r) => !used.has(r)), 'value');

  const fastCandidates = byPrice.filter((r) => !used.has(r) && r.delivery && FAST.test(r.delivery));
  take(fastCandidates[0] ?? byPrice.find((r) => !used.has(r)), 'fast');

  return out;
}
