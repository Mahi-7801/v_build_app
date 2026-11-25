/** Idempotent migration: adds the admin-editable plan price column. */
const db = require('../src/db');

async function main() {
  const col = await db.one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_plans' AND COLUMN_NAME = 'price_cents'`
  );
  if (!col) {
    await db.query('ALTER TABLE workout_plans ADD COLUMN price_cents INT NOT NULL DEFAULT 0 AFTER cover_image');
    console.log('[admin] added workout_plans.price_cents');
  } else {
    console.log('[admin] workout_plans.price_cents already present');
  }
  const anim = await db.one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_plans' AND COLUMN_NAME = 'lottie_url'`
  );
  if (!anim) {
    await db.query('ALTER TABLE workout_plans ADD COLUMN lottie_url VARCHAR(512) NULL AFTER price_cents');
    console.log('[admin] added workout_plans.lottie_url');
  } else {
    console.log('[admin] workout_plans.lottie_url already present');
  }
  process.exit(0);
}

main().catch((e) => { console.error('[admin] migration failed:', e.message); process.exit(1); });
