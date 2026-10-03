import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, buildSearchLink, priceFor, cheapestDates, daysBetween } from '../server/offers.js';
import { config } from '../config.js';

const raw = {
  origin: 'MOW', destination: 'RIO', origin_airport: 'SVO', destination_airport: 'GIG',
  price: 61234, airline: 'EK', flight_number: '132', departure_at: '2026-12-01T10:00:00+03:00',
  return_at: '', transfers: 1, return_transfers: 0, duration: 1230, link: '/search/MOW0112RIO1?t=x',
};

test('normalizeOffer: whitelisted airline is allowed', () => {
  const o = normalizeOffer(raw, config);
  assert.equal(o.date, '2026-12-01');
  assert.equal(o.allowed, true);
  assert.equal(o.reason, null);
  assert.equal(o.airlineName, 'Emirates');
  assert.equal(o.returnDate, null);
  assert.equal(o.returnTransfers, null);
  assert.equal(o.durationMin, 1230);
  assert.equal(o.originAirport, 'SVO');
});

test('normalizeOffer: airline outside whitelist gets reason airline', () => {
  const o = normalizeOffer({ ...raw, airline: 'G9' }, config);
  assert.equal(o.allowed, false);
  assert.equal(o.reason, 'airline');
  assert.equal(o.airlineName, 'Air Arabia');
});

test('normalizeOffer: unknown airline code falls back to code', () => {
  assert.equal(normalizeOffer({ ...raw, airline: 'ZZ' }, config).airlineName, 'ZZ');
});

test('normalizeOffer: too many transfers there or back', () => {
  assert.equal(normalizeOffer({ ...raw, transfers: 3 }, config).reason, 'transfers');
  const rt = normalizeOffer({ ...raw, return_at: '2026-12-15T08:00:00-03:00', return_transfers: 3 }, config);
  assert.equal(rt.reason, 'transfers');
  assert.equal(rt.returnDate, '2026-12-15');
  assert.equal(rt.returnTransfers, 3);
});

test('buildSearchLink one way and round trip', () => {
  assert.equal(buildSearchLink({ origin: 'MOW', destination: 'RIO', depart: '2026-12-01', adults: 1 }),
    'https://www.aviasales.ru/search/MOW0112RIO1');
  assert.equal(buildSearchLink({ origin: 'MOW', destination: 'RIO', depart: '2026-12-01', ret: '2027-01-05', adults: 2 }),
    'https://www.aviasales.ru/search/MOW0112RIO05012');
});

test('priceFor doubles for two adults and flags estimate', () => {
  assert.deepEqual(priceFor({ price: 100 }, 1), { price: 100, estimated: false });
  assert.deepEqual(priceFor({ price: 100 }, 2), { price: 200, estimated: true });
});

test('cheapestDates: three cheapest allowed per month', () => {
  const days = {
    '2026-12-01': { price: 5, allowed: true }, '2026-12-02': { price: 1, allowed: false },
    '2026-12-03': { price: 3, allowed: true }, '2026-12-04': { price: 2, allowed: true },
    '2026-12-05': { price: 4, allowed: true }, '2027-01-01': { price: 9, allowed: true },
  };
  assert.deepEqual(cheapestDates(days, 3), ['2026-12-04', '2026-12-03', '2026-12-05', '2027-01-01']);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-12-25', '2027-01-05'), 11);
  assert.equal(daysBetween('2026-12-01', '2026-12-01'), 0);
});
