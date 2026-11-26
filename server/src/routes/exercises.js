const express = require('express');
const path = require('path');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/exercises
 * Filters mirror the original exercise-list screen:
 *   ?q=&muscle=&level=&equipment=&pro=&page=&limit=&lang=
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;
    const lang = req.query.lang || 'en';

    const where = [];
    const params = [];
    if (req.query.q) { where.push('(e.name LIKE ? OR e.introduce LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.muscle) { where.push('e.primary_muscle = ?'); params.push(req.query.muscle); }
    if (req.query.level) { where.push('e.level = ?'); params.push(Number(req.query.level)); }
    if (req.query.equipment) { where.push('e.equipment = ?'); params.push(req.query.equipment); }
    if (req.query.pro !== undefined) { where.push('e.is_pro = ?'); params.push(req.query.pro === 'true' || req.query.pro === '1' ? 1 : 0); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, countRows] = await Promise.all([
      db.query(
        `SELECT e.id, e.action_id, e.slug, e.name, e.introduce, e.unit, e.image_path,
                e.lottie_path, e.video_url, e.alternation, e.speed, e.wm_speed,
                e.primary_muscle, e.secondary_muscles, e.equipment, e.level,
                e.calories_per_unit, e.is_pro,
                t.title, t.description, t.steps, t.coach_tips
         FROM exercises e
         LEFT JOIN exercise_texts t ON t.exercise_id = e.id AND t.lang = ?
         ${whereSql}
         ORDER BY e.sort_order, e.id
         LIMIT ? OFFSET ?`,
        [lang, ...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS total FROM exercises e ${whereSql}`, params),
    ]);
    res.json({
      items: rows.map((r) => ({
        ...r,
        secondary_muscles: db.parseJson(r.secondary_muscles, []),
        steps: db.parseJson(r.steps, null),
        coach_tips: db.parseJson(r.coach_tips, null),
      })),
      total: countRows[0].total,
      page,
      limit,
    });
  } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    // Avoid MySQL coercion of non-numeric identifiers to 0.
    const byId = /^\d+$/.test(String(req.params.id));
    const exercise = await db.one(
      `SELECT e.*, t.title, t.description, t.steps, t.coach_tips
       FROM exercises e
       LEFT JOIN exercise_texts t ON t.exercise_id = e.id AND t.lang = ?
       WHERE ${byId ? '(e.id = ? OR e.action_id = ?)' : 'e.slug = ?'}`,
      byId ? [lang, req.params.id, req.params.id] : [lang, req.params.id]
    );
    if (!exercise) return res.status(404).json({ error: 'not_found' });
    let tips = await db.query(
      'SELECT tip_type, title, content, sort_order FROM exercise_tips WHERE exercise_id = ? AND lang = ? ORDER BY sort_order, id LIMIT 12',
      [exercise.id, lang]
    );
    if (!tips.length) {
      tips = await db.query(
        'SELECT tip_type, title, content, sort_order FROM exercise_tips WHERE exercise_id IS NULL AND lang = ? ORDER BY sort_order, id LIMIT 4',
        [lang]
      );
    }
    res.json({
      exercise: {
        ...exercise,
        secondary_muscles: db.parseJson(exercise.secondary_muscles, []),
        steps: db.parseJson(exercise.steps, []),
        coach_tips: db.parseJson(exercise.coach_tips, []),
      },
      tips,
    });
  } catch (e) { next(e); }
});

/** Distinct filter values for the exercise browser UI. */
/**
 * GET /api/exercises/:id/lottie
 * The flat-design character animation for an exercise, recovered from
 * assets/workout/actions/<id>/lottie/men_white/1/data/data.
 */
router.get('/:id/lottie', (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'invalid_id' });
  const file = path.resolve(__dirname, '..', '..', '..', 'mobile', 'assets', 'lottie', `${req.params.id}.json`);
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
  });
});

router.get('/meta/filters', async (_req, res, next) => {
  try {
    const [muscles, equipment, levels] = await Promise.all([
      db.query('SELECT DISTINCT primary_muscle AS value FROM exercises WHERE primary_muscle IS NOT NULL ORDER BY value'),
      db.query('SELECT DISTINCT equipment AS value FROM exercises ORDER BY value'),
      db.query('SELECT DISTINCT level AS value FROM exercises ORDER BY value'),
    ]);
    res.json({
      muscles: muscles.map(r => r.value),
      equipment: equipment.map(r => r.value),
      levels: levels.map(r => r.value),
    });
  } catch (e) { next(e); }
});

module.exports = router;
