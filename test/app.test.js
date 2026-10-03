import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { SourceError } from '../server/travelpayouts.js';
import { config } from '../config.js';

const tp = (over = {}) => ({
  origin: 'MOW', destination: 'RIO', origin_airport: 'SVO', destination_airport: 'GIG',
  price: 50000, airline: 'QR', flight_number: '1', departure_at: '2026-12-03T01:00:00+03:00',
  return_at: '', transfers: 1, return_transfers: 0, duration: 1100, link: '/search/x', ...over,
});

function fakeClient({ grouped = {}, dates = [], fail = false, stale = false } = {}) {
  const calls = { grouped: [], dates: [] };
  return {
    calls,
    async groupedPrices(p) {
      calls.grouped.push(p);
      if (fail) throw new SourceError('down');
      return { data: grouped[p.departure_at] ?? {}, stale, fetchedAt: 1700000000000 };
    },
    async pricesForDates(p) {
      calls.dates.push(p);
      if (fail) throw new SourceError('down');
      return { data: dates, stale, fetchedAt: 1700000000000 };
    },
  };
}

const build = (client) => createApp({ config, getClient: () => client });

test('GET /api/calendar merges months and marks reasons', async () => {
  const client = fakeClient({ grouped: {
    '2026-12': {
      '2026-12-03': tp(),
      '2026-12-04': tp({ airline: 'G9', departure_at: '2026-12-04T01:00:00+03:00' }),
    },
    '2027-01': { '2027-01-10': tp({ departure_at: '2027-01-10T01:00:00+03:00', transfers: 3 }) },
    '2027-02': {},
  } });
  const res = await build(client).request('/api/calendar');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(client.calls.grouped.length, 3);
  assert.equal(client.calls.grouped[0].group_by, 'departure_at');
  assert.equal(client.calls.grouped[0].origin, 'MOW');
  assert.equal(body.days['2026-12-03'].allowed, true);
  assert.equal(body.days['2026-12-04'].reason, 'airline');
  assert.equal(body.days['2027-01-10'].reason, 'transfers');
  assert.deepEqual(body.months, config.months);
  assert.deepEqual(body.cheapest, ['2026-12-03']);
  assert.equal(body.stale, false);
  assert.equal(body.stats.daysTotal, 90);
  assert.equal(body.stats.daysWithData, 3);
  assert.equal(body.stats.daysAllowed, 1);
});

test('GET /api/calendar when source down and no cache → 503', async () => {
  const res = await build(fakeClient({ fail: true })).request('/api/calendar');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'source_unavailable');
});

test('GET /api/calendar propagates stale flag', async () => {
  const res = await build(fakeClient({ stale: true })).request('/api/calendar');
  assert.equal((await res.json()).stale, true);
});

test('GET /api/roundtrip exact dates: filters, sorts, limits', async () => {
  const dates = [
    tp({ price: 90000, return_at: '2026-12-15T08:00:00-03:00' }),
    tp({ price: 70000, return_at: '2026-12-15T08:00:00-03:00', airline: 'EK' }),
    tp({ price: 10000, return_at: '2026-12-15T08:00:00-03:00', airline: 'G9' }),
    tp({ price: 80000, return_at: '2026-12-15T08:00:00-03:00', return_transfers: 3 }),
  ];
  const client = fakeClient({ dates });
  const res = await build(client).request('/api/roundtrip?depart=2026-12-03&return=2026-12-15');
  const body = await res.json();
  assert.equal(client.calls.dates[0].one_way, 'false');
  assert.equal(client.calls.dates[0].departure_at, '2026-12-03');
  assert.equal(client.calls.dates[0].return_at, '2026-12-15');
  assert.deepEqual(body.offers.map((o) => o.price), [70000, 90000]);
  assert.equal(body.hidden, 2);
});

test('GET /api/roundtrip duration window: queries each return month, filters by trip length', async () => {
  const mk = (ret, price) => tp({ price, departure_at: '2026-12-28T01:00:00+03:00', return_at: `${ret}T08:00:00-03:00` });
  const client = fakeClient({ dates: [mk('2027-01-02', 1), mk('2027-01-10', 2), mk('2027-01-30', 3)] });
  const res = await build(client).request('/api/roundtrip?depart=2026-12-28&minDays=7&maxDays=21');
  const body = await res.json();
  assert.deepEqual(client.calls.dates.map((c) => c.return_at), ['2027-01']);
  assert.deepEqual(body.offers.map((o) => o.returnDate), ['2027-01-10']);
});

test('GET /api/roundtrip duration window spanning two months queries both', async () => {
  const client = fakeClient({ dates: [] });
  await build(client).request('/api/roundtrip?depart=2026-12-20&minDays=7&maxDays=21');
  assert.deepEqual(client.calls.dates.map((c) => c.return_at), ['2026-12', '2027-01']);
});

test('GET /api/roundtrip validates params', async () => {
  const app = build(fakeClient());
  assert.equal((await app.request('/api/roundtrip?depart=bad')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2025-01-01&return=2025-01-05')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2026-12-03&return=2026-12-01')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2026-12-03&minDays=20&maxDays=5')).status, 400);
});

test('GET /api/status reports counts', async () => {
  const client = fakeClient({ grouped: { '2026-12': { '2026-12-03': tp() } } });
  const body = await (await build(client).request('/api/status')).json();
  assert.equal(body.daysWithData, 1);
  assert.equal(body.daysAllowed, 1);
  assert.equal(body.fetchedAt, 1700000000000);
});
