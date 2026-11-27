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

/** Server-side "is it time?" check using the caller's timezone offset when provided. */
router.get('/due', async (req, res, next) => {
  try {
    const tzParam = Number(req.query.tzOffsetMin);
    const hasTz = req.query.tzOffsetMin !== undefined && Number.isFinite(tzParam) && tzParam >= -840 && tzParam <= 840;
    const nowMs = Date.now() - (hasTz ? tzParam * 60_000 : 0);
    const now = new Date(nowMs);
    const pad = (n) => String(n).padStart(2, '0');
    const hh = hasTz ? now.getUTCHours() : now.getHours();
    const mm = hasTz ? now.getUTCMinutes() : now.getMinutes();
    const yr = hasTz ? now.getUTCFullYear() : now.getFullYear();
    const mo = hasTz ? now.getUTCMonth() + 1 : now.getMonth() + 1;
    const dt = hasTz ? now.getUTCDate() : now.getDate();
    const dow = hasTz ? now.getUTCDay() : now.getDay();
    const hhmm = `${pad(hh)}:${pad(mm)}`;
    const today = `${yr}-${pad(mo)}-${pad(dt)}`;
    const isoDay = dow === 0 ? 7 : dow; // 1=Mon .. 7=Sun

    const rows = await db.query(
      `SELECT id, title, TIME_FORMAT(time_of_day, '%H:%i') AS time_of_day, days_of_week,
              UNIX_TIMESTAMP(last_notified_at) AS last_notified_epoch
       FROM reminders
       WHERE user_id = ? AND enabled = 1 AND TIME_FORMAT(time_of_day, '%H:%i') = ?`,
      [req.user.id, hhmm]
    );

    const due = rows.filter((r) => {
      if (r.last_notified_epoch) {
        const lastMs = Number(r.last_notified_epoch) * 1000 - (hasTz ? tzParam * 60_000 : 0);
        const last = new Date(lastMs);
        const lastDate = hasTz
          ? `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`
          : `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
        if (lastDate >= today) return false;
      }
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
