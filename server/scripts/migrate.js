const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const SCHEMA = path.resolve(__dirname, '..', 'sql', 'schema.sql');
const fresh = process.argv.includes('--fresh');

async function main() {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  // strip comments, split on ';' at statement level
  const statements = sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  // connect without a database first so we can create it
  const admin = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false,
  });

  if (fresh) {
    console.log(`[migrate] dropping database ${config.db.database}`);
    await admin.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
  }

  for (const stmt of statements) {
    try {
      await admin.query(stmt);
    } catch (err) {
      // ignore "database exists" style noise, report the rest
      if (!/exists/i.test(err.message)) {
        console.error(`[migrate] failed statement:\n${stmt.slice(0, 120)}...\n  -> ${err.message}`);
        throw err;
      }
    }
  }
  await admin.end();
  console.log(`[migrate] applied ${statements.length} statements to ${config.db.database}`);
}

main().catch((e) => {
  console.error('[migrate] error:', e.message);
  process.exit(1);
});
