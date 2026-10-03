// Точка входа для Cloudflare Workers. Статика отдаётся через [assets] в wrangler.toml.
import { createApp } from './app.js';
import { createClient } from './travelpayouts.js';
import { config } from '../config.js';

let client = null;
const app = createApp({
  config,
  getClient: (c) => (client ??= createClient({ token: c.env.TP_TOKEN, ttlMs: config.cacheTtlMs })),
});

export default app;
