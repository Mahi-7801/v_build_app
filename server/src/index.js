require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./db');
const { loadSettings, getSettings } = require('./points');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
app.use(express.json({ limit: '12mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

// ---- health -----------------------------------------------------------
app.get('/health', async (_req, res) => {
  try {
    const ok = await db.healthcheck();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', db: ok, time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: false, error: e.message });
  }
});

// ---- lightweight read cache for public catalogue endpoints -------------
// These change only when content is seeded, so a short TTL removes repeated
// MySQL work for the home/workout/exercise screens.
const readCache = new Map();
const READ_TTL = 60_000;
const CACHEABLE = ['/explore', '/strings', '/languages', '/exercises/meta', '/plans/meta'];
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' || !CACHEABLE.some((p) => req.path.startsWith(p))) return next();
  const key = req.originalUrl;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL) return res.json(hit.body);
  const json = res.json.bind(res);
  res.json = (body) => {
    readCache.set(key, { at: Date.now(), body });
    return json(body);
  };
  return next();
});

// Public, admin-editable settings (points target / PRO reward).
app.get('/api/config/public', (_req, res) => res.json(getSettings()));

// ---- routes -----------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/explore', require('./routes/explore'));
app.use('/api/strings', require('./routes/strings'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/history', require('./routes/history'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/achievements', require('./routes/achievements'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/health', require('./routes/health'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.code || 'server_error', message: err.message });
});

if (require.main === module) {
  loadSettings().finally(() => {
    app.listen(config.port, config.host, () => {
      console.log(`home-workout API listening on http://${config.host}:${config.port} (${config.env})`);
    });
  });
}

module.exports = app;
