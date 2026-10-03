// Локальный запуск: npm start
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { createClient } from './travelpayouts.js';
import { config } from '../config.js';

const token = process.env.TP_TOKEN;
if (!token || token.startsWith('вставьте')) {
  console.error('Нет токена Travelpayouts.');
  console.error('Скопируйте .env.example в .env и вставьте TP_TOKEN из профиля travelpayouts.com (раздел «API token»).');
  process.exit(1);
}

const client = createClient({ token, ttlMs: config.cacheTtlMs });
const app = createApp({ config, getClient: () => client });
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`Рио Радар запущен: http://localhost:${port}`));
