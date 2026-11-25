const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: false,
  namedPlaceholders: true,
  multipleStatements: false,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run fn inside a transaction; rolls back on throw. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function healthcheck() {
  const row = await one('SELECT 1 AS ok');
  return row && row.ok === 1;
}

/**
 * MySQL 8 stores JSON natively; MariaDB aliases JSON to LONGTEXT, so the driver
 * hands back a string. Normalise both cases to a JS value.
 */
function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { pool, query, one, transaction, healthcheck, parseJson };
