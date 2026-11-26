const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/plans
 *   ?category=&level=&pro=&page=&limit=
 * The original app ships plan JSON under assets/workout/file/<code>.json
 * (e.g. d_ab_1, d_ch_1, lower, 7__4_beginner).
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(250, Math.max(1, parseInt(req.query.limit || '30', 10)));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    if (req.query.category) { where.push('category = ?'); params.push(req.query.category); }
    if (req.query.level) { where.push('level = ?'); params.push(Number(req.query.level)); }
    if (req.query.pro !== undefined) { where.push('is_pro = ?'); params.push(req.query.pro === 'true' || req.query.pro === '1' ? 1 : 0); }
    if (req.query.q) { where.push('(name LIKE ? OR code LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, countRows] = await Promise.all([
      db.query(
        `SELECT p.*, fa.first_action_id
         FROM workout_plans p
         LEFT JOIN (
           SELECT plan_id, CAST(SUBSTRING_INDEX(GROUP_CONCAT(action_id ORDER BY sequence), ',', 1) AS UNSIGNED) AS first_action_id
           FROM workout_plan_items
           GROUP BY plan_id
         ) fa ON fa.plan_id = p.id
         ${whereSql}
         ORDER BY (CASE WHEN p.sort_order = 0 OR p.sort_order = 999 THEN 0 ELSE 1 END),
                  (CASE WHEN p.sort_order = 0 OR p.sort_order = 999 THEN -p.id ELSE p.sort_order END),
                  p.id
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS total FROM workout_plans ${whereSql}`, params),
    ]);
    res.json({ items: rows, total: countRows[0].total, page, limit });
  } catch (e) { next(e); }
});

router.get('/meta/categories', async (_req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT category, COUNT(*) AS count FROM workout_plans GROUP BY category ORDER BY count DESC'
    );
    res.json({ categories: rows });
  } catch (e) { next(e); }
});

/** Full plan detail: days + ordered items resolved to exercises. */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    // Avoid MySQL's string->number coercion: "7__4_beginner" would match id 7.
    const byId = /^\d+$/.test(String(req.params.id));
    const plan = await db.one(
      byId ? 'SELECT * FROM workout_plans WHERE id = ?' : 'SELECT * FROM workout_plans WHERE code = ?',
      [req.params.id]
    );
    if (!plan) return res.status(404).json({ error: 'not_found' });

    const days = await db.query('SELECT id, day_index, name FROM workout_plan_days WHERE plan_id = ? ORDER BY day_index', [plan.id]);
    let items;
    try {
      items = await db.query(
        `SELECT i.id, i.sequence, i.action_id, i.time_sec, i.rest_sec, i.rounds, i.day_id,
                e.id AS exercise_id, e.name, e.slug, e.unit, e.image_path, e.lottie_path, e.audio_url,
                e.alternation, e.speed, e.wm_speed, e.calories_per_unit, e.is_pro
         FROM workout_plan_items i
         LEFT JOIN exercises e ON e.id = i.exercise_id
         WHERE i.plan_id = ? ORDER BY i.day_id, i.sequence`,
        [plan.id]
      );
    } catch (e) {
      if (!/audio_url/i.test(e.message)) throw e;
      items = await db.query(
        `SELECT i.id, i.sequence, i.action_id, i.time_sec, i.rest_sec, i.rounds, i.day_id,
                e.id AS exercise_id, e.name, e.slug, e.unit, e.image_path, e.lottie_path,
                NULL AS audio_url,
                e.alternation, e.speed, e.wm_speed, e.calories_per_unit, e.is_pro
         FROM workout_plan_items i
         LEFT JOIN exercises e ON e.id = i.exercise_id
         WHERE i.plan_id = ? ORDER BY i.day_id, i.sequence`,
        [plan.id]
      );
    }
    res.json({ plan, days, items });
  } catch (e) { next(e); }
});

module.exports = router;
