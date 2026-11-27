const db = require('./db');

/**
 * Idempotent startup repair. Older databases predate the payments table and
 * the per-exercise sound column, so the API creates them automatically instead
 * of returning 500 errors until someone remembers to run a migration script.
 */

async function ensureColumn(table, column, definition, after) {
  try {
    // MariaDB does not accept a prepared placeholder in SHOW ... LIKE.
    // Both values are internal constants, so a literal is safe here.
    const rows = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
    if (!rows.length) {
      const afterSql = after ? ` AFTER \`${after}\`` : '';
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}${afterSql}`);
      return true;
    }
  } catch (e) {
    console.error(`[bootstrap] could not ensure ${table}.${column}:`, e.message);
  }
  return false;
}

async function ensurePaymentsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id          BIGINT UNSIGNED NOT NULL,
        gateway          VARCHAR(24)   NOT NULL DEFAULT 'razorpay',
        product_id       VARCHAR(190)  NULL,
        order_id         VARCHAR(190)  NULL,
        payment_id       VARCHAR(190)  NULL,
        payment_link_id  VARCHAR(190)  NULL,
        method           VARCHAR(64)   NULL,
        status           VARCHAR(32)   NOT NULL DEFAULT 'created',
        amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency         VARCHAR(10)   NOT NULL DEFAULT 'INR',
        discount_percent INT           NOT NULL DEFAULT 0,
        points_at_purchase INT         NOT NULL DEFAULT 0,
        callback_token   VARCHAR(80)   NULL,
        created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_payments_user (user_id, created_at),
        KEY idx_payments_status (status),
        KEY idx_payments_token (callback_token),
        KEY idx_payments_payment (payment_id),
        CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.error('[bootstrap] payments table:', e.message);
  }
}

async function ensureFeatureSuggestionsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS feature_suggestions (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id       BIGINT UNSIGNED NULL,
        features_json TEXT            NOT NULL,
        note          VARCHAR(500)    NULL,
        created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.error('[bootstrap] feature_suggestions table:', e.message);
  }
}

async function bootstrap() {
  await ensurePaymentsTable();
  await ensureFeatureSuggestionsTable();
  await ensureColumn('exercises', 'audio_url', 'VARCHAR(512) NULL', 'lottie_path');

  // Uploaded profile photos use JPEG/PNG data URIs that exceed VARCHAR(512).
  try {
    const col = await db.one("SHOW COLUMNS FROM users LIKE 'avatar_url'");
    if (col && !/mediumtext|longtext/i.test(col.Type || '')) {
      await db.query('ALTER TABLE users MODIFY COLUMN avatar_url MEDIUMTEXT NULL');
      console.log('[bootstrap] users.avatar_url converted to MEDIUMTEXT');
    }
  } catch (e) { console.error('[bootstrap] users.avatar_url column:', e.message); }

  // Admin-defined workout categories need a free-text column.
  try {
    const col = await db.one("SHOW COLUMNS FROM workout_plans LIKE 'category'");
    if (col && /enum/i.test(col.Type || '')) {
      await db.query("ALTER TABLE workout_plans MODIFY COLUMN category VARCHAR(64) NOT NULL DEFAULT 'other'");
      console.log('[bootstrap] workout_plans.category converted to VARCHAR');
    }
  } catch (e) { console.error('[bootstrap] category column:', e.message); }

  // Support details can be longer than the original VARCHAR(255).
  try {
    const col = await db.one("SHOW COLUMNS FROM app_config LIKE 'value'");
    if (col && /varchar/i.test(col.Type || '')) {
      await db.query('ALTER TABLE app_config MODIFY COLUMN value TEXT NOT NULL');
      console.log('[bootstrap] app_config.value converted to TEXT');
    }
  } catch (e) { console.error('[bootstrap] app_config column:', e.message); }

  // Seed settings rows used by the admin panel.
  for (const [key, value] of [
    ['points_target', '5000'],
    ['pro_discount_percent', '40'],
    ['pro_price_cents', '2999'],
    ['payment_currency', 'INR'],
    ['support_email', 'support@vbuild.app'],
    ['support_address', ''],
    ['support_phone', ''],
  ]) {
    try {
      await db.query('INSERT IGNORE INTO app_config (config_key, value) VALUES (?, ?)', [key, value]);
    } catch { /* table may not exist yet */ }
  }

  // Ensure read-hot query indexes exist.
  for (const [table, idx, cols] of [
    ['workout_plans', 'idx_plans_sort', 'sort_order, id'],
    ['workout_plan_items', 'idx_wpi_plan_seq', 'plan_id, sequence'],
    ['exercise_tips', 'idx_tips_ex_lang', 'exercise_id, lang'],
    ['workout_sessions', 'idx_ws_user_status_start', 'user_id, status, started_at'],
  ]) {
    try {
      const existing = await db.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = '${idx}'`);
      if (!existing.length) {
        await db.query(`CREATE INDEX \`${idx}\` ON \`${table}\` (${cols})`);
      }
    } catch { /* ignore if table does not exist yet */ }
  }

  await ensureMissingWorkoutsAndLists();
}

