import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, SourceError } from '../server/travelpayouts.js';

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

test('groupedPrices builds URL, sends token header, returns data', async () => {
  const fetch = fakeFetch([{ status: 200, body: { success: true, data: { '2026-12-01': { price: 1 } } } }]);
  const c = createClient({ token: 'T', fetch, now: () => 1000, ttlMs: 100 });
  const r = await c.groupedPrices({ origin: 'MOW', destination: 'RIO', departure_at: '2026-12' });
  assert.deepEqual(r.data, { '2026-12-01': { price: 1 } });
  assert.equal(r.stale, false);
  assert.equal(r.fetchedAt, 1000);
  assert.match(fetch.calls[0].url, /aviasales\/v3\/grouped_prices\?/);
  assert.match(fetch.calls[0].url, /origin=MOW/);
  assert.equal(fetch.calls[0].init.headers['X-Access-Token'], 'T');
  assert.equal(c.lastSuccessAt, 1000);
});

test('second call within TTL is served from cache', async () => {
  const fetch = fakeFetch([{ status: 200, body: { success: true, data: [1] } }]);
  let t = 0;
  const c = createClient({ token: 'T', fetch, now: () => t, ttlMs: 100 });
  await c.pricesForDates({ departure_at: '2026-12-01' });
  t = 50;
  const r = await c.pricesForDates({ departure_at: '2026-12-01' });
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(r.data, [1]);
});

test('after TTL a failed refresh returns stale data', async () => {
  const fetch = fakeFetch([{ status: 200, body: { success: true, data: [1] } }, { status: 429, body: {} }]);
  let t = 0;
  const c = createClient({ token: 'T', fetch, now: () => t, ttlMs: 100 });
  await c.pricesForDates({ departure_at: '2026-12-01' });
  t = 200;
  const r = await c.pricesForDates({ departure_at: '2026-12-01' });
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(r.data, [1]);
  assert.equal(r.stale, true);
  assert.equal(r.fetchedAt, 0);
});

test('failure without cache throws SourceError', async () => {
  const fetch = fakeFetch([new Error('ECONNRESET')]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  await assert.rejects(c.pricesForDates({ departure_at: '2026-12-01' }), SourceError);
});

test('success:false is a source error', async () => {
  const fetch = fakeFetch([{ status: 200, body: { success: false, error: 'bad token' } }]);
  const c = createClient({ token: 'T', fetch, now: () => 0, ttlMs: 100 });
  await assert.rejects(c.pricesForDates({ departure_at: '2026-12-01' }), /bad token/);
});
