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

router.patch('/me', async (req, res, next) => {
  try {
    const sets = [];
    const vals = [];
    const body = req.body || {};
    if (body.email && body.email !== req.user.email) {
      const taken = await db.one('SELECT id FROM users WHERE email = ?', [body.email]);
      if (taken) return res.status(409).json({ error: 'email_taken', message: 'That email is already in use' });
      sets.push('`email` = ?');
      vals.push(body.email);
    }
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED.has(k)) continue;
      sets.push(`\`${k}\` = ?`);
      vals.push(v);
    }
    if (!sets.length) return res.json({ user: req.user });
    vals.push(req.user.id);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    const user = decorateUser(await db.one('SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, pro_expires_at, points FROM users WHERE id = ?', [req.user.id]));
    res.json({ user });
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
    const [totals] = await db.query(
      `SELECT COUNT(*) AS sessions,
              COALESCE(SUM(duration_sec),0) AS total_seconds,
              COALESCE(SUM(total_calories),0) AS total_calories
       FROM workout_sessions WHERE user_id = ? AND status = 'completed'`,
      [uid]
    );
    const [streakRow] = await db.query(
      `SELECT COUNT(*) AS streak FROM (
         SELECT DATE(started_at) d FROM workout_sessions
         WHERE user_id = ? AND status='completed' GROUP BY DATE(started_at)
       ) t WHERE d >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)`,
      [uid]
    );
    const activePlans = await db.query(
      `SELECT up.*, wp.code, wp.name, wp.cover_image, wp.category, wp.level
       FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
       WHERE up.user_id = ? AND up.completed_at IS NULL ORDER BY up.last_workout_at DESC LIMIT 5`,
      [uid]
    );
    const recent = await db.query(
      `SELECT id, title, started_at, duration_sec, total_calories, exercises_done
       FROM workout_sessions WHERE user_id = ? AND status='completed'
       ORDER BY started_at DESC LIMIT 5`,
      [uid]
    );
    res.json({
      totals: totals || { sessions: 0, total_seconds: 0, total_calories: 0 },
      activePlans,
      recentSessions: recent,
    });
  } catch (e) { next(e); }
});

module.exports = router;
