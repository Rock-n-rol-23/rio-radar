// Клиент Aviasales Data API через GraphQL (Travelpayouts) с кешем в памяти.
// Листает страницы до конца, кеширует весь список. При ошибке источника
// отдаёт последний удачный ответ с пометкой stale.

const ENDPOINT = 'https://api.travelpayouts.com/graphql/v1/query';
const PAGE = 400;      // максимум, который принимает API
const MAX_PAGES = 6;   // страховка от бесконечного листания

const FIELDS = `
  departure_at return_at value number_of_changes main_airline duration convenient found_at
  origin_airport_iata destination_airport_iata ticket_link
  segments { flight_legs { origin destination operating_carrier flight_number departure_at arrival_at } }
`;

export const QUERIES = {
  prices_one_way: `query($params: ParamsOneWay!, $limit: Int!, $offset: Int!) {
    prices_one_way(params: $params, grouping: NONE, paging: { limit: $limit, offset: $offset }, sorting: VALUE_ASC) { ${FIELDS} }
  }`,
  prices_round_trip: `query($params: ParamsRoundTrip!, $limit: Int!, $offset: Int!) {
    prices_round_trip(params: $params, grouping: NONE, paging: { limit: $limit, offset: $offset }, sorting: VALUE_ASC) { ${FIELDS} }
  }`,
};

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

export function createClient({ token, fetch = globalThis.fetch, now = Date.now, ttlMs = 30 * 60 * 1000 }) {
  const cache = new Map(); // key -> { data, fetchedAt }
  let lastSuccessAt = null;

  async function gql(query, variables) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'X-Access-Token': token, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new SourceError(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new SourceError(body.errors.map((e) => e.message).join('; '));
    return body.data ?? {};
  }

  async function fetchAll(kind, params) {
    const key = `${kind}:${JSON.stringify(params)}`;
    const hit = cache.get(key);
    const t = now();
    if (hit && t - hit.fetchedAt < ttlMs) return { data: hit.data, stale: false, fetchedAt: hit.fetchedAt };
    try {
      const all = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await gql(QUERIES[kind], { params, limit: PAGE, offset: page * PAGE });
        const rows = data[kind] ?? [];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      cache.set(key, { data: all, fetchedAt: t });
      lastSuccessAt = t;
      return { data: all, stale: false, fetchedAt: t };
    } catch (err) {
      if (hit) return { data: hit.data, stale: true, fetchedAt: hit.fetchedAt };
      throw err instanceof SourceError ? err : new SourceError(err.message);
    }
  }

  return {
    pricesOneWay: (params) => fetchAll('prices_one_way', params),
    pricesRoundTrip: (params) => fetchAll('prices_round_trip', params),
    get lastSuccessAt() { return lastSuccessAt; },
  };
}
