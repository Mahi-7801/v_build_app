const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/strings?lang=en
 * The 128 localized UI strings per language recovered from
 * assets/explore_default/strings/<lang> (19 languages).
 */
router.get('/', async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    const rows = await db.query('SELECT str_key, value FROM app_strings WHERE lang = ?', [lang]);
    const out = {};
    for (const r of rows) out[r.str_key] = r.value;
    res.json({ lang, strings: out });
  } catch (e) { next(e); }
});

/** GET /api/strings/languages */
router.get('/languages', async (_req, res, next) => {
  try {
    const rows = await db.query('SELECT lang, COUNT(*) AS count FROM app_strings GROUP BY lang ORDER BY lang');
    res.json({ languages: rows });
  } catch (e) { next(e); }
});

module.exports = router;
