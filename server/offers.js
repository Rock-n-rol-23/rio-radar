// Чистые функции над предложениями: без сети, без состояния.

export function normalizeOffer(raw, config) {
  const airline = raw.airline;
  const returnDate = raw.return_at ? raw.return_at.slice(0, 10) : null;
  const returnTransfers = returnDate ? (raw.return_transfers ?? 0) : null;
  let reason = null;
  if (!config.airlines[airline]) reason = 'airline';
  else if (raw.transfers > config.maxTransfers || (returnTransfers ?? 0) > config.maxTransfers) reason = 'transfers';
  return {
    date: raw.departure_at.slice(0, 10),
    returnDate,
    price: raw.price,
    airline,
    airlineName: config.airlines[airline] ?? config.knownAirlines[airline] ?? airline,
    transfers: raw.transfers ?? 0,
    returnTransfers,
    durationMin: raw.duration ?? null,
    originAirport: raw.origin_airport ?? raw.origin,
    destinationAirport: raw.destination_airport ?? raw.destination,
    departureAt: raw.departure_at,
    allowed: reason === null,
    reason,
  };
}

const ddmm = (iso) => iso.slice(8, 10) + iso.slice(5, 7);

// Короткая ссылка на выдачу Aviasales: MOW0112RIO1 или MOW0112RIO05012
export function buildSearchLink({ origin, destination, depart, ret, adults }) {
  return `https://www.aviasales.ru/search/${origin}${ddmm(depart)}${destination}${ret ? ddmm(ret) : ''}${adults}`;
}

export function priceFor(offer, adults) {
  return { price: offer.price * adults, estimated: adults > 1 };
}

// n самых дешёвых подходящих дней в каждом месяце, по порядку месяцев
export function cheapestDates(days, n) {
  const byMonth = new Map();
  for (const [date, o] of Object.entries(days)) {
    if (!o?.allowed) continue;
    const m = date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push([date, o.price]);
  }
  const out = [];
  for (const m of [...byMonth.keys()].sort()) {
    out.push(...byMonth.get(m).sort((a, b) => a[1] - b[1]).slice(0, n).map(([d]) => d));
  }
  return out;
}

const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}
