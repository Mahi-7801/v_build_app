const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/** Motivational quote for the home / result screens (original assets/json/quotes). */
router.get('/random', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    const row = await db.one('SELECT id, text, author FROM quotes WHERE lang = ? ORDER BY RAND() LIMIT 1', [lang]);
    res.json({ quote: row || null });
  } catch (e) { next(e); }
});

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    const rows = await db.query('SELECT id, text, author FROM quotes WHERE lang = ? ORDER BY id', [lang]);
    res.json({ quotes: rows });
  } catch (e) { next(e); }
});

module.exports = router;
