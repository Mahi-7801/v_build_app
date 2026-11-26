/** Idempotent migration: allow admin-defined workout categories. */
const db = require('../src/db');

async function main() {
  try {
    await db.query("ALTER TABLE workout_plans MODIFY COLUMN category VARCHAR(64) NOT NULL DEFAULT 'other'");
    console.log('[category] workout_plans.category is now free text');
  } catch (e) {
    console.error('[category] migration failed:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[category] migration failed:', e.message);
  process.exit(1);
});
