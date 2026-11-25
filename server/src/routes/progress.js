const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** Active plan for a user (or all active plans). */
router.get('/plans', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT up.*, wp.code, wp.name, wp.category, wp.level, wp.duration_sec, wp.total_exercises
       FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
       WHERE up.user_id = ? ORDER BY up.last_workout_at DESC`,
      [req.user.id]
    );
    res.json({ plans: rows });
  } catch (e) { next(e); }
});

router.post('/plans/:planId/start', async (req, res, next) => {
  try {
    const byId = /^\d+$/.test(String(req.params.planId));
    const plan = await db.one(
      byId ? 'SELECT id FROM workout_plans WHERE id = ?' : 'SELECT id FROM workout_plans WHERE code = ?',
      [req.params.planId]
    );
    if (!plan) return res.status(404).json({ error: 'not_found' });
    await db.query(
      `INSERT INTO user_plans (user_id, plan_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE completed_at = NULL, last_workout_at = NULL`,
      [req.user.id, plan.id]
    );
    const row = await db.one(
      `SELECT up.*, wp.name, wp.code FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
       WHERE up.user_id = ? AND up.plan_id = ?`,
      [req.user.id, plan.id]
    );
    res.status(201).json({ userPlan: row });
  } catch (e) { next(e); }
});

/** Mark the current day complete and advance. */
router.post('/plans/:planId/complete-day', async (req, res, next) => {
  try {
    const row = await db.one('SELECT * FROM user_plans WHERE user_id = ? AND plan_id = ?', [req.user.id, req.params.planId]);
    if (!row) return res.status(404).json({ error: 'not_found' });
    await db.query(
      'UPDATE user_plans SET current_day = current_day + 1, completed_days = completed_days + 1, total_workouts = total_workouts + 1, last_workout_at = NOW() WHERE id = ?',
      [row.id]
    );
    const updated = await db.one('SELECT * FROM user_plans WHERE id = ?', [row.id]);
    res.json({ userPlan: updated });
  } catch (e) { next(e); }
});

/** Aggregate stats for the profile/progress screens. */
router.get('/summary', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [totals] = await db.query(
      `SELECT COUNT(*) AS sessions,
              COALESCE(SUM(duration_sec),0) AS total_seconds,
              COALESCE(SUM(total_calories),0) AS total_calories,
              COALESCE(SUM(total_reps),0) AS total_reps
       FROM workout_sessions WHERE user_id = ? AND status='completed'`,
      [uid]
    );
    const top = await db.query(
      `SELECT e.id, e.name, e.slug, s.times_completed, s.total_sec
       FROM user_exercise_stats s JOIN exercises e ON e.id = s.exercise_id
       WHERE s.user_id = ? ORDER BY s.times_completed DESC LIMIT 10`,
      [uid]
    );
    res.json({ totals, topExercises: top });
  } catch (e) { next(e); }
});

module.exports = router;
