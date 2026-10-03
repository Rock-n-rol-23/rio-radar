import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { SourceError } from '../server/travelpayouts.js';
import { config } from '../config.js';

const leg = (origin, destination, carrier) => ({ origin, destination, operating_carrier: carrier, flight_number: '1', departure_at: '', arrival_at: '' });
const EK = [{ flight_legs: [leg('SVO', 'DXB', 'EK'), leg('DXB', 'GIG', 'EK')] }];

const tp = (over = {}) => ({
  departure_at: '2026-12-03T01:00:00+03:00', return_at: '', value: 50000, number_of_changes: 1,
  main_airline: 'QR', duration: 1100, convenient: false, found_at: 1700000000,
  origin_airport_iata: 'SVO', destination_airport_iata: 'GIG', ticket_link: '/x',
  segments: [{ flight_legs: [leg('SVO', 'DOH', 'QR'), leg('DOH', 'GIG', 'QR')] }], ...over,
});
const rt = (ret, over = {}) => tp({
  return_at: `${ret}T08:00:00-03:00`,
  segments: [{ flight_legs: [leg('SVO', 'DOH', 'QR'), leg('DOH', 'GIG', 'QR')] }, { flight_legs: [leg('GIG', 'DOH', 'QR'), leg('DOH', 'SVO', 'QR')] }],
  ...over,
});

function fakeClient({ oneWay = {}, roundTrip = [], fail = false, stale = false } = {}) {
  const calls = { oneWay: [], roundTrip: [] };
  return {
    calls,
    async pricesOneWay(p) {
      calls.oneWay.push(p);
      if (fail) throw new SourceError('down');
      return { data: oneWay[p.depart_months[0]] ?? [], stale, fetchedAt: 1700000000000 };
    },
    async pricesRoundTrip(p) {
      calls.roundTrip.push(p);
      if (fail) throw new SourceError('down');
      return { data: roundTrip, stale, fetchedAt: 1700000000000 };
    },
  };
}

const build = (client) => createApp({ config, getClient: () => client });

