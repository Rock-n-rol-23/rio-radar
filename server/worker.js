// Точка входа для Cloudflare Workers. Статика отдаётся через [assets] в wrangler.toml.
import { createApp } from './app.js';
import { createClient } from './travelpayouts.js';
import { config } from '../config.js';

let client = null;
const app = createApp({
  config,
  getClient: (c) => (client ??= createClient({ token: c.env.TP_TOKEN, ttlMs: config.cacheTtlMs })),
});

// Файл цен Google Flights обновляет задание GitHub Actions и кладёт в репозиторий.
// Читаем его оттуда, чтобы не перевыкладывать сайт каждый день; при сбое берём копию из assets.
const GOOGLE_JSON = 'https://raw.githubusercontent.com/Rock-n-rol-23/rio-radar/master/public/data/google.json';
app.get('/data/google.json', async (c) => {
  try {
    const res = await fetch(GOOGLE_JSON, { cf: { cacheTtl: 900, cacheEverything: true } });
    if (res.ok) {
      return new Response(res.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900' } });
    }
  } catch { /* падаем на копию из assets */ }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
