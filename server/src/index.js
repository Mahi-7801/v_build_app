require('dotenv').config();
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./db');
const { loadSettings, publicConfig } = require('./points');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
const CACHEABLE = ['/explore', '/strings', '/languages', '/exercises', '/plans'];
app.set('clearReadCache', () => readCache.clear());

// Gzip JSON API payloads >= 1 KB when the client supports gzip (zero extra deps).
app.use('/api', (req, res, next) => {
  const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
  const json = res.json.bind(res);
  res.json = (body) => {
    if (!acceptsGzip || res.headersSent) return json(body);
    const payload = Buffer.from(JSON.stringify(body));
    if (payload.length < 1024) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(payload);
    }
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return zlib.gzip(payload, (err, zipped) => {
      if (err) {
        res.removeHeader('Content-Encoding');
        return res.send(payload);
      }
      return res.send(zipped);
    });
  };
  return next();
});

app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' || !CACHEABLE.some((p) => req.path.startsWith(p))) return next();
  if (/^\/exercises\/\d+\/lottie/.test(req.path)) return next();
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
app.get('/api/config/public', async (_req, res) => {
  const config = publicConfig();
  // Lets every signed-in device notice a newly added / edited workout.
  try {
    const row = await db.one('SELECT COUNT(*) AS n, MAX(updated_at) AS touched FROM workout_plans');
    const latest = await db.one(
      'SELECT id, code, name, category, level, created_at, updated_at FROM workout_plans ORDER BY updated_at DESC, id DESC LIMIT 1'
    );
    const touchedMs = new Date(row?.touched || 0).getTime();
    config.catalogRevision = `${Number(row?.n || 0)}-${touchedMs}-${Number(latest?.id || 0)}`;
    config.latestWorkout = latest?.name || '';
    config.latestWorkoutId = latest ? Number(latest.id) : null;
    config.latestWorkoutCode = latest?.code || null;
    config.latestWorkoutCategory = latest?.category || null;
    config.latestWorkoutLevel = latest ? Number(latest.level || 1) : null;
    config.latestWorkoutCount = Number(row?.n || 0);
    if (latest) {
      const createdMs = new Date(latest.created_at || 0).getTime();
      const updatedMs = new Date(latest.updated_at || 0).getTime();
      config.latestWorkoutIsNew = Math.abs(updatedMs - createdMs) <= 2000;
    } else {
      config.latestWorkoutIsNew = false;
    }
  } catch {
    config.catalogRevision = '';
    config.latestWorkout = '';
    config.latestWorkoutId = null;
    config.latestWorkoutCode = null;
    config.latestWorkoutCategory = null;
    config.latestWorkoutLevel = null;
    config.latestWorkoutCount = 0;
    config.latestWorkoutIsNew = false;
  }
  res.json(config);
});

// Animations uploaded from the admin panel (public, read-only).
app.get('/api/assets/animations/:file', (req, res) => {
  const name = String(req.params.file).replace(/[^a-zA-Z0-9._-]/g, '');
  const file = path.resolve(__dirname, 'uploads', 'animations', name);
  if (!name || !file.startsWith(path.resolve(__dirname, 'uploads', 'animations'))) {
    return res.status(400).json({ error: 'invalid_file' });
  }
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
  const type = file.endsWith('.gif') ? 'image/gif'
    : file.endsWith('.json') ? 'application/json' : 'image/png';
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type(type);
  res.sendFile(file);
});

// Sound cues uploaded from the admin panel (public, read-only).
app.get('/api/assets/audio/:file', (req, res) => {
  const name = String(req.params.file).replace(/[^a-zA-Z0-9._-]/g, '');
  const dir = path.resolve(__dirname, 'uploads', 'audio');
  const file = path.resolve(dir, name);
  if (!name || !file.startsWith(dir)) return res.status(400).json({ error: 'invalid_file' });
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
  const ext = path.extname(file).toLowerCase();
  const types = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
    '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.webm': 'audio/webm',
  };
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type(types[ext] || 'application/octet-stream');
  res.sendFile(file);
});

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
// Browser redirect from Razorpay has no Bearer token, so it is mounted separately.
app.get('/api/payments/callback', require('./routes/paymentCallback'));
app.use('/api/payments', require('./routes/payments'));
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
  (async () => {
    const bootstrap = require('./bootstrap');
    await bootstrap().catch((e) => console.error('[bootstrap] failed:', e.message));
    await loadSettings().catch(() => {});
    app.listen(config.port, config.host, () => {
      console.log(`home-workout API listening on http://${config.host}:${config.port} (${config.env})`);
    });
  })();
}

module.exports = app;
