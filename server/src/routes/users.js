const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { decorateUser } = require('../points');

const router = express.Router();
router.use(requireAuth);

/** Profile + settings, mirroring the original SharedPreferences state. */
router.get('/me', async (req, res, next) => {
  try {
    const settings = await db.one('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
    res.json({ user: req.user, settings: settings || null });
  } catch (e) { next(e); }
});

const ALLOWED = new Set([
  'display_name', 'avatar_url', 'country_code', 'phone',
]);

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i;

function normalizeAvatarUrl(raw) {
  if (raw === null || raw === '') return { ok: true, value: null };
  const value = String(raw || '').trim();
  if (!value) return { ok: true, value: null };
  // Never store local device paths — images must be uploaded as data URIs or HTTPS URLs.
  if (/^(file|content|ph|assets-library):\/\//i.test(value)) {
    return { ok: false, message: 'Please pick the image again so it can be uploaded cleanly.' };
  }
  const m = value.match(DATA_URL_RE);
  if (m) {
    const cleanB64 = m[2].replace(/\s+/g, '');
    const decodedBytes = Math.floor((cleanB64.length * 3) / 4);
    if (!cleanB64 || decodedBytes > MAX_AVATAR_BYTES) {
      return { ok: false, message: 'Profile photo must be smaller than 3 MB.' };
    }
    return { ok: true, value: `data:image/${m[1].toLowerCase()};base64,${cleanB64}` };
  }
  if (/^(https?:\/\/|\/api\/)/i.test(value) && value.length <= 2048) {
    return { ok: true, value };
  }
  return { ok: false, message: 'Invalid profile image format. Choose a JPG, PNG or WebP image.' };
}

router.patch('/me', async (req, res, next) => {
  try {
    const sets = [];
    const vals = [];
    const body = req.body || {};
    if (body.email !== undefined) {
      const nextEmail = String(body.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
        return res.status(400).json({ error: 'validation_error', message: 'Enter a valid email address' });
      }
      if (nextEmail !== String(req.user.email || '').toLowerCase()) {
        const taken = await db.one('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?', [nextEmail, req.user.id]);
        if (taken) return res.status(409).json({ error: 'email_taken', message: 'That email is already in use' });
        sets.push('`email` = ?');
        vals.push(nextEmail);
      }
    }
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED.has(k)) continue;
      if (k === 'avatar_url') {
        const parsed = normalizeAvatarUrl(v);
        if (!parsed.ok) return res.status(400).json({ error: 'validation_error', message: parsed.message });
        sets.push('`avatar_url` = ?');
        vals.push(parsed.value);
      } else if (k === 'display_name') {
        const cleanName = String(v || '').trim().slice(0, 120);
        if (!cleanName) return res.status(400).json({ error: 'validation_error', message: 'Name is required' });
        sets.push('`display_name` = ?');
        vals.push(cleanName);
      } else if (k === 'phone') {
        sets.push('`phone` = ?');
        vals.push(String(v || '').trim().slice(0, 40) || null);
      } else {
        sets.push(`\`${k}\` = ?`);
        vals.push(v);
      }
    }
    if (!sets.length) return res.json({ user: req.user });
    vals.push(req.user.id);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    const user = decorateUser(await db.one('SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, pro_expires_at, points FROM users WHERE id = ?', [req.user.id]));
    res.json({ user });
  } catch (e) { next(e); }
});

/** Dedicated profile photo upload endpoint backed by MySQL MEDIUMTEXT storage. */
router.post('/me/avatar', async (req, res, next) => {
  try {
    const b = req.body || {};
    const mime = String(b.mimeType || 'image/jpeg').toLowerCase().replace('image/jpg', 'image/jpeg');
    const candidate = b.dataUri || (b.base64 ? `data:${mime};base64,${String(b.base64).replace(/^data:[^,]+,/, '')}` : null);
    const parsed = normalizeAvatarUrl(candidate);
    if (!parsed.ok || !parsed.value) {
      return res.status(400).json({ error: 'validation_error', message: parsed.message || 'Image data required' });
    }
    await db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [parsed.value, req.user.id]);
    const user = decorateUser(await db.one('SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, pro_expires_at, points FROM users WHERE id = ?', [req.user.id]));
    res.json({ user, avatar_url: user?.avatar_url || null });
  } catch (e) { next(e); }
});

/** Store user feature suggestions in MySQL. */
router.post('/feedback', async (req, res, next) => {
  try {
    const b = req.body || {};
    const features = Array.isArray(b.features)
      ? b.features.map((f) => String(f || '').trim().slice(0, 80)).filter(Boolean).slice(0, 20)
      : [];
    const note = String(b.note || '').trim().slice(0, 500) || null;
    if (!features.length && !note) {
      return res.status(400).json({ error: 'validation_error', message: 'Pick at least one feature' });
    }
    await db.query(
      'INSERT INTO feature_suggestions (user_id, features_json, note) VALUES (?, ?, ?)',
      [req.user.id, JSON.stringify(features), note]
    );
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

const SETTING_FIELDS = [
  'weight_kg', 'height_cm', 'age', 'gender', 'goal_type', 'goal_weight_kg', 'difficulty',
  'units', 'language', 'theme', 'voice_enabled', 'voice_rate', 'sound_enabled',
  'vibration_enabled', 'keep_screen_on', 'rest_multiplier', 'auto_start_next', 'countdown_sound',
  'google_fit_enabled', 'health_connect_on', 'onboarding_complete',
];

router.put('/me/settings', async (req, res, next) => {
  try {
    const body = req.body || {};
    const sets = [];
    const vals = [];
    for (const k of SETTING_FIELDS) {
      if (!(k in body)) continue;
      sets.push(`\`${k}\` = ?`);
      vals.push(body[k]);
    }
    if (!sets.length) {
      const current = await db.one('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
      return res.json({ settings: current });
    }
    await db.query(
      `INSERT INTO user_settings (user_id) VALUES (?) ON DUPLICATE KEY UPDATE ${sets.join(', ')}`,
      [req.user.id, ...vals]
    );
    const settings = await db.one('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
    res.json({ settings });
  } catch (e) { next(e); }
});

/** Lightweight dashboard payload so the home screen needs one round trip. */
router.get('/me/dashboard', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [[totals], [streakRow], activePlans, recent] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM(duration_sec),0) AS total_seconds,
                COALESCE(SUM(total_calories),0) AS total_calories
         FROM workout_sessions WHERE user_id = ? AND status = 'completed'`,
        [uid]
      ),
      db.query(
        `SELECT COUNT(*) AS streak FROM (
           SELECT DATE(started_at) d FROM workout_sessions
           WHERE user_id = ? AND status='completed' GROUP BY DATE(started_at)
         ) t WHERE d >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`,
        [uid]
      ),
      db.query(
        `SELECT up.*, wp.code, wp.name, wp.cover_image, wp.category, wp.level
         FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
         WHERE up.user_id = ? AND up.completed_at IS NULL ORDER BY up.last_workout_at DESC LIMIT 5`,
        [uid]
      ),
      db.query(
        `SELECT id, title, started_at, duration_sec, total_calories, exercises_done
         FROM workout_sessions WHERE user_id = ? AND status='completed'
         ORDER BY started_at DESC LIMIT 5`,
        [uid]
      ),
    ]);
    res.json({
      totals: totals || { sessions: 0, total_seconds: 0, total_calories: 0 },
      streak: Number(streakRow?.streak || 0),
      activePlans,
      recentSessions: recent,
    });
  } catch (e) { next(e); }
});

module.exports = router;
