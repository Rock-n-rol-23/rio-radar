// Чистые функции над предложениями: без сети, без состояния.

const AVIASALES = 'https://www.aviasales.ru/search';

function legsOf(segment) {
  return segment?.flight_legs ?? [];
}

// Билет GraphQL → нормализованное предложение
export function normalizeOffer(raw, config) {
  const airline = raw.main_airline;
  const segments = raw.segments ?? [];
  const out = legsOf(segments[0]);
  const back = raw.return_at ? legsOf(segments[1]) : [];
  const transfers = out.length ? out.length - 1 : (raw.number_of_changes ?? 0);
  const returnTransfers = raw.return_at ? (back.length ? back.length - 1 : null) : null;
  const legs = [...out, ...back];
  const carriers = [...new Set(legs.map((l) => l.operating_carrier).filter(Boolean))];
  const hubs = out.slice(0, -1).map((l) => l.destination);
  const returnHubs = back.slice(0, -1).map((l) => l.destination);
  const name = (code) => config.airlines[code] ?? config.partnerAirlines?.[code] ?? config.knownAirlines[code] ?? code;

  let reason = null;
  let reasonDetail = null;
  if (!config.airlines[airline]) {
    reason = 'airline';
  } else {
    const foreign = carriers.find((c) => !config.airlines[c] && !config.partnerAirlines?.[c]);
    if (foreign) { reason = 'partner'; reasonDetail = foreign; }
    else if (transfers > config.maxTransfers || (returnTransfers ?? 0) > config.maxTransfers) reason = 'transfers';
  }

  return {
    date: raw.departure_at.slice(0, 10),
    returnDate: raw.return_at ? raw.return_at.slice(0, 10) : null,
    price: Math.round(raw.value),
    airline,
    airlineName: name(airline),
    transfers,
    returnTransfers,
    durationMin: raw.duration ?? null,
    originAirport: raw.origin_airport_iata ?? config.origin,
    destinationAirport: raw.destination_airport_iata ?? config.destination,
    departureAt: raw.departure_at,
    returnAt: raw.return_at || null,
    hubs,
    hubNames: hubs.map((h) => config.hubs?.[h] ?? h),
    returnHubNames: returnHubs.map((h) => config.hubs?.[h] ?? h),
    carriers,
    carrierNames: carriers.map(name),
    convenient: !!raw.convenient,
    foundAt: raw.found_at ? raw.found_at * 1000 : null,
    link: raw.ticket_link ? AVIASALES + raw.ticket_link : null,
    allowed: reason === null,
    reason,
    reasonDetail,
    reasonDetailName: reasonDetail ? name(reasonDetail) : null,
  };
}

const ddmm = (iso) => iso.slice(8, 10) + iso.slice(5, 7);

// Короткая ссылка на выдачу Aviasales: MOW0112RIO1 или MOW0112RIO05012
export function buildSearchLink({ origin, destination, depart, ret, adults }) {
  return `${AVIASALES}/${origin}${ddmm(depart)}${destination}${ret ? ddmm(ret) : ''}${adults}`;
}

export function priceFor(offer, adults) {
  return { price: offer.price * adults, estimated: adults > 1 };
}

// Группирует предложения по дате вылета: лучший, варианты, самый дешёвый вообще
export function groupByDate(offers, config) {
  const byDate = new Map();
  for (const o of offers) {
    if (!byDate.has(o.date)) byDate.set(o.date, []);
    byDate.get(o.date).push(o);
  }
  const days = {};
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.price - b.price);
    const allowed = list.filter((o) => o.allowed);
    days[date] = {
      best: allowed[0] ?? null,
      options: allowed.slice(0, config.dayOptionsLimit ?? 10),
      cheapestAny: list[0],
      total: list.length,
      allowedCount: allowed.length,
    };
  }
  return days;
}

// n самых дешёвых подходящих дней в каждом месяце, по порядку месяцев
export function cheapestDates(days, n) {
  const byMonth = new Map();
  for (const [date, d] of Object.entries(days)) {
    if (!d?.best) continue;
    const m = date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push([date, d.best.price]);
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
