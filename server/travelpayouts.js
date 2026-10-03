// Клиент Aviasales Data API (Travelpayouts) с кешем в памяти.
// При ошибке источника отдаёт последний удачный ответ с пометкой stale.

const BASE = 'https://api.travelpayouts.com/aviasales/v3/';

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

export function createClient({ token, fetch = globalThis.fetch, now = Date.now, ttlMs = 30 * 60 * 1000 }) {
  const cache = new Map(); // url -> { data, fetchedAt }
  let lastSuccessAt = null;

  async function get(method, params) {
    const url = new URL(method, BASE);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const key = url.toString();
    const hit = cache.get(key);
    const t = now();
    if (hit && t - hit.fetchedAt < ttlMs) return { data: hit.data, stale: false, fetchedAt: hit.fetchedAt };
    try {
      const res = await fetch(key, { headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip, deflate' } });
      if (!res.ok) throw new SourceError(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.success) throw new SourceError(body.error || 'success=false');
      cache.set(key, { data: body.data, fetchedAt: t });
      lastSuccessAt = t;
      return { data: body.data, stale: false, fetchedAt: t };
    } catch (err) {
      if (hit) return { data: hit.data, stale: true, fetchedAt: hit.fetchedAt };
      throw err instanceof SourceError ? err : new SourceError(err.message);
    }
  }

  return {
    groupedPrices: (params) => get('grouped_prices', params),
    pricesForDates: (params) => get('prices_for_dates', params),
    get lastSuccessAt() { return lastSuccessAt; },
  };
}
