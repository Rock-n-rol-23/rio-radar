// HTTP-маршруты. Не знает, где запущен: Node или Cloudflare Workers.
import { Hono } from 'hono';
import { normalizeOffer, groupByDate, cheapestDates, daysBetween } from './offers.js';
import { SourceError } from './travelpayouts.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function createApp({ config, getClient, demo = false }) {
  const app = new Hono();
  const inPeriod = (iso) => config.months.includes(iso.slice(0, 7));
  const route = { origin: config.origin, destination: config.destination };

  async function loadCalendar(client) {
    const results = await Promise.all(config.months.map((m) =>
      client.pricesOneWay({ ...route, depart_months: [`${m}-01`], depart_dates: [] })));
    const offers = results.flatMap((r) => r.data || []).map((raw) => normalizeOffer(raw, config));
    const days = groupByDate(offers, config);
    const daysTotal = config.months.reduce((s, m) => s + monthDays(m), 0);
    const entries = Object.values(days);
    return {
      demo,
      months: config.months,
      hubs: config.hubs ?? {},
      shopping: config.hubShopping ?? {},
      airlineSites: config.airlineSites ?? {},
      days,
      cheapest: cheapestDates(days, 3),
      stale: results.some((r) => r.stale),
      fetchedAt: Math.min(...results.map((r) => r.fetchedAt)),
      stats: {
        daysTotal,
        daysWithData: entries.length,
        daysAllowed: entries.filter((d) => d.best).length,
        offersTotal: offers.length,
        offersAllowed: offers.filter((o) => o.allowed).length,
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
    return c.json({ demo, fetchedAt: cal.fetchedAt, stale: cal.stale, ...cal.stats });
  });

  app.get('/api/roundtrip', async (c) => {
    const q = c.req.query();
    const depart = q.depart;
    if (!ISO.test(depart || '') || !inPeriod(depart)) return c.json({ error: 'bad_depart' }, 400);
    const client = getClient(c);
    let params;
    let minDays = null;
    let maxDays = null;

    if (q.return) {
      if (!ISO.test(q.return) || q.return <= depart) return c.json({ error: 'bad_return' }, 400);
      params = { ...route, depart_months: [], depart_dates: [depart], return_dates: [q.return] };
    } else {
      minDays = Number(q.minDays);
      maxDays = Number(q.maxDays);
      if (!(minDays >= 1 && maxDays >= minDays && maxDays <= 60)) return c.json({ error: 'bad_window' }, 400);
      params = { ...route, depart_months: [], depart_dates: [depart], return_dates: [], trip_duration_min: minDays, trip_duration_max: maxDays };
    }

    const r = await client.pricesRoundTrip(params);
    const all = (r.data || []).map((raw) => normalizeOffer(raw, config)).filter((o) => o.date === depart && o.returnDate);
    // Источник не фильтрует по дате возврата и отдаёт все билеты с этой датой вылета.
    // Для точной даты сначала ищем совпадение, иначе ближайшие даты возврата (±3 дня).
    let nearby = false;
    let inWindow;
    if (minDays === null) {
      inWindow = all.filter((o) => o.returnDate === q.return);
      if (!inWindow.length) {
        nearby = true;
        inWindow = all.filter((o) => Math.abs(daysBetween(q.return, o.returnDate)) <= 3);
      }
    } else {
      inWindow = all.filter((o) => { const d = daysBetween(o.date, o.returnDate); return d >= minDays && d <= maxDays; });
    }
    // Одинаковые по цене/перевозчику/датам билеты (разные внутренние плечи) схлопываем
    const seen = new Set();
    const byDuration = q.sort === 'duration';
    const allowed = inWindow.filter((o) => o.allowed)
      .sort((a, b) => byDuration ? (a.durationMin ?? 1e9) - (b.durationMin ?? 1e9) || a.price - b.price : a.price - b.price)
      .filter((o) => {
      const k = `${o.price}|${o.airline}|${o.returnDate}|${o.transfers}|${o.returnTransfers}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const limit = minDays === null ? config.roundtripLimit : config.durationLimit;
    return c.json({
      offers: allowed.slice(0, limit),
      hidden: inWindow.filter((o) => !o.allowed).length,
      nearby,
      stale: r.stale,
      fetchedAt: r.fetchedAt,
    });
  });

  return app;
}
