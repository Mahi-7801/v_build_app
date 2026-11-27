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
}

module.exports = bootstrap;
