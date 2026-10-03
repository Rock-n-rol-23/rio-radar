import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffer, buildSearchLink, priceFor, groupByDate, cheapestDates, daysBetween } from '../server/offers.js';
import { config } from '../config.js';

const leg = (origin, destination, carrier) => ({ origin, destination, operating_carrier: carrier, flight_number: '1', departure_at: '', arrival_at: '' });

const raw = {
  departure_at: '2026-12-01T10:00:00+03:00', return_at: '', value: 61234.49, number_of_changes: 1,
  main_airline: 'EK', duration: 1345, convenient: true, found_at: 1791049281,
  origin_airport_iata: 'SVO', destination_airport_iata: 'GIG', ticket_link: '/MOW0112RIO1?t=x',
  segments: [{ flight_legs: [leg('SVO', 'DXB', 'EK'), leg('DXB', 'GIG', 'EK')] }],
};

test('normalizeOffer: whitelisted airline on all legs is allowed', () => {
  const o = normalizeOffer(raw, config);
  assert.equal(o.date, '2026-12-01');
  assert.equal(o.price, 61234);
  assert.equal(o.allowed, true);
  assert.equal(o.reason, null);
  assert.equal(o.airlineName, 'Emirates');
  assert.equal(o.transfers, 1);
  assert.equal(o.returnDate, null);
  assert.equal(o.returnTransfers, null);
  assert.deepEqual(o.hubs, ['DXB']);
  assert.deepEqual(o.hubNames, ['Дубай']);
  assert.deepEqual(o.carriers, ['EK']);
  assert.equal(o.convenient, true);
  assert.equal(o.foundAt, 1791049281000);
  assert.equal(o.link, 'https://www.aviasales.ru/search/MOW0112RIO1?t=x');
});

test('normalizeOffer: main airline outside whitelist → reason airline', () => {
  const o = normalizeOffer({ ...raw, main_airline: 'AT', segments: [{ flight_legs: [leg('SVO', 'CMN', 'AT'), leg('CMN', 'GIG', 'AT')] }] }, config);
  assert.equal(o.allowed, false);
  assert.equal(o.reason, 'airline');
  assert.equal(o.airlineName, 'Royal Air Maroc');
});

test('normalizeOffer: partner leg inside Brazil is fine, foreign leg is not', () => {
  const ok = normalizeOffer({ ...raw, main_airline: 'TK', number_of_changes: 2,
    segments: [{ flight_legs: [leg('VKO', 'IST', 'TK'), leg('IST', 'GRU', 'TK'), leg('GRU', 'GIG', 'LA')] }] }, config);
  assert.equal(ok.allowed, true);
  assert.equal(ok.transfers, 2);
  assert.deepEqual(ok.hubNames, ['Стамбул', 'Сан-Паулу']);
  const bad = normalizeOffer({ ...raw, main_airline: 'TK', number_of_changes: 2,
    segments: [{ flight_legs: [leg('VKO', 'IST', 'DP'), leg('IST', 'GRU', 'TK'), leg('GRU', 'GIG', 'LA')] }] }, config);
  assert.equal(bad.allowed, false);
  assert.equal(bad.reason, 'partner');
  assert.equal(bad.reasonDetail, 'DP');
  assert.equal(bad.reasonDetailName, 'Победа');
});

test('normalizeOffer: too many transfers there or back', () => {
  const three = normalizeOffer({ ...raw, number_of_changes: 3,
    segments: [{ flight_legs: [leg('SVO', 'DXB', 'EK'), leg('DXB', 'AUH', 'EK'), leg('AUH', 'GRU', 'EK'), leg('GRU', 'GIG', 'EK')] }] }, config);
  assert.equal(three.reason, 'transfers');
  assert.equal(three.transfers, 3);
  const rt = normalizeOffer({ ...raw, return_at: '2026-12-15T08:00:00-03:00', number_of_changes: 4,
    segments: [
      { flight_legs: [leg('SVO', 'DXB', 'EK'), leg('DXB', 'GIG', 'EK')] },
      { flight_legs: [leg('GIG', 'GRU', 'EK'), leg('GRU', 'DXB', 'EK'), leg('DXB', 'AUH', 'EK'), leg('AUH', 'SVO', 'EK')] },
    ] }, config);
  assert.equal(rt.reason, 'transfers');
  assert.equal(rt.returnDate, '2026-12-15');
  assert.equal(rt.transfers, 1);
  assert.equal(rt.returnTransfers, 3);
});

test('normalizeOffer: without segments falls back to number_of_changes', () => {
  const o = normalizeOffer({ ...raw, segments: [], number_of_changes: 2 }, config);
  assert.equal(o.transfers, 2);
  assert.equal(o.allowed, true);
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

test('groupByDate: best allowed, options sorted, cheapestAny may be blocked', () => {
  const mk = (date, price, allowed, durationMin = 1000) => ({ date, price, allowed, durationMin });
  const days = groupByDate([mk('2026-12-01', 90, true, 500), mk('2026-12-01', 50, false), mk('2026-12-01', 70, true), mk('2026-12-02', 10, false)], { dayOptionsLimit: 10 });
  assert.equal(days['2026-12-01'].best.price, 70);
  assert.equal(days['2026-12-01'].fastest.price, 90);
  assert.deepEqual(days['2026-12-01'].options.map((o) => o.price), [70, 90]);
  assert.equal(days['2026-12-01'].cheapestAny.price, 50);
  assert.equal(days['2026-12-01'].total, 3);
  assert.equal(days['2026-12-01'].allowedCount, 2);
  assert.equal(days['2026-12-02'].best, null);
  assert.equal(days['2026-12-02'].cheapestAny.price, 10);
});

test('groupByDate: options keep the fastest even beyond the price limit', () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ date: '2026-12-01', price: 100 + i, allowed: true, durationMin: 2000 - i }));
  const days = groupByDate(list, { dayOptionsLimit: 10 });
  assert.equal(days['2026-12-01'].options.length, 12);
  assert.equal(days['2026-12-01'].fastest.price, 111);
});

test('cheapestDates: three cheapest days with a best offer per month', () => {
  const d = (price) => ({ best: { price } });
  const days = {
    '2026-12-01': d(5), '2026-12-02': { best: null }, '2026-12-03': d(3), '2026-12-04': d(2), '2026-12-05': d(4), '2027-01-01': d(9),
  };
  assert.deepEqual(cheapestDates(days, 3), ['2026-12-04', '2026-12-03', '2026-12-05', '2027-01-01']);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-12-25', '2027-01-05'), 11);
  assert.equal(daysBetween('2026-12-01', '2026-12-01'), 0);
});
