const db = require('./db');

/** Fire points earned for every completed workout. */
const POINTS_PER_WORKOUT = 5;

/** Admin-editable values, cached in memory and loaded from app_config. */
let settings = { pointsTarget: 5000, discountPercent: 40, proPriceCents: 2999 };
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function loadSettings() {
  try {
    const rows = await db.query('SELECT config_key, value FROM app_config');
    const m = {};
    for (const r of rows) m[r.config_key] = r.value;
    settings = {
      pointsTarget: Math.max(1, Math.round(num(m.points_target, 5000))),
      discountPercent: Math.min(100, Math.max(0, Math.round(num(m.pro_discount_percent, 40)))),
      proPriceCents: Math.max(0, Math.round(num(m.pro_price_cents, 2999))),
    };
  } catch {
    /* keep defaults if the table is not migrated yet */
  }
  return getSettings();
}

function getSettings() { return { ...settings }; }
function setSettings(patch) { settings = { ...settings, ...patch }; }

function pointsForSession() {
  return POINTS_PER_WORKOUT;
}

function decorateUser(user) {
  if (!user) return user;
  const { pointsTarget, discountPercent, proPriceCents } = settings;
  const points = Number(user.points || 0);
  const hasDiscount = points >= pointsTarget;
  const discountedCents = Math.round(proPriceCents * (100 - discountPercent) / 100);
  return {
    ...user,
    points,
    points_to_pro: Math.max(0, pointsTarget - points),
    pro_discount_percent: hasDiscount ? discountPercent : 0,
    pro_price_cents: hasDiscount ? discountedCents : proPriceCents,
  };
}

/** Adds points to the user and writes an audit row. */
async function awardPoints(userId, points, reason, refId = null) {
  const amount = Math.max(0, Math.round(Number(points || 0)));
  if (!amount) return { points: 0, total: 0 };
  await db.query('UPDATE users SET points = points + ? WHERE id = ?', [amount, userId]);
  await db.query(
    'INSERT INTO points_ledger (user_id, points, reason, ref_id) VALUES (?, ?, ?, ?)',
    [userId, amount, reason, refId]
  );
  const row = await db.one('SELECT points FROM users WHERE id = ?', [userId]);
  return { points: amount, total: Number(row?.points || 0) };
}

module.exports = {
  POINTS_PER_WORKOUT,
  pointsForSession,
  loadSettings,
  getSettings,
  setSettings,
  decorateUser,
  awardPoints,
};
