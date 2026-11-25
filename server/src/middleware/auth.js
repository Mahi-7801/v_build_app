const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { decorateUser } = require('../points');

function sign(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, admin: !!user.is_admin },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/** Populates req.user when a valid Bearer token is present; never throws. */
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    if (payload.admin) {
      req.user = { id: 0, email: payload.email, display_name: 'Admin', is_admin: true, points: 0 };
      return next();
    }
    const user = await db.one(
      'SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, pro_expires_at, points FROM users WHERE id = ?',
      [payload.sub]
    );
    if (user) req.user = decorateUser(user);
  } catch {
    /* ignore invalid token for optional routes */
  }
  next();
}

/** Rejects the request with 401 unless a valid user is attached. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    if (payload.admin) {
      req.user = { id: 0, email: payload.email, display_name: 'Admin', is_admin: true, points: 0 };
      return next();
    }
    const user = await db.one(
      'SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, pro_expires_at, points FROM users WHERE id = ?',
      [payload.sub]
    );
    if (!user) return res.status(401).json({ error: 'unauthorized', message: 'User not found' });
    req.user = decorateUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}

/** Gate for premium content (original app's "pro/broad_shoulde_lev*" assets). */
function requirePro(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const active = req.user.is_pro === 1 && (!req.user.pro_expires_at || new Date(req.user.pro_expires_at) > new Date());
  if (!active) return res.status(403).json({ error: 'pro_required', message: 'This workout requires an active subscription' });
  next();
}

/** Admin panel gate — the single configured admin account only. */
function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'admin_required', message: 'Admin access only' });
  next();
}

module.exports = { sign, requireAuth, optionalAuth, requirePro, requireAdmin };