const MISSING_EXPLORE_PLANS = [
  {
    exploreId: 44,
    code: 'plank_challenge',
    name: 'Plank Challenge',
    description: 'Build a rock-solid core with progressive plank variations over 7 focused days.',
    category: 'challenge',
    level: 2,
    days: [
      { dayIndex: 1, name: 'Day 1 · Foundation', actions: [15, 454, 3, 29, 35, 48, 144] },
      { dayIndex: 2, name: 'Day 2 · Core Hold', actions: [15, 3, 29, 35, 66, 48, 144] },
      { dayIndex: 3, name: 'Day 3 · Hip Control', actions: [15, 3, 378, 29, 35, 90, 144] },
      { dayIndex: 4, name: 'Day 4 · Active Stability', actions: [15, 66, 3, 12, 29, 35, 198] },
      { dayIndex: 5, name: 'Day 5 · Spider & Lift', actions: [15, 495, 3, 90, 378, 48, 144] },
      { dayIndex: 6, name: 'Day 6 · Endurance', actions: [15, 3, 66, 495, 29, 35, 12, 144] },
      { dayIndex: 7, name: 'Day 7 · Challenge Finale', actions: [15, 3, 378, 90, 495, 29, 35, 198, 144] },
    ],
    timeSec: 35,
    restSec: 15,
  },
  {
    exploreId: 50,
    code: 'full_body_stretching',
    name: 'Full body stretching',
    description: 'Relax your body and improve range of motion across every major muscle group.',
    category: 'stretch',
    level: 1,
    actions: [141, 143, 155, 198, 196, 197, 218, 219, 201, 202, 222, 144],
    timeSec: 30,
    restSec: 10,
  },
  {
    exploreId: 51,
    code: 'upper_body_stretching',
    name: 'Upper body stretching',
    description: 'Stretch your arms, shoulders, chest and upper back to restore flexibility.',
    category: 'stretch',
    level: 1,
    actions: [61, 136, 143, 155, 203, 204, 268, 269, 141, 198, 144],
    timeSec: 30,
    restSec: 10,
  },
  {
    exploreId: 52,
    code: 'neck_shoulder_relief',
    name: 'Neck & shoulder tension relief',
    description: 'Loosen tight neck and shoulder muscles and ease daily desk tension.',
    category: 'stretch',
    level: 1,
    actions: [61, 258, 155, 184, 185, 191, 263, 287, 143, 141, 144],
    timeSec: 35,
    restSec: 10,
  },
  {
    exploreId: 53,
    code: 'back_stretching_7',
    name: 'Back stretching 7 min',
    description: 'Relax stiff back muscles, improve spinal mobility and help prevent back strain.',
    category: 'stretch',
    level: 1,
    actions: [141, 198, 196, 197, 259, 260, 181, 182, 144],
    timeSec: 35,
    restSec: 10,
  },
  {
    exploreId: 55,
    code: 'morning_warm_up',
    name: 'Morning warm up',
    description: 'Wake up with energy and mobilize your joints so your body is primed for the day.',
    category: 'stretch',
    level: 1,
    actions: [15, 61, 258, 120, 141, 198, 21, 33, 143],
    timeSec: 30,
    restSec: 10,
  },
  {
    exploreId: 56,
    code: 'sleepy_time_stretching',
    name: 'Sleepy time stretching',
    description: 'Gentle evening stretches to release tension and prepare for restful sleep.',
    category: 'stretch',
    level: 1,
    actions: [144, 141, 222, 259, 260, 196, 197, 181, 182, 198],
    timeSec: 35,
    restSec: 10,
  },
  {
    exploreId: 57,
    code: 'lower_body_stretching_7',
    name: 'Lower body stretching 7 min',
    description: 'Stretch tight hips, quads, hamstrings and calves for smooth recovery.',
    category: 'stretch',
    level: 1,
    actions: [129, 218, 219, 201, 202, 222, 259, 260, 144],
    timeSec: 35,
    restSec: 10,
  },
  {
    exploreId: 59,
    code: 'knee_pain_relief',
    name: 'Knee pain relief',
    description: 'Low-impact stretches and gentle stability drills to support and ease sore knees.',
    category: 'stretch',
    level: 1,
    actions: [218, 219, 201, 202, 70, 82, 73, 74, 36, 48],
    timeSec: 35,
    restSec: 15,
  },
  {
    exploreId: 70,
    code: 'shoulder_tension_relief',
    name: 'Shoulder tension relief',
    description: 'Relieve shoulder stiffness and improve overhead mobility anywhere.',
    category: 'stretch',
    level: 1,
    actions: [155, 61, 136, 192, 193, 203, 204, 301, 143],
    timeSec: 35,
    restSec: 10,
  },
  {
    exploreId: 71,
    code: 'lower_back_pain_relief',
    name: 'Lower back pain relief',
    description: 'Simple, controlled stretches to ease lower back tightness and support posture.',
    category: 'stretch',
    level: 1,
    actions: [141, 48, 259, 260, 196, 197, 198, 168, 144],
    timeSec: 40,
    restSec: 15,
  },
  {
    exploreId: 94,
    code: 'stamina_core_pelvic',
    name: 'Last longer in bed',
    description: 'Strengthen pelvic floor, glute and core endurance for better stamina.',
    category: 'full_body',
    level: 2,
    actions: [48, 493, 3, 29, 35, 179, 180, 1, 144],
    timeSec: 40,
    restSec: 15,
  },
  {
    exploreId: 99,
    code: 'before_workout_warmup',
    name: 'Before workout warmup',
    description: 'Essential 3-minute dynamic warm-up to raise heart rate and prep every joint.',
    category: 'stretch',
    level: 1,
    actions: [15, 61, 258, 33, 87, 143],
    timeSec: 25,
    restSec: 5,
  },
  {
    exploreId: 106,
    code: 'beginner_core_workout',
    name: 'Beginner core workout',
    description: 'Beginner-friendly plank and core sequence that builds strength safely.',
    category: 'abs',
    level: 1,
    actions: [0, 3, 454, 48, 7, 127, 1, 198],
    timeSec: 35,
    restSec: 15,
  },
];

