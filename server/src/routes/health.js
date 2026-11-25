const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** Sync Google Fit / Health Connect metrics. */
router.post('/sync', async (req, res, next) => {
  try {
    const { records = [], source = 'manual' } = req.body || {};
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of records) {
        if (!r.date) continue;
        await conn.execute(
          `INSERT INTO health_records (user_id, record_date, weight_kg, calories, steps, source)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE weight_kg = VALUES(weight_kg), calories = VALUES(calories),
             steps = VALUES(steps), source = VALUES(source)`,
          [req.user.id, r.date, r.weightKg ?? null, r.calories ?? null, r.steps ?? null, source]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.json({ synced: records.length });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const rows = await db.query(
      'SELECT record_date, weight_kg, calories, steps, source FROM health_records WHERE user_id = ? AND record_date BETWEEN ? AND ? ORDER BY record_date',
      [req.user.id, from, to]
    );
    res.json({ records: rows });
  } catch (e) { next(e); }
});

module.exports = router;
