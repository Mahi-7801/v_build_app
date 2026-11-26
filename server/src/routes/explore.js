const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/explore
 * The home-screen catalogue recovered from assets/explore_default/config.
 * Returns the modules (carousels), the workout cards and the curated lists.
 *   ?lang=en   -> resolves the localized name/description strings
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';

    const [workouts, firstActions, lists, modules, items, strings] = await Promise.all([
      db.query('SELECT ew.* FROM explore_workouts ew ORDER BY ew.sort_order, ew.id'),
      db.query(
        `SELECT p.code, CAST(SUBSTRING_INDEX(GROUP_CONCAT(i.action_id ORDER BY i.sequence), ',', 1) AS UNSIGNED) AS first_action_id
         FROM workout_plans p
         JOIN workout_plan_items i ON i.plan_id = p.id
         GROUP BY p.id, p.code`
      ),
      db.query('SELECT id, name_key, description_key, cover, icon, workout_ids FROM explore_lists ORDER BY id'),
      db.query('SELECT id, name_key, description_key FROM explore_modules ORDER BY sort_order, id'),
      db.query('SELECT module_id, workout_id, name_key, icon FROM explore_module_items ORDER BY module_id, sort_order'),
      db.query('SELECT str_key, value FROM app_strings WHERE lang = ?', [lang]),
    ]);

    const actionByCode = new Map(firstActions.map((r) => [r.code, r.first_action_id]));
    const byModule = new Map(modules.map((m) => [m.id, { ...m, items: [] }]));
    for (const it of items) {
      const m = byModule.get(it.module_id);
      if (m) m.items.push(it);
    }

    // localized copy
    const S = Object.fromEntries(strings.map((r) => [r.str_key, r.value]));
    const t = (key) => (key && S[key] !== undefined ? S[key] : key || '');

    const workoutById = new Map(workouts.map((w) => [w.id, w]));
    const listById = new Map(lists.map((l) => [l.id, l]));

    const decorateWorkout = (w) => ({
      id: w.id,
      name: t(w.name_key),
      description: t(w.description_key),
      nameKey: w.name_key,
      descriptionKey: w.description_key,
      durationSec: w.duration_sec,
      minutes: w.minutes,
      muscles: db.parseJson(w.muscles, []),
      icon: w.icon,
      iconBg: db.parseJson(w.icon_bg, null),
      cover: w.cover,
      partId: w.part_id,
      categoryId: w.category_id,
      gender: w.gender,
      lock: w.lock_state,
      level: w.level,
      levelLabel: t(w.level_key),
      listIds: db.parseJson(w.workoutlist_ids, []),
      planCode: w.plan_code,
      firstActionId: actionByCode.get(w.plan_code) ?? null,
    });

    const decorateList = (l) => ({
      id: l.id,
      name: t(l.name_key),
      description: t(l.description_key),
      nameKey: l.name_key,
      cover: l.cover,
      icon: l.icon,
      workoutIds: db.parseJson(l.workout_ids, []),
      workouts: (db.parseJson(l.workout_ids, []) || []).map((id) => {
        const w = workoutById.get(Number(id));
        return w ? decorateWorkout(w) : null;
      }).filter(Boolean),
    });

    res.json({
      lang,
      modules: [...byModule.values()].map((m) => ({
        id: m.id,
        name: t(m.name_key),
        nameKey: m.name_key,
        description: t(m.description_key),
        items: m.items.map((it) => {
          const list = listById.get(Number(it.workout_id));
          if (list) {
            const d = decorateList(list);
            return { type: 'list', id: list.id, name: d.name, icon: it.icon || d.icon, list: d };
          }
          const w = workoutById.get(Number(it.workout_id));
          if (w) {
            const d = decorateWorkout(w);
            return { type: 'workout', id: w.id, name: d.name, icon: it.icon || d.icon, workout: d };
          }
          return { type: 'unknown', id: it.workout_id, name: '', icon: it.icon };
        }),
      })),
      workouts: workouts.map(decorateWorkout),
      lists: lists.map(decorateList),
    });
  } catch (e) { next(e); }
});

/** GET /api/explore/workouts/:id */
router.get('/workouts/:id', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    const w = await db.one('SELECT * FROM explore_workouts WHERE id = ?', [req.params.id]);
    if (!w) return res.status(404).json({ error: 'not_found' });
    const strings = await db.query('SELECT str_key, value FROM app_strings WHERE lang = ?', [lang]);
    const S = Object.fromEntries(strings.map((r) => [r.str_key, r.value]));
    let plan = null;
    if (w.plan_code) {
      plan = await db.one(
        `SELECT p.id, p.code, p.name, p.category, p.level, p.duration_sec, p.total_exercises,
                d.id AS day_id, d.day_index, d.name AS day_name,
                i.sequence, i.action_id, i.time_sec, i.rest_sec, e.name AS exercise_name,
                e.slug, e.unit, e.lottie_path, e.audio_url
         FROM workout_plans p
         LEFT JOIN workout_plan_days d ON d.plan_id = p.id
         LEFT JOIN workout_plan_items i ON i.day_id = d.id
         LEFT JOIN exercises e ON e.id = i.exercise_id
         WHERE p.code = ? ORDER BY d.day_index, i.sequence`,
        [w.plan_code]
      );
    }
    res.json({
      workout: {
        id: w.id,
        name: S[w.name_key] || w.name_key,
        description: S[w.description_key] || w.description_key,
        minutes: w.minutes,
        durationSec: w.duration_sec,
        muscles: db.parseJson(w.muscles, []),
        icon: w.icon,
        cover: w.cover,
        lock: w.lock_state,
        level: w.level,
        levelLabel: S[w.level_key] || w.level_key,
        planCode: w.plan_code,
      },
      plan,
      strings: S,
    });
  } catch (e) { next(e); }
});

/** GET /api/explore/lists/:id */
router.get('/lists/:id', optionalAuth, async (req, res, next) => {
  try {
    const lang = req.query.lang || 'en';
    const l = await db.one('SELECT * FROM explore_lists WHERE id = ?', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'not_found' });
    const ids = db.parseJson(l.workout_ids, []) || [];
    if (!ids.length) return res.json({ list: l, workouts: [] });
    const rows = await db.query(
      `SELECT * FROM explore_workouts WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );    const strings = await db.query('SELECT str_key, value FROM app_strings WHERE lang = ?', [lang]);
    const S = Object.fromEntries(strings.map((r) => [r.str_key, r.value]));
    res.json({
      list: { id: l.id, name: S[l.name_key] || l.name_key, description: S[l.description_key] || l.description_key, cover: l.cover },
      workouts: rows.map((w) => ({
        id: w.id,
        name: S[w.name_key] || w.name_key,
        description: S[w.description_key] || w.description_key,
        minutes: w.minutes,
        icon: w.icon,
        cover: w.cover,
        lock: w.lock_state,
        planCode: w.plan_code,
      })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
