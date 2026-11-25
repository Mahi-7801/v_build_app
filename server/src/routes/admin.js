const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { decorateUser, getSettings, setSettings } = require('../points');

const router = express.Router();
router.use(requireAuth, requireAdmin);

/** Admin-editable points target and PRO reward values. */
router.get('/settings', (_req, res) => res.json({ settings: getSettings() }));

router.patch('/settings', async (req, res, next) => {
  try {
    const b = req.body || {};
    const next = { ...getSettings() };
    const values = [];
    if (b.pointsTarget !== undefined) {
      next.pointsTarget = Math.max(1, Math.round(Number(b.pointsTarget) || next.pointsTarget));
      values.push(['points_target', String(next.pointsTarget)]);
    }
    if (b.discountPercent !== undefined) {
      next.discountPercent = Math.min(100, Math.max(0, Math.round(Number(b.discountPercent))));
      values.push(['pro_discount_percent', String(next.discountPercent)]);
    }
    if (b.proPriceCents !== undefined) {
      next.proPriceCents = Math.max(0, Math.round(Number(b.proPriceCents)));
      values.push(['pro_price_cents', String(next.proPriceCents)]);
    }
    for (const [key, value] of values) {
      await db.query(
        'INSERT INTO app_config (config_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, value]
      );
    }
    setSettings(next);
    res.json({ settings: getSettings() });
  } catch (e) { next(e); }
});

/** Dashboard counters. */
router.get('/overview', async (_req, res, next) => {
  try {
    const [u, p, s, a] = await Promise.all([
      db.one('SELECT COUNT(*) AS n, COALESCE(SUM(points),0) AS points FROM users'),
      db.one('SELECT COUNT(*) AS n FROM workout_plans'),
      db.one(`SELECT COUNT(*) AS n,
                     COALESCE(SUM(duration_sec),0) AS seconds,
                     COALESCE(SUM(total_calories),0) AS calories
              FROM workout_sessions WHERE status = 'completed'`),
      db.one('SELECT COUNT(*) AS n FROM points_ledger'),
    ]);
    res.json({
      users: u.n, plans: p.n, sessions: s.n,
      totalPoints: Number(u.points), totalMinutes: Math.round(s.seconds / 60),
      totalCalories: Math.round(s.calories), pointEntries: a.n,
    });
  } catch (e) { next(e); }
});

/** All accounts with their progress totals. */
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await db.query(
      `SELECT u.id, u.email, u.display_name, u.is_pro, u.points, u.created_at,
              COUNT(s.id) AS sessions,
              COALESCE(SUM(s.duration_sec),0) AS seconds,
              COALESCE(SUM(s.total_calories),0) AS calories
       FROM users u LEFT JOIN workout_sessions s ON s.user_id = u.id AND s.status = 'completed'
       WHERE (? = '' OR u.email LIKE ? OR u.display_name LIKE ?)
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`,
      [q, `%${q}%`, `%${q}%`]
    );
    res.json({ users: rows.map(decorateUser) });
  } catch (e) { next(e); }
});

/** Everything about one user: profile, workouts, progress, achievements, points. */
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await db.one(
      'SELECT id, email, display_name, avatar_url, is_pro, pro_expires_at, points, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'not_found' });
    const [workouts, plans, summary, achievements, ledger] = await Promise.all([
      db.query(
        `SELECT id, title, status, started_at, completed_at, duration_sec,
                total_calories, exercises_done, exercises_total
         FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 100`,
        [user.id]
      ),
      db.query(
        `SELECT up.*, wp.name, wp.code, wp.category, wp.level
         FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
         WHERE up.user_id = ? ORDER BY up.last_workout_at DESC`,
        [user.id]
      ),
      db.one(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM(duration_sec),0) AS seconds,
                COALESCE(SUM(total_calories),0) AS calories,
                COALESCE(SUM(exercises_done),0) AS exercises
         FROM workout_sessions WHERE user_id = ? AND status = 'completed'`,
        [user.id]
      ),
      db.query('SELECT * FROM user_achievements WHERE user_id = ?', [user.id]).catch(() => []),
      db.query('SELECT id, points, reason, ref_id, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user.id]),
    ]);
    res.json({
      user: decorateUser(user),
      workouts,
      plans,
      progress: {
        sessions: summary.sessions,
        minutes: Math.round(summary.seconds / 60),
        calories: Math.round(summary.calories),
        exercises: summary.exercises,
      },
      achievements,
      pointsLedger: ledger,
    });
  } catch (e) { next(e); }
});

/** Plans with their admin-editable price. */
router.get('/plans', async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, code, name, category, level, duration_sec, total_exercises,
              price_cents, lottie_url, is_pro, sort_order
       FROM workout_plans ORDER BY sort_order, id LIMIT 250`
    );
    res.json({ plans: rows });
  } catch (e) { next(e); }
});