test('GET /api/calendar groups offers per day with best, options and reasons', async () => {
  const client = fakeClient({ oneWay: {
    '2026-12-01': [
      tp({ value: 90000 }),
      tp({ value: 70000, main_airline: 'EK', segments: EK }),
      tp({ value: 30000, main_airline: 'AT', segments: [{ flight_legs: [leg('SVO', 'CMN', 'AT'), leg('CMN', 'GIG', 'AT')] }] }),
      tp({ departure_at: '2026-12-04T01:00:00+03:00', main_airline: 'TK', number_of_changes: 2,
        segments: [{ flight_legs: [leg('VKO', 'IST', 'DP'), leg('IST', 'GRU', 'TK'), leg('GRU', 'GIG', 'LA')] }] }),
    ],
    '2027-01-01': [tp({ departure_at: '2027-01-10T01:00:00+03:00', number_of_changes: 3,
      segments: [{ flight_legs: [leg('SVO', 'DOH', 'QR'), leg('DOH', 'GRU', 'QR'), leg('GRU', 'CGH', 'LA'), leg('CGH', 'SDU', 'LA')] }] })],
    '2027-02-01': [],
  } });
  const res = await build(client).request('/api/calendar');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(client.calls.oneWay.length, 3);
  assert.deepEqual(client.calls.oneWay[0], { origin: 'MOW', destination: 'RIO', depart_months: ['2026-12-01'], depart_dates: [] });
  const d3 = body.days['2026-12-03'];
  assert.equal(d3.best.price, 70000);
  assert.equal(d3.best.airline, 'EK');
  assert.deepEqual(d3.options.map((o) => o.price), [70000, 90000]);
  assert.equal(d3.cheapestAny.airline, 'AT');
  assert.equal(d3.cheapestAny.reason, 'airline');
  assert.equal(d3.total, 3);
  assert.equal(body.days['2026-12-04'].best, null);
  assert.equal(body.days['2026-12-04'].cheapestAny.reason, 'partner');
  assert.equal(body.days['2026-12-04'].cheapestAny.reasonDetailName, 'Победа');
  assert.equal(body.days['2027-01-10'].cheapestAny.reason, 'transfers');
  assert.deepEqual(body.months, config.months);
  assert.equal(body.shopping.DXB.apple, 'yes');
  assert.equal(body.hubs.DXB, 'Дубай');
  assert.deepEqual(body.cheapest, ['2026-12-03']);
  assert.equal(body.stale, false);
  assert.equal(body.stats.daysTotal, 90);
  assert.equal(body.stats.daysWithData, 3);
  assert.equal(body.stats.daysAllowed, 1);
  assert.equal(body.stats.offersTotal, 5);
  assert.equal(body.stats.offersAllowed, 2);
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

test('GET /api/roundtrip exact dates: filters, dedupes, sorts, limits', async () => {
  const roundTrip = [
    rt('2026-12-15', { value: 90000 }),
    rt('2026-12-15', { value: 70000, main_airline: 'EK', segments: [...EK, { flight_legs: [leg('GIG', 'DXB', 'EK'), leg('DXB', 'SVO', 'EK')] }] }),
    rt('2026-12-15', { value: 70000, main_airline: 'EK', segments: [...EK, { flight_legs: [leg('GIG', 'DXB', 'EK'), leg('DXB', 'SVO', 'EK')] }] }),
    rt('2026-12-15', { value: 10000, main_airline: 'AT' }),
    rt('2026-12-16', { value: 20000 }),
  ];
  const client = fakeClient({ roundTrip });
  const res = await build(client).request('/api/roundtrip?depart=2026-12-03&return=2026-12-15');
  const body = await res.json();
  assert.deepEqual(client.calls.roundTrip[0], { origin: 'MOW', destination: 'RIO', depart_months: [], depart_dates: ['2026-12-03'], return_dates: ['2026-12-15'] });
  assert.deepEqual(body.offers.map((o) => o.price), [70000, 90000]);
  assert.equal(body.offers[0].returnTransfers, 1);
  assert.equal(body.hidden, 1);
});

test('GET /api/roundtrip exact dates falls back to nearby return dates', async () => {
  const client = fakeClient({ roundTrip: [rt('2026-12-17', { value: 5 }), rt('2026-12-21', { value: 4 }), rt('2026-12-30', { value: 3 })] });
  const body = await (await build(client).request('/api/roundtrip?depart=2026-12-03&return=2026-12-19')).json();
  assert.equal(body.nearby, true);
  assert.deepEqual(body.offers.map((o) => o.returnDate), ['2026-12-21', '2026-12-17']);
  const exact = await (await build(fakeClient({ roundTrip: [rt('2026-12-19', { value: 1 }), rt('2026-12-21', { value: 2 })] })).request('/api/roundtrip?depart=2026-12-03&return=2026-12-19')).json();
  assert.equal(exact.nearby, false);
  assert.deepEqual(exact.offers.map((o) => o.returnDate), ['2026-12-19']);
});

test('GET /api/roundtrip duration window passes trip_duration and filters by length', async () => {
  const client = fakeClient({ roundTrip: [rt('2026-12-05', { value: 1 }), rt('2026-12-13', { value: 2 }), rt('2027-01-30', { value: 3 })] });
  const res = await build(client).request('/api/roundtrip?depart=2026-12-03&minDays=7&maxDays=21');
  const body = await res.json();
  assert.equal(client.calls.roundTrip[0].trip_duration_min, 7);
  assert.equal(client.calls.roundTrip[0].trip_duration_max, 21);
  assert.deepEqual(client.calls.roundTrip[0].depart_dates, ['2026-12-03']);
  assert.deepEqual(body.offers.map((o) => o.returnDate), ['2026-12-13']);
});

test('GET /api/roundtrip sort=duration orders by total time', async () => {
  const client = fakeClient({ roundTrip: [rt('2026-12-15', { value: 1, duration: 3000 }), rt('2026-12-15', { value: 2, duration: 1500 })] });
  const body = await (await build(client).request('/api/roundtrip?depart=2026-12-03&return=2026-12-15&sort=duration')).json();
  assert.deepEqual(body.offers.map((o) => o.price), [2, 1]);
});

test('GET /api/roundtrip validates params', async () => {
  const app = build(fakeClient());
  assert.equal((await app.request('/api/roundtrip?depart=bad')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2025-01-01&return=2025-01-05')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2026-12-03&return=2026-12-01')).status, 400);
  assert.equal((await app.request('/api/roundtrip?depart=2026-12-03&minDays=20&maxDays=5')).status, 400);
});

test('GET /api/status reports counts', async () => {
  const client = fakeClient({ oneWay: { '2026-12-01': [tp()] } });
  const body = await (await build(client).request('/api/status')).json();
  assert.equal(body.daysWithData, 1);
  assert.equal(body.daysAllowed, 1);
  assert.equal(body.fetchedAt, 1700000000000);
});
