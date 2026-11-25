const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { decorateUser } = require('../points');
const config = require('../config');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await db.one('SELECT id FROM users WHERE email = ?', [body.email]);
    if (existing) return res.status(409).json({ error: 'email_taken', message: 'That email is already registered' });

    const hash = await bcrypt.hash(body.password, 12);
    const result = await db.transaction(async (conn) => {
      const [ins] = await conn.execute(
        'INSERT INTO users (email, password_hash, display_name, auth_provider) VALUES (?, ?, ?, ?)',
        [body.email, hash, body.displayName || body.email.split('@')[0], 'local']
      );
      await conn.execute('INSERT INTO user_settings (user_id) VALUES (?)', [ins.insertId]);
      return ins.insertId;
    });

    const user = decorateUser(await db.one('SELECT id, email, display_name, avatar_url, phone, auth_provider, is_pro, points FROM users WHERE id = ?', [result]));
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'validation_error', details: e.errors });
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    // The single admin account signs in through the same login screen.
    if (config.admin.email && config.admin.password
        && body.email.toLowerCase() === config.admin.email.toLowerCase()
        && body.password === config.admin.password) {
      const admin = {
        id: 0, email: config.admin.email, display_name: 'Admin',
        auth_provider: 'local', is_pro: 1, is_admin: true, points: 0,
      };
      return res.json({ token: sign(admin), user: admin });
    }
    const user = await db.one('SELECT * FROM users WHERE email = ?', [body.email]);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password' });
    }
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password' });
    const safe = decorateUser({ id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, auth_provider: user.auth_provider, is_pro: user.is_pro, points: user.points });
    res.json({ token: sign(safe), user: safe });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'validation_error', details: e.errors });
    next(e);
  }
});

/** Google Sign-In: client sends the verified idToken; we trust the verified payload. */
router.post('/google', async (req, res, next) => {
  try {
    const { idToken, email, name, picture } = req.body || {};
    if (!email) return res.status(400).json({ error: 'validation_error', message: 'email required' });
    const googleId = idToken ? String(idToken).slice(0, 190) : null;
    let user = googleId ? await db.one('SELECT * FROM users WHERE google_id = ?', [googleId]) : null;
    if (!user) user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      const result = await db.transaction(async (conn) => {
        const [ins] = await conn.execute(
          'INSERT INTO users (email, display_name, avatar_url, phone, auth_provider, google_id) VALUES (?, ?, ?, ?, ?)',
          [email, name || email.split('@')[0], picture || null, 'google', googleId]
        );
        await conn.execute('INSERT INTO user_settings (user_id) VALUES (?)', [ins.insertId]);
        return ins.insertId;
      });
      user = await db.one('SELECT * FROM users WHERE id = ?', [result]);
    } else if (googleId && !user.google_id) {
      await db.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
      user.google_id = googleId;
    }
    const safe = decorateUser({ id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, auth_provider: user.auth_provider, is_pro: user.is_pro, points: user.points });
    res.json({ token: sign(safe), user: safe });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