async function ensureMissingWorkoutsAndLists() {
  try {
    const exRows = await db.query('SELECT id, action_id FROM exercises');
    const byAction = new Map(exRows.map((r) => [Number(r.action_id), Number(r.id)]));
    if (!byAction.size) return;

    for (const spec of MISSING_EXPLORE_PLANS) {
      const daysSpec = spec.days || [{ dayIndex: 1, name: 'Day 1', actions: spec.actions }];
      const firstActions = daysSpec[0].actions.filter((a) => byAction.has(a));
      if (!firstActions.length) continue;

      const dayDuration = firstActions.length * (spec.timeSec + spec.restSec);
      let plan = await db.one('SELECT id, total_exercises FROM workout_plans WHERE code = ?', [spec.code]);
      if (!plan) {
        const res = await db.query(
          `INSERT INTO workout_plans (code, name, description, category, level, duration_sec, total_exercises, is_pro, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [spec.code, spec.name, spec.description, spec.category, spec.level, dayDuration, firstActions.length, spec.exploreId]
        );
        plan = { id: res.insertId, total_exercises: firstActions.length };
      }

      for (const daySpec of daysSpec) {
        const validActions = daySpec.actions.filter((a) => byAction.has(a));
        if (!validActions.length) continue;

        let dayRow = await db.one(
          'SELECT id FROM workout_plan_days WHERE plan_id = ? AND day_index = ?',
          [plan.id, daySpec.dayIndex]
        );
        if (!dayRow) {
          const dRes = await db.query(
            'INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, ?, ?)',
            [plan.id, daySpec.dayIndex, daySpec.name]
          );
          dayRow = { id: dRes.insertId };
        }

        const countRow = await db.one(
          'SELECT COUNT(*) AS n FROM workout_plan_items WHERE plan_id = ? AND day_id = ?',
          [plan.id, dayRow.id]
        );
        if (Number(countRow?.n || 0) === 0) {
          for (let idx = 0; idx < validActions.length; idx++) {
            const aid = validActions[idx];
            await db.query(
              `INSERT INTO workout_plan_items (plan_id, day_id, sequence, action_id, exercise_id, time_sec, rest_sec, rounds)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
              [plan.id, dayRow.id, idx + 1, aid, byAction.get(aid), spec.timeSec, spec.restSec]
            );
          }
        }
      }

      if (Number(plan.total_exercises || 0) === 0) {
        await db.query(
          'UPDATE workout_plans SET duration_sec = ?, total_exercises = ? WHERE id = ?',
          [dayDuration, firstActions.length, plan.id]
        );
      }

      await db.query(
        "UPDATE explore_workouts SET plan_code = ? WHERE id = ? AND (plan_code IS NULL OR plan_code = '')",
        [spec.code, spec.exploreId]
      );
    }

    // Repair empty curated lists (e.g. Body focus / Six pack / Stay active) so list cards open real workouts.
    const lists = await db.query('SELECT id, workout_ids FROM explore_lists');
    const allExplore = await db.query('SELECT id, workoutlist_ids FROM explore_workouts');
    const validIds = new Set(allExplore.map((w) => Number(w.id)));
    const fallbackByList = {
      83: [26, 33, 37, 40],
      108: [68, 84],
      109: [45, 46, 78, 79, 80],
      111: [44, 41, 42, 72, 73, 74, 81, 82, 83, 106],
      112: [68, 79, 80, 378],
      525: [50, 55, 99, 24, 378],
    };
    for (const l of lists) {
      const existing = db.parseJson(l.workout_ids, []) || [];
      if (existing.length) continue;
      const fromTags = allExplore
        .filter((w) => (db.parseJson(w.workoutlist_ids, []) || []).map(Number).includes(Number(l.id)))
        .map((w) => Number(w.id));
      const next = (fromTags.length ? fromTags : (fallbackByList[Number(l.id)] || [])).filter((id) => validIds.has(id));
      if (next.length) {
        await db.query('UPDATE explore_lists SET workout_ids = ? WHERE id = ?', [JSON.stringify(next), l.id]);
      }
    }
  } catch (e) {
    console.error('[bootstrap] ensureMissingWorkoutsAndLists:', e.message);
  }
}

module.exports = bootstrap;
