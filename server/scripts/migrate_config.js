/** Idempotent migration: admin-editable app settings (points target / PRO). */
const db = require('../src/db');

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      config_key   VARCHAR(60)  NOT NULL,
      value        VARCHAR(255) NOT NULL,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (config_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const [key, value] of [
    ['points_target', '5000'],
    ['pro_discount_percent', '40'],
    ['pro_price_cents', '2999'],
  ]) {
    await db.query('INSERT IGNORE INTO app_config (config_key, value) VALUES (?, ?)', [key, value]);
  }
  console.log('[config] app_config ready:', await db.query('SELECT config_key, value FROM app_config'));
  process.exit(0);
}

main().catch((e) => { console.error('[config] migration failed:', e.message); process.exit(1); });
