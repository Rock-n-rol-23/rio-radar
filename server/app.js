// HTTP-маршруты. Не знает, где запущен: Node или Cloudflare Workers.
import { Hono } from 'hono';
import { normalizeOffer, cheapestDates, daysBetween } from './offers.js';
import { SourceError } from './travelpayouts.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthsBetween(a, b) {
  const out = [];
  let cur = a.slice(0, 7);
  while (cur <= b.slice(0, 7)) {
    out.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  }
  return out;
}

export function createApp({ config, getClient }) {
  const app = new Hono();
  const inPeriod = (iso) => config.months.includes(iso.slice(0, 7));
  const common = {
    origin: config.origin,
    destination: config.destination,
    currency: config.currency,
    market: config.market,
  };

  async function loadCalendar(client) {
    const results = await Promise.all(config.months.map((m) =>
      client.groupedPrices({ ...common, group_by: 'departure_at', departure_at: m, direct: 'false' })));
    const days = {};
    for (const r of results) {
      for (const [date, raw] of Object.entries(r.data || {})) days[date] = normalizeOffer(raw, config);
    }
    const daysTotal = config.months.reduce((s, m) => s + monthDays(m), 0);
    const offers = Object.values(days);
    return {
      months: config.months,
      days,
      cheapest: cheapestDates(days, 3),
      stale: results.some((r) => r.stale),
      fetchedAt: Math.min(...results.map((r) => r.fetchedAt)),
      stats: {
        daysTotal,
        daysWithData: offers.length,
        daysAllowed: offers.filter((o) => o.allowed).length,
      },
    };
  }

  app.onError((err, c) => {
    if (err instanceof SourceError) return c.json({ error: 'source_unavailable', message: err.message }, 503);
    console.error(err);
    return c.json({ error: 'internal', message: err.message }, 500);
  });

  app.get('/api/calendar', async (c) => c.json(await loadCalendar(getClient(c))));

  app.get('/api/status', async (c) => {
    const cal = await loadCalendar(getClient(c));
    return c.json({ fetchedAt: cal.fetchedAt, stale: cal.stale, ...cal.stats });
  });

  app.get('/api/roundtrip', async (c) => {
    const q = c.req.query();
    const depart = q.depart;
    if (!ISO.test(depart || '') || !inPeriod(depart)) return c.json({ error: 'bad_depart' }, 400);
    const client = getClient(c);
    const search = { ...common, departure_at: depart, one_way: 'false', direct: 'false', sorting: 'price' };
    let raws, stale, fetchedAt;
    let minDays = null;
    let maxDays = null;

    if (q.return) {
      if (!ISO.test(q.return) || q.return <= depart) return c.json({ error: 'bad_return' }, 400);
      const r = await client.pricesForDates({ ...search, return_at: q.return, limit: 100 });
      raws = r.data; stale = r.stale; fetchedAt = r.fetchedAt;
    } else {
      minDays = Number(q.minDays);
      maxDays = Number(q.maxDays);
      if (!(minDays >= 1 && maxDays >= minDays && maxDays <= 60)) return c.json({ error: 'bad_window' }, 400);
      const months = monthsBetween(addDays(depart, minDays), addDays(depart, maxDays));
      const rs = await Promise.all(months.map((m) => client.pricesForDates({ ...search, return_at: m, limit: 1000 })));
      raws = rs.flatMap((r) => r.data || []);
      stale = rs.some((r) => r.stale);
      fetchedAt = Math.min(...rs.map((r) => r.fetchedAt));
    }

    const all = (raws || []).map((r) => normalizeOffer(r, config)).filter((o) => o.date === depart && o.returnDate);
    const inWindow = minDays === null
      ? all
      : all.filter((o) => { const d = daysBetween(o.date, o.returnDate); return d >= minDays && d <= maxDays; });
    const allowed = inWindow.filter((o) => o.allowed).sort((a, b) => a.price - b.price);
    const limit = minDays === null ? config.roundtripLimit : config.durationLimit;
    return c.json({ offers: allowed.slice(0, limit), hidden: inWindow.length - allowed.length, stale, fetchedAt });
  });

  return app;
}
