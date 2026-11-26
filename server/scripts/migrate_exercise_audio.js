/** Idempotent migration: per-exercise sound/audio cue. */
const db = require('../src/db');

async function main() {
  try {
    await db.query('ALTER TABLE exercises ADD COLUMN audio_url VARCHAR(512) NULL AFTER lottie_path');
    console.log('[audio] exercises.audio_url added');
  } catch (e) {
    if (/duplicate column/i.test(e.message)) console.log('[audio] exercises.audio_url already exists');
    else throw e;
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[audio] migration failed:', e.message);
  process.exit(1);
});
