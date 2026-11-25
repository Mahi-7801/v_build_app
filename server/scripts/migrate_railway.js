/**
 * Migration that honours DB_NAME instead of the schema's hardcoded
 * `USE home_workout`. Used for Railway where the database is named `railway`.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const SCHEMA = path.resolve(__dirname, '..', 'sql', 'schema.sql');

async function main() {
  const dbName = config.db.database;
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^CREATE\s+DATABASE/i.test(s))
    .filter((s) => !/^USE\s+/i.test(s));

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      if (!/already exists/i.test(err.message)) {
        console.error('[migrate] failed:', stmt.slice(0, 100), '->', err.message);
        throw err;
      }
    }
  }
  await conn.end();
  console.log(`[migrate] ${statements.length} statements applied to ${dbName}`);
}

main().catch((e) => { console.error('[migrate]', e.message); process.exit(1); });
