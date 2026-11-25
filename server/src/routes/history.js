const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { pointsForSession, awardPoints, decorateUser } = require('../points');

const router = express.Router();
router.use(requireAuth);

/** Paginated history list for the "Recent" / history screen. */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT id, plan_id, title, started_at, completed_at, duration_sec,
              total_calories, total_reps, exercises_done, exercises_total, status
       FROM workout_sessions WHERE user_id = ?
       ORDER BY started_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    const [countRow] = await db.query('SELECT COUNT(*) AS total FROM workout_sessions WHERE user_id = ?', [req.user.id]);
    res.json({ items: rows, total: countRow.total, page, limit });
  } catch (e) { next(e); }
});

/**
 * POST /api/history/sessions
 * Start a workout session. The mobile player calls this when the user hits
 * "start" so that the session survives an app restart.
 * Body: { planId?, planDayId?, title, plannedDurationSec, exercisesTotal }
 */
router.post('/sessions', async (req, res, next) => {
  try {
    const {
      planId = null,
      planDayId = null,
      title = 'Workout',
      plannedDurationSec = 0,
      exercisesTotal = 0,
    } = req.body || {};

    const result = await db.query(
      `INSERT INTO workout_sessions
         (user_id, plan_id, plan_day_id, title, planned_duration_sec, exercises_total, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [req.user.id, planId, planDayId, title, plannedDurationSec, exercisesTotal]
    );
    const session = await db.one('SELECT * FROM workout_sessions WHERE id = ?', [result.insertId]);
    res.status(201).json({ session });
  } catch (e) { next(e); }
});

/**
 * POST /api/history/sessions/:id/exercises
 * Log one finished exercise inside a session.
 * Body: { exerciseId, sequence, plannedSec, actualSec, reps, calories, skipped }
 */
router.post('/sessions/:id/exercises', async (req, res, next) => {
  try {
    const { exerciseId = null, sequence = 0, plannedSec = 0, actualSec = 0,
            reps = 0, calories = 0, skipped = false } = req.body || {};
    const session = await db.one(
      'SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!session) return res.status(404).json({ error: 'not_found' });
    await db.query(
      `INSERT INTO workout_session_exercises
         (session_id, exercise_id, sequence, planned_sec, actual_sec, reps, calories, skipped)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, exerciseId, sequence, plannedSec, actualSec, reps, calories, skipped ? 1 : 0]
    );
    await db.query(
      `UPDATE workout_sessions
         SET duration_sec = duration_sec + ?,
             total_calories = total_calories + ?,
             total_reps = total_reps + ?,
             exercises_done = exercises_done + 1
       WHERE id = ?`,
      [actualSec, calories, reps, req.params.id]
    );
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

/**
 * POST /api/history/sessions/:id/complete
 * Finish a session: marks it completed, updates per-exercise statistics and
 * advances any active plan.
 */
router.post('/sessions/:id/complete', async (req, res, next) => {
  try {
    const session = await db.one(
      'SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!session) return res.status(404).json({ error: 'not_found' });

    await db.query(
      `UPDATE workout_sessions
       SET status = 'completed', completed_at = NOW(),
           duration_sec = GREATEST(duration_sec, ?),
           total_calories = GREATEST(total_calories, ?),
           exercises_done = GREATEST(exercises_done, ?)
       WHERE id = ?`,
      [req.body?.durationSec || 0, req.body?.totalCalories || 0,
       req.body?.exercisesDone || 0, req.params.id]
    );

    // per-exercise stats
    const items = await db.query(
      'SELECT exercise_id, actual_sec, reps FROM workout_session_exercises WHERE session_id = ? AND exercise_id IS NOT NULL',
      [req.params.id]
    );
    for (const it of items) {
      await db.query(
        `INSERT INTO user_exercise_stats
           (user_id, exercise_id, times_completed, total_sec, total_reps, last_completed_at)
         VALUES (?, ?, 1, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE times_completed = times_completed + 1,
           total_sec = total_sec + VALUES(total_sec),
           total_reps = total_reps + VALUES(total_reps),
           last_completed_at = NOW()`,
        [req.user.id, it.exercise_id, it.actual_sec, it.reps]
      );
    }

    // advance the active plan
    if (session.plan_id) {
      await db.query(
        `UPDATE user_plans
         SET completed_days = completed_days + 1,
             total_workouts = total_workouts + 1,
             current_day = current_day + 1,
             last_workout_at = NOW()
         WHERE user_id = ? AND plan_id = ?`,
        [req.user.id, session.plan_id]
      );
    }

    // Fire points are awarded once per session so replaying a completion
    // cannot farm points.
    let awarded = { points: 0, total: Number(req.user.points || 0) };
    if (session.status !== 'completed') {
      const earned = pointsForSession({
        durationSec: req.body?.durationSec || session.duration_sec,
        calories: req.body?.totalCalories || session.total_calories,
        exercisesDone: req.body?.exercisesDone || session.exercises_done,
      });
      awarded = await awardPoints(req.user.id, earned, 'workout_complete', session.id);
    }
    const user = decorateUser(await db.one(
      'SELECT id, is_pro, pro_expires_at, points FROM users WHERE id = ?', [req.user.id]
    ));
    const updated = await db.one('SELECT * FROM workout_sessions WHERE id = ?', [req.params.id]);
    res.json({ session: updated, user, pointsAwarded: awarded.points, pointsTotal: awarded.total });
  } catch (e) { next(e); }
});

/** DELETE /api/history/sessions/:id - abandon a running session. */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    await db.query(
      "UPDATE workout_sessions SET status = 'abandoned' WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    res.status(204).end();
  } catch (e) { next(e); }
});

/** Calendar heat-map data (original LWHistoryActivity / Calendar screen). */
router.get('/calendar', async (req, res, next) => {
  try {
    const from = req.query.from || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const rows = await db.query(
      `SELECT activity_date, sessions, total_seconds, total_calories
       FROM v_user_daily_activity
       WHERE user_id = ? AND activity_date BETWEEN ? AND ?
       ORDER BY activity_date`,
      [req.user.id, from, to]
    );
    res.json({ from, to, days: rows });
  } catch (e) { next(e); }
});

/** Per-exercise detail for a finished session. */
router.get('/:id', async (req, res, next) => {
  try {
    const session = await db.one('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!session) return res.status(404).json({ error: 'not_found' });
    const items = await db.query(
      `SELECT s.*, e.name, e.slug, e.unit, e.image_path, e.lottie_path
       FROM workout_session_exercises s LEFT JOIN exercises e ON e.id = s.exercise_id
       WHERE s.session_id = ? ORDER BY s.sequence`,
      [req.params.id]
    );
    res.json({ session, items });
  } catch (e) { next(e); }
});

module.exports = router;
