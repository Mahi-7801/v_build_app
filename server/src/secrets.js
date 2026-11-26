const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const ENV_PATH = path.resolve(__dirname, '..', '.env');

/**
 * Only these keys may ever be written from the admin panel. Allow-listing stops
 * an admin request from injecting arbitrary environment variables (e.g. JWT_SECRET).
 */
const WRITABLE = new Set([
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'PAYMENT_CURRENCY',
  'ADMIN_EMAIL', 'ADMIN_DISPLAY_NAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD',
]);

function readLines() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

function writeLines(lines) {
  const body = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  try {
    fs.writeFileSync(ENV_PATH, body, { mode: 0o600 });
    try { fs.chmodSync(ENV_PATH, 0o600); } catch { /* Windows chmod is best-effort */ }
  } catch {
    throw new Error('env_write_failed');
  }
}

/**
 * Persist gateway values to server/.env and apply them to the running process
 * immediately (no restart needed). Secret values are never returned to callers.
 */
function setEnvValues(patch = {}) {
  const lines = readLines();
  const changed = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!WRITABLE.has(key)) continue;
    const value = String(raw === undefined || raw === null ? '' : raw)
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 255);
    let updated = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=/);
      if (m && m[1] === key) {
        lines[i] = `${key}=${value}`;
        updated = true;
      }
    }
    if (!updated) lines.push(`${key}=${value}`);
    process.env[key] = value;
    changed.push(key);
  }
  writeLines(lines);
  return changed;
}

/** Public, non-sensitive status of the gateway — safe to send to any client. */
function paymentEnv() {
  return {
    keyIdConfigured: !!(process.env.RAZORPAY_KEY_ID || '').trim(),
    secretConfigured: !!(process.env.RAZORPAY_KEY_SECRET || '').trim(),
    currency: (process.env.PAYMENT_CURRENCY || 'INR').trim().toUpperCase() || 'INR',
  };
}

/** Admin login identity safe to return to the admin panel (never a password). */
function accountEnv() {
  return {
    email: (process.env.ADMIN_EMAIL || '').trim(),
    displayName: (process.env.ADMIN_DISPLAY_NAME || 'Admin').trim() || 'Admin',
  };
}

/** Verify the current admin password without ever returning it. */
async function verifyAdminPassword(password) {
  const hash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (hash) {
    try { return await bcrypt.compare(String(password || ''), hash); }
    catch { return false; }
  }
  const plain = (process.env.ADMIN_PASSWORD || '').trim();
  return !!plain && plain === String(password || '');
}

module.exports = { setEnvValues, paymentEnv, accountEnv, verifyAdminPassword, ENV_PATH };
