// Демо-клиент: правдоподобные данные без токена (TP_TOKEN=demo).
// Детерминированный: одинаковые запросы дают одинаковые ответы.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AIRLINES = ['EK', 'EK', 'QR', 'QR', 'TK', 'TK', 'ET', 'EY', 'SU', 'G9', 'FZ', 'CA', 'PC'];
const HUBS = { EK: 'DXB', QR: 'DOH', TK: 'IST', ET: 'ADD', EY: 'AUH', SU: 'IST', G9: 'SHJ', FZ: 'DXB', CA: 'PEK', PC: 'SAW' };
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ticket(r, { origin, destination, date, returnDate }) {
  const airline = pick(r, AIRLINES);
  const transfers = r() < 0.55 ? 1 : r() < 0.85 ? 2 : 3;
  const base = 52000 + Math.floor(r() * 90000);
  const one = {
    origin, destination,
    origin_airport: pick(r, ['SVO', 'SVO', 'VKO', 'DME']),
    destination_airport: pick(r, ['GIG', 'GIG', 'SDU']),
    price: returnDate ? Math.floor(base * 1.9) : base,
    airline, flight_number: String(100 + Math.floor(r() * 900)),
    departure_at: `${date}T${String(1 + Math.floor(r() * 22)).padStart(2, '0')}:${pick(r, ['00', '15', '30', '45'])}:00+03:00`,
    return_at: returnDate ? `${returnDate}T${String(8 + Math.floor(r() * 12)).padStart(2, '0')}:30:00-03:00` : '',
    transfers,
    return_transfers: returnDate ? (r() < 0.6 ? 1 : 2) : 0,
    duration: 900 + transfers * 240 + Math.floor(r() * 600),
    link: `/search/${origin}${date.slice(8, 10)}${date.slice(5, 7)}${destination}1?t=demo_${HUBS[airline]}`,
  };
  return one;
}

export function createDemoClient() {
  return {
    async groupedPrices(p) {
      const r = rng(hash('g' + p.departure_at));
      const data = {};
      const n = monthDays(p.departure_at);
      for (let d = 1; d <= n; d++) {
        if (r() < 0.35) continue;
        const date = `${p.departure_at}-${String(d).padStart(2, '0')}`;
        data[date] = ticket(r, { origin: p.origin, destination: p.destination, date });
      }
      return { data, stale: false, fetchedAt: Date.now() };
    },
    async pricesForDates(p) {
      const r = rng(hash('p' + p.departure_at + p.return_at));
      const data = [];
      const exact = p.return_at.length === 10;
      const count = exact ? 4 + Math.floor(r() * 4) : 10 + Math.floor(r() * 10);
      const n = exact ? 1 : monthDays(p.return_at);
      for (let i = 0; i < count; i++) {
        const returnDate = exact ? p.return_at : `${p.return_at}-${String(1 + Math.floor(r() * n)).padStart(2, '0')}`;
        if (returnDate <= p.departure_at) continue;
        data.push(ticket(r, { origin: p.origin, destination: p.destination, date: p.departure_at, returnDate }));
      }
      return { data, stale: false, fetchedAt: Date.now() };
    },
    get lastSuccessAt() { return Date.now(); },
  };
}
