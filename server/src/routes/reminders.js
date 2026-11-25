const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      "SELECT id, title, TIME_FORMAT(time_of_day, '%H:%i') AS time_of_day, days_of_week, enabled, reminder_type, last_notified_at FROM reminders WHERE user_id = ? ORDER BY time_of_day",
      [req.user.id]
    );
    res.json({ reminders: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title = 'Workout reminder', timeOfDay, daysOfWeek = [1, 2, 3, 4, 5, 6, 7], enabled = true, reminderType = 'daily' } = req.body || {};
    if (!timeOfDay) return res.status(400).json({ error: 'validation_error', message: 'timeOfDay required (HH:MM)' });
    const result = await db.query(
      'INSERT INTO reminders (user_id, title, time_of_day, days_of_week, enabled, reminder_type) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, title, timeOfDay, JSON.stringify(daysOfWeek), enabled ? 1 : 0, reminderType]
    );
    const row = await db.one('SELECT * FROM reminders WHERE id = ?', [result.insertId]);
    res.status(201).json({ reminder: row });
  } catch (e) { next(e); }
});

/** Server-side "is it time?" check. The app polls this and presents the alarm. */
router.get('/due', async (req, res, next) => {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon .. 7=Sun

    const rows = await db.query(
      `SELECT id, title, TIME_FORMAT(time_of_day, '%H:%i') AS time_of_day, days_of_week
       FROM reminders
       WHERE user_id = ? AND enabled = 1 AND TIME_FORMAT(time_of_day, '%H:%i') = ?
       AND (last_notified_at IS NULL OR DATE(last_notified_at) < ?)`,
      [req.user.id, hhmm, today]
    );

    const due = rows.filter((r) => {
      let days = [];
      try { days = JSON.parse(r.days_of_week || '[]').map(Number); } catch { /* treat as daily */ }
      if (!days.length) return true;
      // Accept both ISO (1..7, 7=Sunday) and the app's 0..6 (0=Sunday) values.
      return days.includes(isoDay) || days.includes(isoDay % 7);
    });

    res.json({ due, serverTime: hhmm });
  } catch (e) { next(e); }
});

/** App confirms it presented the alarm — prevents a repeat within the same day. */
router.post('/:id/notify', async (req, res, next) => {
  try {
    await db.query(
      'UPDATE reminders SET last_notified_at = NOW() WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const fields = [];
    const vals = [];
    const map = { title: 'title', timeOfDay: 'time_of_day', enabled: 'enabled', reminderType: 'reminder_type' };
    for (const [k, col] of Object.entries(map)) {
      if (!(k in (req.body || {}))) continue;
      fields.push(`${col} = ?`);
      vals.push(k === 'enabled' ? (req.body[k] ? 1 : 0) : req.body[k]);
    }
    if ('daysOfWeek' in (req.body || {})) {
      fields.push('days_of_week = ?');
      vals.push(JSON.stringify(req.body.daysOfWeek));
    }
    if (!fields.length) {
      const row = await db.one('SELECT * FROM reminders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      return res.json({ reminder: row });
    }
    vals.push(req.params.id, req.user.id);
    await db.query(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    const row = await db.one('SELECT * FROM reminders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ reminder: row });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM reminders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
