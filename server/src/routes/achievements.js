const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, async (_req, res, next) => {
  try {
    const rows = await db.query('SELECT id, code, title, description, icon, metric, threshold FROM achievements ORDER BY id');
    res.json({ achievements: rows });
  } catch (e) { next(e); }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT a.id, a.code, a.title, a.description, a.icon, a.metric, a.threshold,
              COALESCE(ua.progress,0) AS progress, ua.unlocked_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
       ORDER BY a.id`,
      [req.user.id]
    );
    res.json({ achievements: rows });
  } catch (e) { next(e); }
});

/** Recompute progress for every achievement from the user's completed sessions. */
router.post('/recalculate', requireAuth, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [totals] = await db.query(
      `SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_sec),0) AS seconds,
              COALESCE(SUM(total_calories),0) AS calories
       FROM workout_sessions WHERE user_id = ? AND status='completed'`,
      [uid]
    );
    const [ex] = await db.query(
      'SELECT COUNT(DISTINCT exercise_id) AS cnt FROM user_exercise_stats WHERE user_id = ?', [uid]
    );
    const achievements = await db.query('SELECT id, metric, threshold FROM achievements');
    for (const a of achievements) {
      let progress = 0;
      if (a.metric === 'sessions') progress = totals.sessions;
      else if (a.metric === 'minutes') progress = Math.floor(totals.seconds / 60);
      else if (a.metric === 'calories') progress = Math.floor(totals.calories);
      else if (a.metric === 'exercises') progress = ex.cnt;
      else if (a.metric === 'streak') progress = totals.sessions;
      const unlocked = progress >= a.threshold;
      await db.query(
        `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at)
         VALUES (?, ?, ?, ${unlocked ? 'NOW()' : 'NULL'})
         ON DUPLICATE KEY UPDATE progress = VALUES(progress),
           unlocked_at = COALESCE(unlocked_at, ${unlocked ? 'NOW()' : 'NULL'})`,
        [uid, a.id, progress]
      );
    }
    res.json({ ok: true, totals, exercises: ex.cnt });
  } catch (e) { next(e); }
});

module.exports = router;
