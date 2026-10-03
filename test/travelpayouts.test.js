import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, SourceError } from '../server/travelpayouts.js';

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}
const ok = (kind, rows) => ({ status: 200, body: { data: { [kind]: rows } } });
const rows = (n) => Array.from({ length: n }, (_, i) => ({ value: i }));

test('pricesOneWay posts GraphQL with token and params, returns data', async () => {
  const fetch = fakeFetch([ok('prices_one_way', [{ value: 1 }])]);
  const c = createClient({ token: 'T', fetch, now: () => 1000, ttlMs: 100 });
  const r = await c.pricesOneWay({ origin: 'MOW', destination: 'RIO', depart_months: ['2026-12-01'], depart_dates: [] });
  assert.deepEqual(r.data, [{ value: 1 }]);
  assert.equal(r.stale, false);
  assert.equal(r.fetchedAt, 1000);
  const call = fetch.calls[0];
  assert.match(call.url, /graphql\/v1\/query$/);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['X-Access-Token'], 'T');
  assert.match(call.body.query, /prices_one_way\(params: \$params, grouping: NONE/);
  assert.equal(call.body.variables.params.origin, 'MOW');
  assert.equal(call.body.variables.limit, 400);
  assert.equal(call.body.variables.offset, 0);
  assert.equal(c.lastSuccessAt, 1000);
});

test('pages until a short page, concatenating rows', async () => {
  const fetch = fakeFetch([ok('prices_one_way', rows(400)), ok('prices_one_way', rows(400)), ok('prices_one_way', rows(12))]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  const r = await c.pricesOneWay({ depart_months: ['2026-12-01'], depart_dates: [] });
  assert.equal(r.data.length, 812);
  assert.deepEqual(fetch.calls.map((x) => x.body.variables.offset), [0, 400, 800]);
});

test('pricesRoundTrip uses the round trip query', async () => {
  const fetch = fakeFetch([ok('prices_round_trip', [{ value: 2 }])]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  const r = await c.pricesRoundTrip({ depart_dates: ['2026-12-05'], return_dates: ['2026-12-19'] });
  assert.deepEqual(r.data, [{ value: 2 }]);
  assert.match(fetch.calls[0].body.query, /prices_round_trip\(params: \$params/);
});

test('second call within TTL is served from cache', async () => {
  const fetch = fakeFetch([ok('prices_one_way', [1])]);
  let t = 0;
  const c = createClient({ token: 'T', fetch, now: () => t, ttlMs: 100 });
  await c.pricesOneWay({ depart_dates: ['2026-12-01'] });
  t = 50;
  const r = await c.pricesOneWay({ depart_dates: ['2026-12-01'] });
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(r.data, [1]);
});

test('after TTL a failed refresh returns stale data', async () => {
  const fetch = fakeFetch([ok('prices_one_way', [1]), { status: 429, body: {} }]);
  let t = 0;
  const c = createClient({ token: 'T', fetch, now: () => t, ttlMs: 100 });
  await c.pricesOneWay({ depart_dates: ['2026-12-01'] });
  t = 200;
  const r = await c.pricesOneWay({ depart_dates: ['2026-12-01'] });
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(r.data, [1]);
  assert.equal(r.stale, true);
  assert.equal(r.fetchedAt, 0);
});

test('failure without cache throws SourceError', async () => {
  const fetch = fakeFetch([new Error('ECONNRESET')]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  await assert.rejects(c.pricesOneWay({ depart_dates: ['2026-12-01'] }), SourceError);
});

test('GraphQL errors are a source error', async () => {
  const fetch = fakeFetch([{ status: 200, body: { errors: [{ message: 'limit must be equal or less than 400' }], data: null } }]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  await assert.rejects(c.pricesOneWay({ depart_dates: ['2026-12-01'] }), /limit must be/);
});
