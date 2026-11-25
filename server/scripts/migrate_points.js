/** Idempotent migration: adds the fire-points system to an existing database. */
const db = require('../src/db');

async function main() {
  const col = await db.one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'points'`
  );
  if (!col) {
    await db.query('ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0 AFTER pro_expires_at');
    console.log('[points] added users.points');
  } else {
    console.log('[points] users.points already present');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS points_ledger (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id     BIGINT UNSIGNED NOT NULL,
      points      INT             NOT NULL,
      reason      VARCHAR(60)     NOT NULL,
      ref_id      BIGINT UNSIGNED NULL,
      created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_points_ledger_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[points] points_ledger ready');

  const totals = await db.one('SELECT COUNT(*) AS users, COALESCE(SUM(points), 0) AS points FROM users');
  console.log(`[points] ${totals.users} users, ${totals.points} total points`);
  process.exit(0);
}

main().catch((e) => { console.error('[points] migration failed:', e.message); process.exit(1); });