/** Edit plan details / price / PRO flag. */
router.patch('/plans/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    for (const key of ['name', 'description', 'category', 'level', 'duration_sec', 'price_cents', 'lottie_url', 'is_pro']) {
      if (b[key] !== undefined) { sets.push(`${key} = ?`); vals.push(b[key]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    vals.push(req.params.id);
    await db.query(`UPDATE workout_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
    const plan = await db.one('SELECT * FROM workout_plans WHERE id = ?', [req.params.id]);
    res.json({ plan });
  } catch (e) { next(e); }
});

/** Exercises available when uploading a new workout, filtered by level. */
router.get('/exercises', async (req, res, next) => {
  try {
    const level = Number(req.query.level || 0);
    const q = String(req.query.q || '').trim();
    const rows = await db.query(
      `SELECT id, action_id, name, unit, level, lottie_path,
              (lottie_path IS NOT NULL AND lottie_path <> '') AS has_animation
       FROM exercises
       WHERE (? = 0 OR level = ? OR (? = 3 AND level = 4))
         AND (? = '' OR name LIKE ?)
       ORDER BY level, action_id LIMIT 400`,
      [level, level, level, q, `%${q}%`]
    );
    res.json({ exercises: rows });
  } catch (e) { next(e); }
});

/** Upload/create a new workout plan with its exercises. */
router.post('/plans', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'validation_error', message: 'Workout name required' });
    const code = String(b.code || '').trim() || `admin_${Date.now()}`;
    const category = String(b.category || 'other');
    const level = Math.min(3, Math.max(1, Number(b.level || 1)));
    const durationSec = Math.max(0, Number(b.durationSec || 0));
    const priceCents = Math.max(0, Number(b.priceCents || 0));
    const ids = Array.isArray(b.exerciseIds) ? b.exerciseIds.map(Number).filter(Boolean).slice(0, 40) : [];

    const planId = await db.transaction(async (conn) => {
      const [ins] = await conn.execute(
        `INSERT INTO workout_plans
          (code, name, description, category, level, duration_sec, total_exercises, rounds, price_cents, lottie_url, is_pro, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 999)`,
        [code, name, b.description || null, category, level, durationSec, ids.length,
         priceCents, b.lottieUrl || null, b.is_pro ? 1 : 0]
      );
      const pid = ins.insertId;
      const [day] = await conn.execute(
        'INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 1, ?)',
        [pid, 'Day 1']
      );
      for (let i = 0; i < ids.length; i++) {
        const ex = await db.one('SELECT action_id FROM exercises WHERE id = ?', [ids[i]]);
        await conn.execute(
          `INSERT INTO workout_plan_items
            (plan_id, day_id, action_id, exercise_id, sequence, time_sec, rest_sec, rounds, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 's')`,
          [pid, day.insertId, ex?.action_id ?? 0, ids[i], i, 30, 10]
        );
      }
      return pid;
    });
    const plan = await db.one('SELECT * FROM workout_plans WHERE id = ?', [planId]);
    res.status(201).json({ plan });
  } catch (e) { next(e); }
});

module.exports = router;
