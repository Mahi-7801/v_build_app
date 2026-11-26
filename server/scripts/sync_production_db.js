const db = require('../src/db');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== Checking and Syncing Production Database ===');

  // 1. Ensure audio_url column exists
  try {
    const cols = await db.query("SHOW COLUMNS FROM exercises LIKE 'audio_url'");
    if (!cols.length) {
      await db.query("ALTER TABLE exercises ADD COLUMN audio_url VARCHAR(512) NULL AFTER lottie_path");
      console.log('Added audio_url column to exercises');
    }
  } catch (e) {
    console.error('Column audio_url check error:', e.message);
  }

  // 2. Link audio_url for all 209 exercises
  const audioUpdate = await db.query(`
    UPDATE exercises 
    SET audio_url = CONCAT('/api/assets/audio/ex_', id, '_a', action_id, '.mp3')
    WHERE audio_url IS NULL OR audio_url = ''
  `);
  console.log('Exercises audio_url updated:', audioUpdate.affectedRows || audioUpdate.changedRows || 0);

  const audioCheck = await db.one("SELECT COUNT(*) AS total, SUM(CASE WHEN audio_url IS NOT NULL AND audio_url != '' THEN 1 ELSE 0 END) AS withAudio FROM exercises");
  console.log(`Exercises audio status: ${audioCheck.withAudio}/${audioCheck.total} have audio_url`);

  // 3. Ensure category column on workout_plans is VARCHAR
  try {
    const col = await db.one("SHOW COLUMNS FROM workout_plans LIKE 'category'");
    if (col && /enum/i.test(col.Type || '')) {
      await db.query("ALTER TABLE workout_plans MODIFY COLUMN category VARCHAR(64) NOT NULL DEFAULT 'other'");
      console.log('workout_plans.category converted to VARCHAR');
    }
  } catch (e) {
    console.error('Category column check:', e.message);
  }

  // 4. Ensure payments table exists
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
    console.log('Payments table verified');
  } catch (e) {
    console.error('Payments table verify:', e.message);
  }

  // 5. Ensure app_config values
  const defaultConfigs = [
    ['payment_currency', 'INR'],
    ['points_target', '50000'],
    ['pro_discount_percent', '40'],
    ['pro_price_cents', '2999'],
    ['support_email', 'support@vbuild.app'],
    ['support_phone', ''],
    ['support_address', '']
  ];
  for (const [key, val] of defaultConfigs) {
    await db.query(`
      INSERT INTO app_config (config_key, value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE config_key = config_key
    `, [key, val]);
  }
  console.log('App config verified');

  // 6. Summary of database row counts
  const tables = await db.query('SHOW TABLES');
  const tableNames = tables.map((r) => Object.values(r)[0]);
  console.log('\n--- Table Row Counts ---');
  for (const name of tableNames) {
    try {
      const cnt = await db.one(`SELECT COUNT(*) AS c FROM \`${name}\``);
      console.log(`${name.padEnd(30)}: ${cnt.c} rows`);
    } catch (e) {
      console.log(`${name.padEnd(30)}: view or error (${e.message})`);
    }
  }

  console.log('\n=== Database Sync Completed Successfully ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
