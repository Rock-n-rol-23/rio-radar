// Демо-клиент: правдоподобные данные в форме GraphQL-ответа без токена (TP_TOKEN=demo).
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

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// Шаблоны маршрутов: основной перевозчик и плечи (перевозчик, аэропорт прилёта)
const ROUTES = [
  { main: 'EK', legs: [['EK', 'DXB'], ['EK', 'GIG']], base: 175000 },
  { main: 'EK', legs: [['EK', 'DXB'], ['EK', 'GRU'], ['AD', 'GIG']], base: 160000 },
  { main: 'QR', legs: [['QR', 'DOH'], ['QR', 'GRU'], ['LA', 'GIG']], base: 150000 },
  { main: 'QR', legs: [['QR', 'DOH'], ['QR', 'GIG']], base: 185000 },
  { main: 'TK', legs: [['TK', 'IST'], ['TK', 'GRU'], ['LA', 'GIG']], base: 140000 },
  { main: 'TK', legs: [['DP', 'IST'], ['TK', 'GRU'], ['LA', 'GIG']], base: 120000 },
  { main: 'TK', legs: [['PC', 'SAW'], ['TK', 'GRU'], ['G3', 'GIG']], base: 115000 },
  { main: 'ET', legs: [['ET', 'ADD'], ['ET', 'GRU'], ['G3', 'GIG']], base: 110000 },
  { main: 'EY', legs: [['EY', 'AUH'], ['EY', 'GRU'], ['AD', 'GIG']], base: 165000 },
  { main: 'AT', legs: [['AT', 'CMN'], ['AT', 'GRU'], ['LA', 'GIG']], base: 75000 },
  { main: 'TP', legs: [['VF', 'SAW'], ['TP', 'LIS'], ['TP', 'GIG']], base: 68000 },
  { main: 'LA', legs: [['PC', 'IST'], ['LA', 'MAD'], ['LA', 'GRU'], ['LA', 'GIG']], base: 72000 },
  { main: 'AF', legs: [['J2', 'GYD'], ['AF', 'CDG'], ['AF', 'GIG']], base: 95000 },
];

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function legsFor(r, tpl, origin, date, hourStart) {
  let from = origin;
  let hour = hourStart;
  return tpl.legs.map(([carrier, to]) => {
    const dep = `${date}T${String(hour % 24).padStart(2, '0')}:${pick(r, ['00', '15', '30', '45'])}:00`;
    hour += 3 + Math.floor(r() * 10);
    const leg = { origin: from, destination: to, operating_carrier: carrier, flight_number: String(100 + Math.floor(r() * 900)), departure_at: dep, arrival_at: dep };
    from = to;
    return leg;
  });
}

function ticket(r, { date, returnDate }) {
  const tpl = pick(r, ROUTES);
  const out = legsFor(r, tpl, pick(r, ['SVO', 'SVO', 'VKO', 'DME']), date, 1 + Math.floor(r() * 20));
  const segments = [{ flight_legs: out }];
  let value = tpl.base * (0.85 + r() * 0.5);
  if (returnDate) {
    const back = legsFor(r, { legs: tpl.legs.slice().reverse().map(([c], i, arr) => [c, i === arr.length - 1 ? 'SVO' : tpl.legs[arr.length - 2 - i][1]]) }, 'GIG', returnDate, 8 + Math.floor(r() * 10));
    segments.push({ flight_legs: back });
    value *= 1.8;
  }
  return {
    departure_at: `${date}T${out[0].departure_at.slice(11)}+03:00`,
    return_at: returnDate ? `${returnDate}T${segments[1].flight_legs[0].departure_at.slice(11)}-03:00` : '',
    value: Math.round(value * 100) / 100,
    number_of_changes: tpl.legs.length - 1,
    main_airline: tpl.main,
    duration: 900 + (tpl.legs.length - 1) * 240 + Math.floor(r() * 600),
    convenient: tpl.legs.length <= 2 && r() < 0.7,
    found_at: Math.floor(Date.now() / 1000) - Math.floor(r() * 36 * 3600),
    origin_airport_iata: out[0].origin,
    destination_airport_iata: 'GIG',
    ticket_link: `/MOW${date.slice(8, 10)}${date.slice(5, 7)}RIO${returnDate ? returnDate.slice(8, 10) + returnDate.slice(5, 7) : ''}1?t=demo`,
    segments,
  };
}

export function createDemoClient() {
  return {
    async pricesOneWay(p) {
      const months = p.depart_months.length ? p.depart_months.map((m) => m.slice(0, 7)) : [...new Set(p.depart_dates.map((d) => d.slice(0, 7)))];
      const data = [];
      for (const ym of months) {
        const r = rng(hash('o' + ym));
        const n = monthDays(ym);
        for (let d = 1; d <= n; d++) {
          const date = `${ym}-${String(d).padStart(2, '0')}`;
          if (p.depart_dates.length && !p.depart_dates.includes(date)) continue;
          if (r() < 0.12) continue;
          const count = 3 + Math.floor(r() * 9);
          for (let i = 0; i < count; i++) data.push(ticket(r, { date }));
        }
      }
      return { data, stale: false, fetchedAt: Date.now() };
    },
    async pricesRoundTrip(p) {
      const depart = p.depart_dates[0];
      const r = rng(hash('r' + depart + JSON.stringify(p.return_dates) + p.trip_duration_min + p.trip_duration_max));
      const data = [];
      const base = new Date(depart + 'T00:00:00Z');
      const count = p.return_dates.length ? 8 + Math.floor(r() * 8) : 25 + Math.floor(r() * 25);
      for (let i = 0; i < count; i++) {
        let returnDate;
        if (p.return_dates.length) returnDate = p.return_dates[0];
        else {
          const len = p.trip_duration_min + Math.floor(r() * (p.trip_duration_max - p.trip_duration_min + 1));
          const d = new Date(base); d.setUTCDate(d.getUTCDate() + len);
          returnDate = d.toISOString().slice(0, 10);
        }
        data.push(ticket(r, { date: depart, returnDate }));
      }
      return { data, stale: false, fetchedAt: Date.now() };
    },
    get lastSuccessAt() { return Date.now(); },
  };
}
