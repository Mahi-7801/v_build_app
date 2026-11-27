const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { decorateUser, getSettings, setSettings } = require('../points');
const { paymentEnv, accountEnv, verifyAdminPassword, setEnvValues } = require('../secrets');
const { scanAudioGaps, fillAudioGaps, hasAudioFile } = require('../audioGen');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads', 'animations');
const AUDIO_DIR = path.resolve(__dirname, '..', 'uploads', 'audio');

/** Admin settings. Gateway secrets are returned as flags only — never values. */
router.get('/settings', (_req, res) => res.json({ settings: getSettings(), payment: paymentEnv() }));

router.patch('/settings', async (req, res, next) => {
  try {
    const b = req.body || {};
    const next = { ...getSettings() };
    const values = [];
    const envPatch = {};
    if (b.pointsTarget !== undefined) {
      next.pointsTarget = Math.max(1, Math.round(Number(b.pointsTarget) || next.pointsTarget));
      values.push(['points_target', String(next.pointsTarget)]);
    }
    if (b.discountPercent !== undefined) {
      next.discountPercent = Math.min(100, Math.max(0, Math.round(Number(b.discountPercent))));
      values.push(['pro_discount_percent', String(next.discountPercent)]);
    }
    if (b.proPriceCents !== undefined) {
      next.proPriceCents = Math.max(0, Math.round(Number(b.proPriceCents)));
      values.push(['pro_price_cents', String(next.proPriceCents)]);
    }
    // Public support details — safe to store and hand back to the app.
    const textFields = [
      ['supportEmail', 'support_email', 190],
      ['supportAddress', 'support_address', 500],
      ['supportPhone', 'support_phone', 60],
      ['paymentCurrency', 'payment_currency', 10],
    ];
    for (const [field, column, max] of textFields) {
      if (b[field] !== undefined) {
        next[field] = String(b[field] || '').trim().slice(0, max);
        values.push([column, next[field]]);
      }
    }
    if (next.paymentCurrency) envPatch.PAYMENT_CURRENCY = next.paymentCurrency;

    for (const [key, value] of values) {
      await db.query(
        'INSERT INTO app_config (config_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, value]
      );
    }
    setSettings(next);

    // Gateway keys live only in server/.env. Allow-listed in secrets.js, so
    // no other environment variable can be touched through this endpoint.
    if (b.razorpayKeyId !== undefined) envPatch.RAZORPAY_KEY_ID = String(b.razorpayKeyId || '');
    if (b.razorpayKeySecret !== undefined) envPatch.RAZORPAY_KEY_SECRET = String(b.razorpayKeySecret || '');
    if (Object.keys(envPatch).length) setEnvValues(envPatch);

    res.json({ settings: getSettings(), payment: paymentEnv() });
  } catch (e) { next(e); }
});

/** Admin login identity — email and display name only, never a password. */
router.get('/account', (_req, res) => res.json(accountEnv()));

/**
 * Change the admin username (login email), display name and/or password.
 * The current password is required. New passwords are stored as bcrypt hashes.
 */
router.patch('/account', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(await verifyAdminPassword(b.currentPassword))) {
      return res.status(403).json({ error: 'invalid_current_password', message: 'Current password is incorrect' });
    }
    const patch = {};
    if (b.email !== undefined) {
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'validation_error', message: 'Enter a valid login email' });
      }
      patch.ADMIN_EMAIL = email;
    }
    if (b.displayName !== undefined) {
      const name = String(b.displayName || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'validation_error', message: 'Display name cannot be empty' });
      patch.ADMIN_DISPLAY_NAME = name;
    }
    if (b.newPassword !== undefined && String(b.newPassword) !== '') {
      const password = String(b.newPassword);
      if (password.length < 8 || password.length > 200) {
        return res.status(400).json({ error: 'validation_error', message: 'Password must be at least 8 characters' });
      }
      patch.ADMIN_PASSWORD_HASH = await bcrypt.hash(password, 12);
      // Remove the old plaintext value so only the hash remains in .env.
      patch.ADMIN_PASSWORD = '';
    }
    if (Object.keys(patch).length) setEnvValues(patch);
    res.json({ ...accountEnv(), passwordChanged: !!patch.ADMIN_PASSWORD_HASH });
  } catch (e) { next(e); }
});

/** Admin Payments page: every recorded payment, PRO memberships, and gateway state. */
router.get('/payments', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 120);
    const status = String(req.query.status || '').trim().slice(0, 32);
    const rows = await db.query(
      `SELECT p.id, p.user_id, p.gateway, p.product_id, p.order_id, p.payment_id,
              p.payment_link_id, p.method, p.status, p.amount, p.currency,
              p.discount_percent, p.points_at_purchase, p.created_at, p.updated_at,
              u.display_name, u.email,
              COALESCE(s.name, p.product_id) AS plan_name
       FROM payments p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN workout_plans s ON s.code = p.product_id
       WHERE (? = '' OR u.email LIKE ? OR u.display_name LIKE ? OR p.payment_id LIKE ? OR p.order_id LIKE ? OR p.payment_link_id LIKE ?)
         AND (? = '' OR p.status = ?)
       ORDER BY p.created_at DESC LIMIT 300`,
      [q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, status, status]
    );
    const [stats, subs, proOnly] = await Promise.all([
      db.one(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status IN ('captured','success','paid')),0) AS successful,
                COALESCE(SUM(CASE WHEN status IN ('captured','success','paid') THEN amount ELSE 0 END),0) AS revenue,
                COALESCE(SUM(status IN ('captured','success','paid') AND DATE(created_at) = CURDATE()),0) AS today_count,
                COALESCE(SUM(CASE WHEN status IN ('captured','success','paid') AND DATE(created_at) = CURDATE()
                                  THEN amount ELSE 0 END),0) AS today_revenue,
                MAX(created_at) AS last_at
         FROM payments`
      ),
      db.query(
        `SELECT s.id, s.user_id, s.product_id, s.platform, s.active, s.purchased_at, s.expires_at,
                u.display_name, u.email, u.is_pro
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.purchased_at DESC LIMIT 100`
      ).catch(() => []),
      db.query(
        `SELECT u.id AS user_id, u.display_name, u.email, u.is_pro,
                u.pro_expires_at AS expires_at, u.created_at AS purchased_at
         FROM users u
         WHERE u.is_pro = 1
           AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.active = 1)`
      ).catch(() => []),
    ]);
    const memberships = [
      ...subs.map((s) => ({
        id: `sub_${s.id}`,
        user_id: Number(s.user_id),
        display_name: s.display_name,
        email: s.email,
        product_id: s.product_id || 'homeworkout_pro_year',
        platform: s.platform || 'manual',
        active: !!s.active && !!s.is_pro,
        purchased_at: s.purchased_at,
        expires_at: s.expires_at,
      })),
      ...proOnly.map((u) => ({
        id: `pro_${u.user_id}`,
        user_id: Number(u.user_id),
        display_name: u.display_name,
        email: u.email,
        product_id: 'homeworkout_pro_year',
        platform: 'manual',
        active: true,
        purchased_at: u.purchased_at,
        expires_at: u.expires_at,
      })),
    ];
    const currency = getSettings().paymentCurrency || 'INR';
    res.json({
      payments: rows,
      subscriptions: memberships,
      gateway: paymentEnv(),
      stats: {
        total: Number(stats.total),
        successful: Number(stats.successful),
        revenue: Number(stats.revenue),
        todayCount: Number(stats.today_count),
        todayRevenue: Number(stats.today_revenue),
        lastAt: stats.last_at ? new Date(stats.last_at).toISOString() : null,
        currency,
      },
    });
  } catch (e) { next(e); }
});

/** Record a manual payment (UPI/Cash/Bank/Manual) and optionally activate PRO for 1 year. */
router.post('/payments/manual', async (req, res, next) => {
  try {
    const b = req.body || {};
    const userIdNum = Number(b.userId || 0);
    const emailInput = String(b.email || '').trim().toLowerCase();
    const user = userIdNum > 0
      ? await db.one('SELECT id, email, display_name, points FROM users WHERE id = ?', [userIdNum])
      : emailInput
        ? await db.one('SELECT id, email, display_name, points FROM users WHERE LOWER(email) = ?', [emailInput])
        : null;
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'Select a valid user or enter a registered email' });

    const settings = getSettings();
    const amount = Math.max(0, Number(b.amount ?? (settings.proPriceCents / 100)) || 0);
    const currency = String(b.currency || settings.paymentCurrency || 'INR').trim().toUpperCase().slice(0, 10) || 'INR';
    const method = String(b.method || 'manual').trim().slice(0, 64) || 'manual';
    const productId = String(b.productId || 'homeworkout_pro_year').trim().slice(0, 190) || 'homeworkout_pro_year';
    const paymentId = String(b.paymentId || `manual_${Date.now().toString(36)}`).trim().slice(0, 190);
    const grantPro = b.grantPro !== false;

    const payment = await db.transaction(async (conn) => {
      const [ins] = await conn.execute(
        `INSERT INTO payments
          (user_id, gateway, product_id, payment_id, method, status, amount, currency, discount_percent, points_at_purchase)
         VALUES (?, 'manual', ?, ?, ?, 'captured', ?, ?, 0, ?)`,
        [user.id, productId, paymentId, method, amount, currency, Number(user.points || 0)]
      );
      if (grantPro) {
        await conn.execute(
          'UPDATE users SET is_pro = 1, pro_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
          [user.id]
        );
        await conn.execute(
          `INSERT INTO subscriptions (user_id, product_id, platform, receipt, active, expires_at)
           VALUES (?, ?, 'manual', ?, 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
          [user.id, productId, JSON.stringify({ paymentRecordId: ins.insertId, paymentId, method, amount, currency })]
        );
      }
      const [rows] = await conn.execute(
        `SELECT p.*, u.display_name, u.email, COALESCE(s.name, p.product_id) AS plan_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN workout_plans s ON s.code = p.product_id
         WHERE p.id = ?`,
        [ins.insertId]
      );
      return rows[0] || null;
    });

    res.status(201).json({ payment, proActivated: grantPro });
  } catch (e) { next(e); }
});

/** Dashboard: lifetime totals, time-windowed stats, trend and a live activity feed. */
router.get('/overview', async (_req, res, next) => {
  try {
    const now = new Date();
    const dayKey = (d) => {
      const x = d instanceof Date ? d : new Date(d);
      return x.toISOString().slice(0, 10);
    };
    const today = dayKey(now);
    const weekAgo = dayKey(new Date(now.getTime() - 6 * 864e5));
    const monthAgo = dayKey(new Date(now.getTime() - 29 * 864e5));

    const [u, p, s, a, allSessions, pro, active7d, ex] = await Promise.all([
      db.one('SELECT COUNT(*) AS n, COALESCE(SUM(points),0) AS points FROM users'),
      db.one('SELECT COUNT(*) AS n FROM workout_plans'),
      db.one(`SELECT COUNT(*) AS n,
                      COALESCE(SUM(duration_sec),0) AS seconds,
                      COALESCE(SUM(total_calories),0) AS calories,
                      COALESCE(SUM(total_reps),0) AS reps
              FROM workout_sessions WHERE status = 'completed'`),
      db.one('SELECT COUNT(*) AS n FROM points_ledger'),
      db.one(`SELECT COUNT(*) AS n, COALESCE(SUM(status = 'completed'),0) AS completed
              FROM workout_sessions`),
      db.one('SELECT COUNT(*) AS n FROM users WHERE is_pro = 1'),
      db.one(`SELECT COUNT(DISTINCT user_id) AS n FROM workout_sessions
              WHERE status = 'completed' AND started_at >= ?`, [weekAgo]),
      db.one('SELECT COUNT(*) AS n FROM exercises'),
    ]);

    // Payment data is optional until migrate_payments.js has been run.
    const [paymentStats, recentPayments] = await Promise.all([
      db.one(`SELECT COUNT(*) AS n,
                     COALESCE(SUM(status IN ('captured','success','paid')),0) AS successful,
                     COALESCE(SUM(CASE WHEN status IN ('captured','success','paid') THEN amount ELSE 0 END),0) AS revenue
              FROM payments`).catch(() => null),
      db.query(`SELECT p.id, p.amount, p.currency, p.status, p.created_at,
                       u.display_name, u.email
                FROM payments p JOIN users u ON u.id = p.user_id
                ORDER BY p.created_at DESC LIMIT 3`).catch(() => []),
    ]);

    const [daily, signups, ledgerDays, recentSessions, recentUsers, recentPoints, topUsers, topPlans] = await Promise.all([
      db.query(`SELECT DATE(started_at) AS day, COUNT(*) AS sessions,
                       COALESCE(SUM(duration_sec),0) AS seconds,
                       COALESCE(SUM(total_calories),0) AS calories
                FROM workout_sessions
                WHERE status = 'completed' AND DATE(started_at) >= ?
                GROUP BY DATE(started_at) ORDER BY day`, [monthAgo]),
      db.query(`SELECT DATE(created_at) AS day, COUNT(*) AS n
                FROM users WHERE created_at >= ? GROUP BY DATE(created_at)`, [monthAgo]),
      db.query(`SELECT DATE(created_at) AS day, COALESCE(SUM(points),0) AS pts, COUNT(*) AS n
                FROM points_ledger WHERE created_at >= ? GROUP BY DATE(created_at)`, [monthAgo]),
      db.query(`SELECT s.title, s.started_at, s.duration_sec, u.display_name, u.email
                FROM workout_sessions s JOIN users u ON u.id = s.user_id
                WHERE s.status = 'completed' ORDER BY s.started_at DESC LIMIT 8`),
      db.query(`SELECT display_name, email, created_at FROM users
                ORDER BY created_at DESC LIMIT 5`),
      db.query(`SELECT l.points, l.reason, l.created_at, u.display_name, u.email
                FROM points_ledger l JOIN users u ON u.id = l.user_id
                ORDER BY l.created_at DESC LIMIT 8`),
      db.query(`SELECT u.id, u.display_name, u.email, u.points, u.is_pro, COUNT(s.id) AS sessions
                FROM users u LEFT JOIN workout_sessions s
                  ON s.user_id = u.id AND s.status = 'completed'
                GROUP BY u.id ORDER BY u.points DESC, u.id LIMIT 5`),
      db.query(`SELECT p.id, p.name, p.category, p.level, COUNT(s.id) AS sessions
                FROM workout_plans p LEFT JOIN workout_sessions s
                  ON s.plan_id = p.id AND s.status = 'completed'
                GROUP BY p.id ORDER BY sessions DESC, p.id LIMIT 5`),
    ]);

    const sumFrom = (rows, from) => rows
      .filter((r) => dayKey(r.day) >= from)
      .reduce((acc, r) => ({
        sessions: acc.sessions + Number(r.sessions || 0),
        minutes: acc.minutes + Math.round(Number(r.seconds || 0) / 60),
        calories: acc.calories + Math.round(Number(r.calories || 0)),
      }), { sessions: 0, minutes: 0, calories: 0 });
    const usersFrom = (from) => signups
      .filter((r) => dayKey(r.day) >= from)
      .reduce((n, r) => n + Number(r.n || 0), 0);
    const pointsFrom = (from) => ledgerDays
      .filter((r) => dayKey(r.day) >= from)
      .reduce((acc, r) => ({
        points: acc.points + Number(r.pts || 0),
        entries: acc.entries + Number(r.n || 0),
      }), { points: 0, entries: 0 });
    const buildPeriod = (from) => {
      const totals = sumFrom(daily, from);
      const pts = pointsFrom(from);
      return { ...totals, newUsers: usersFrom(from), points: pts.points, pointEntries: pts.entries };
    };

    const periods = {
      today: buildPeriod(today),
      week: buildPeriod(weekAgo),
      month: buildPeriod(monthAgo),
    };
    const trend = Array.from({ length: 7 }, (_, i) => {
      const day = dayKey(new Date(now.getTime() - (6 - i) * 864e5));
      const row = daily.find((r) => dayKey(r.day) === day);
      return {
        day,
        sessions: Number(row?.sessions || 0),
        minutes: Math.round(Number(row?.seconds || 0) / 60),
      };
    });

    const activity = [
      ...recentSessions.map((r) => ({
        type: 'session',
        title: r.title || 'Workout completed',
        sub: r.display_name || r.email || 'User',
        value: `${Math.round(Number(r.duration_sec || 0) / 60)} min`,
        time: r.started_at ? new Date(r.started_at).toISOString() : null,
      })),
      ...recentUsers.map((r) => ({
        type: 'user',
        title: 'New user joined',
        sub: r.display_name || r.email || 'User',
        value: '',
        time: r.created_at ? new Date(r.created_at).toISOString() : null,
      })),
      ...recentPoints.map((r) => ({
        type: 'points',
        title: r.reason || 'Points earned',
        sub: r.display_name || r.email || 'User',
        value: `+${Number(r.points || 0)}`,
        time: r.created_at ? new Date(r.created_at).toISOString() : null,
      })),
    ].filter((x) => x.time).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 12);

    res.json({
      // Lifetime counters (legacy keys kept for older app builds).
      users: u.n, plans: p.n, sessions: s.n,
      totalPoints: Number(u.points), totalMinutes: Math.round(s.seconds / 60),
      totalCalories: Math.round(s.calories), pointEntries: a.n,
      // Extra lifetime context.
      totalSessions: Number(allSessions.n),
      completedSessions: Number(allSessions.completed),
      completionRate: Number(allSessions.n)
        ? Math.round((Number(allSessions.completed) / Number(allSessions.n)) * 100) : 0,
      proUsers: Number(pro.n), activeUsers: Number(active7d.n),
      totalReps: Number(s.reps), exercises: Number(ex.n),
      // Time-based + live feed.
      periods, trend, activity,
      payments: {
        total: Number(paymentStats?.n || 0),
        successful: Number(paymentStats?.successful || 0),
        revenue: Number(paymentStats?.revenue || 0),
        currency: getSettings().paymentCurrency,
      },
      recentPayments: recentPayments.map((r) => ({
        id: Number(r.id),
        amount: Number(r.amount || 0),
        currency: r.currency,
        status: r.status,
        name: r.display_name || r.email || 'User',
        time: r.created_at ? new Date(r.created_at).toISOString() : null,
      })),
      topUsers: topUsers.map((r) => ({
        id: Number(r.id), name: r.display_name || r.email || 'User',
        points: Number(r.points || 0), sessions: Number(r.sessions || 0), isPro: !!r.is_pro,
      })),
      topPlans: topPlans.map((r) => ({
        id: Number(r.id), name: r.name, category: r.category,
        level: Number(r.level || 1), sessions: Number(r.sessions || 0),
      })),
      generatedAt: now.toISOString(),
    });
  } catch (e) { next(e); }
});

/** All accounts with their progress totals. */
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await db.query(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.is_pro, u.points, u.created_at,
              MAX(s.completed_at) AS last_active,
              COUNT(s.id) AS sessions,
              COALESCE(SUM(s.duration_sec),0) AS seconds,
              COALESCE(SUM(s.total_calories),0) AS calories
       FROM users u LEFT JOIN workout_sessions s ON s.user_id = u.id AND s.status = 'completed'
       WHERE (? = '' OR u.email LIKE ? OR u.display_name LIKE ?)
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`,
      [q, `%${q}%`, `%${q}%`]
    );
    res.json({ users: rows.map(decorateUser) });
  } catch (e) { next(e); }
});

/** Everything about one user: profile, workouts, progress, achievements, points. */
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await db.one(
      'SELECT id, email, display_name, avatar_url, is_pro, pro_expires_at, points, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'not_found' });
    const [workouts, plans, summary, achievements, ledger] = await Promise.all([
      db.query(
        `SELECT id, title, status, started_at, completed_at, duration_sec,
                total_calories, exercises_done, exercises_total
         FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 25`,
        [user.id]
      ),
      db.query(
        `SELECT up.id, up.current_day, up.completed_days, up.total_workouts,
                wp.name, wp.code, wp.category, wp.level
         FROM user_plans up JOIN workout_plans wp ON wp.id = up.plan_id
         WHERE up.user_id = ? ORDER BY up.last_workout_at DESC LIMIT 20`,
        [user.id]
      ),
      db.one(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM(duration_sec),0) AS seconds,
                COALESCE(SUM(total_calories),0) AS calories,
                COALESCE(SUM(exercises_done),0) AS exercises
         FROM workout_sessions WHERE user_id = ? AND status = 'completed'`,
        [user.id]
      ),
      db.query('SELECT achievement_id, progress, unlocked_at FROM user_achievements WHERE user_id = ? LIMIT 20', [user.id]).catch(() => []),
      db.query('SELECT id, points, reason, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 15', [user.id]),
    ]);
    res.json({
      user: decorateUser(user),
      workouts,
      plans,
      progress: {
        sessions: summary.sessions,
        minutes: Math.round(summary.seconds / 60),
        calories: Math.round(summary.calories),
        exercises: summary.exercises,
      },
      achievements,
      pointsLedger: ledger,
    });
  } catch (e) { next(e); }
});

/** Plans with their admin-editable price and exercise audio coverage. */
router.get('/plans', async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT p.id, p.code, p.name, p.description, p.category, p.level, p.duration_sec, p.total_exercises,
              p.price_cents, p.lottie_url, p.cover_image, p.is_pro, p.sort_order,
              COALESCE(cov.distinct_exercises, 0) AS distinct_exercises,
              COALESCE(cov.audio_ready_exercises, 0) AS audio_ready_exercises
       FROM workout_plans p
       LEFT JOIN (
         SELECT i.plan_id,
                COUNT(DISTINCT i.exercise_id) AS distinct_exercises,
                COUNT(DISTINCT CASE WHEN e.audio_url IS NOT NULL AND e.audio_url <> '' THEN i.exercise_id END) AS audio_ready_exercises
         FROM workout_plan_items i
         LEFT JOIN exercises e ON e.id = i.exercise_id
         GROUP BY i.plan_id
       ) cov ON cov.plan_id = p.id
       ORDER BY (CASE WHEN p.sort_order = 0 OR p.sort_order = 999 THEN 0 ELSE 1 END),
                (CASE WHEN p.sort_order = 0 OR p.sort_order = 999 THEN -p.id ELSE p.sort_order END),
                p.id
       LIMIT 250`
    );
    res.json({ plans: rows });
  } catch (e) { next(e); }
});

/** Full plan detail — days and ordered exercise items — for the admin builder. */
router.get('/plans/:id', async (req, res, next) => {
  try {
    const byId = /^\d+$/.test(String(req.params.id));
    const plan = await db.one(
      byId ? 'SELECT * FROM workout_plans WHERE id = ?' : 'SELECT * FROM workout_plans WHERE code = ?',
      [req.params.id]
    );
    if (!plan) return res.status(404).json({ error: 'not_found' });
    const days = await db.query('SELECT id, day_index, name FROM workout_plan_days WHERE plan_id = ? ORDER BY day_index', [plan.id]);
    const items = await db.query(
      `SELECT i.id, i.sequence, i.action_id, i.exercise_id, i.time_sec, i.rest_sec, i.rounds,
              e.unit, e.name, e.lottie_path, e.audio_url
       FROM workout_plan_items i LEFT JOIN exercises e ON e.id = i.exercise_id
       WHERE i.plan_id = ? ORDER BY i.day_id, i.sequence`,
      [plan.id]
    );
    res.json({ plan, days, items });
  } catch (e) { next(e); }
});

/** Edit plan details / price / PRO flag / day name / ordered exercise items. */
router.patch('/plans/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    for (const key of ['name', 'description', 'category', 'level', 'duration_sec', 'price_cents', 'lottie_url', 'cover_image', 'is_pro']) {
      if (b[key] !== undefined) { sets.push(`${key} = ?`); vals.push(b[key]); }
    }
    if (sets.length) {
      vals.push(req.params.id);
      await db.query(`UPDATE workout_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (b.dayName !== undefined) {
      await db.query('UPDATE workout_plan_days SET name = ? WHERE plan_id = ? AND day_index = 1',
        [String(b.dayName || 'Day 1').slice(0, 120), req.params.id]);
    }
    if (Array.isArray(b.items)) {
      const items = b.items.slice(0, 60).map((it) => ({
        exerciseId: Number(it.exerciseId || it.id || 0),
        timeSec: Math.max(1, Math.round(Number(it.timeSec || 30))),
        restSec: Math.max(0, Math.round(Number(it.restSec || 10))),
        rounds: Math.max(1, Math.round(Number(it.rounds || 1))),
      })).filter((it) => it.exerciseId);
      await db.transaction(async (conn) => {
        const [days] = await conn.execute('SELECT id FROM workout_plan_days WHERE plan_id = ? ORDER BY day_index LIMIT 1', [req.params.id]);
        const dayId = days[0]?.id;
        await conn.execute('DELETE FROM workout_plan_items WHERE plan_id = ?', [req.params.id]);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const ex = await db.one('SELECT action_id FROM exercises WHERE id = ?', [it.exerciseId]);
          await conn.execute(
            `INSERT INTO workout_plan_items
              (plan_id, day_id, action_id, exercise_id, sequence, time_sec, rest_sec, rounds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.params.id, dayId || null, ex?.action_id ?? 0, it.exerciseId, i,
             it.timeSec, it.restSec, it.rounds]
          );
        }
        await conn.execute('UPDATE workout_plans SET total_exercises = ? WHERE id = ?', [items.length, req.params.id]);
      });
    }
    if (!sets.length && b.dayName === undefined && !Array.isArray(b.items)) {
      return res.status(400).json({ error: 'nothing_to_update' });
    }
    await db.query('UPDATE workout_plans SET updated_at = NOW() WHERE id = ?', [req.params.id]);
    req.app.get('clearReadCache')?.();
    // Auto-fill audio for any exercises in this plan that still lack audio.
    await fillAudioGaps({ planId: Number(req.params.id) }).catch(() => {});
    const plan = await db.one('SELECT * FROM workout_plans WHERE id = ?', [req.params.id]);
    res.json({ plan });
  } catch (e) { next(e); }
});

/** Exercises available when uploading a new workout, filtered by level. */
router.get('/exercises', async (req, res, next) => {
  try {
    const level = Number(req.query.level || 0);
    const q = String(req.query.q || '').trim();
    const where = `WHERE (? = 0 OR level = ? OR (? = 3 AND level = 4))
                     AND (? = '' OR name LIKE ?)`;
    const params = [level, level, level, q, `%${q}%`];
    let rows;
    try {
      rows = await db.query(
        `SELECT id, action_id, slug, name, introduce, unit, level,
                lottie_path, audio_url, video_url, image_path, primary_muscle, equipment,
                calories_per_unit, is_pro,
                (lottie_path IS NOT NULL AND lottie_path <> '') AS has_animation,
                (audio_url IS NOT NULL AND audio_url <> '') AS has_audio
         FROM exercises ${where}
         ORDER BY level, action_id LIMIT 400`,
        params
      );
    } catch (e) {
      // Older databases may not have audio_url until bootstrap adds it.
      if (!/audio_url/i.test(e.message)) throw e;
      rows = await db.query(
        `SELECT id, action_id, slug, name, introduce, unit, level,
                lottie_path, NULL AS audio_url, video_url, image_path,
                primary_muscle, equipment, calories_per_unit, is_pro,
                (lottie_path IS NOT NULL AND lottie_path <> '') AS has_animation,
                0 AS has_audio
         FROM exercises ${where}
         ORDER BY level, action_id LIMIT 400`,
        params
      );
    }
    res.json({ exercises: rows });
  } catch (e) { next(e); }
});

/** Store the localized copy, steps and coach tips for an exercise. */
async function writeExerciseText(exerciseId, b) {
  const lang = 'en';
  const steps = Array.isArray(b.steps)
    ? b.steps.map((s) => ({ text: String(s).slice(0, 500) })).filter((s) => s.text)
    : [];
  const tips = Array.isArray(b.coachTips)
    ? b.coachTips.map((t) => ({ content: String(t).slice(0, 500) })).filter((t) => t.content)
    : [];
  await db.query(
    `INSERT INTO exercise_texts (exercise_id, lang, title, description, steps, coach_tips)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description),
       steps = VALUES(steps), coach_tips = VALUES(coach_tips)`,
    [
      exerciseId, lang,
      String(b.title || b.name || '').slice(0, 255),
      String(b.description || '').slice(0, 2000),
      JSON.stringify(steps), JSON.stringify(tips),
    ]
  );
  // Keep the separate tip table in sync for older clients.
  await db.query('DELETE FROM exercise_tips WHERE exercise_id = ?', [exerciseId]);
  for (let i = 0; i < tips.length; i++) {
    await db.query(
      'INSERT INTO exercise_tips (exercise_id, lang, tip_type, title, content, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [exerciseId, lang, 'mistake', '', tips[i].content, i]
    );
  }
}

/** Full exercise detail for the admin editor. */
router.get('/exercises/:id', async (req, res, next) => {
  try {
    const exercise = await db.one('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
    if (!exercise) return res.status(404).json({ error: 'not_found' });
    const text = await db.one('SELECT title, description, steps, coach_tips FROM exercise_texts WHERE exercise_id = ? AND lang = ?', [exercise.id, 'en']);
    const tips = await db.query('SELECT content FROM exercise_tips WHERE exercise_id = ? AND lang = ? ORDER BY sort_order', [exercise.id, 'en']);
    res.json({
      exercise,
      text: text || null,
      steps: db.parseJson(text?.steps, []),
      coachTips: db.parseJson(text?.coach_tips, []).map((t) => t.text || t.content || t.title || ''),
      tips,
    });
  } catch (e) { next(e); }
});

/** Create an exercise with its animation, description, steps and coach tips. */
router.post('/exercises', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'validation_error', message: 'Exercise name required' });
    let actionId = Math.max(0, Math.round(Number(b.actionId || 0)));
    if (!actionId) {
      const max = await db.one('SELECT COALESCE(MAX(action_id), 0) + 1 AS n FROM exercises');
      actionId = Number(max.n);
    }
    const slug = String(b.slug || '').trim() || `custom_${Date.now()}`;
    const result = await db.query(
      `INSERT INTO exercises
        (action_id, slug, name, introduce, unit, level, lottie_path, audio_url, video_url,
         image_path, primary_muscle, equipment, calories_per_unit, is_pro, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 999)`,
      [
        actionId, slug, name, String(b.description || '').slice(0, 2000),
        ['s', 'reps', 'km'].includes(b.unit) ? b.unit : 's',
        Math.min(4, Math.max(1, Math.round(Number(b.level || 1)))),
        String(b.lottieUrl || '').trim() || null,
        String(b.audioUrl || '').trim() || null,
        String(b.videoUrl || '').trim() || null,
        String(b.imageUrl || '').trim() || null,
        String(b.primaryMuscle || '').trim().slice(0, 64) || null,
        ['none', 'bench', 'dumbbell', 'band', 'towel'].includes(b.equipment) ? b.equipment : 'none',
        Math.max(0, Number(b.caloriesPerUnit || 0)),
        b.isPro ? 1 : 0,
      ]
    );
    await writeExerciseText(result.insertId, b);
    if (!String(b.audioUrl || '').trim() && b.autoAudio !== false) {
      await fillAudioGaps({ exerciseIds: [result.insertId] }).catch(() => {});
    }
    req.app.get('clearReadCache')?.();
    const exercise = await db.one('SELECT * FROM exercises WHERE id = ?', [result.insertId]);
    res.status(201).json({ exercise });
  } catch (e) { next(e); }
});

/** Update an exercise and all of its details at any time. */
router.patch('/exercises/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    const columns = {
      name: 'name', slug: 'slug', description: 'introduce', unit: 'unit', level: 'level',
      lottieUrl: 'lottie_path', audioUrl: 'audio_url', videoUrl: 'video_url', imageUrl: 'image_path',
      primaryMuscle: 'primary_muscle', equipment: 'equipment',
      caloriesPerUnit: 'calories_per_unit', isPro: 'is_pro', actionId: 'action_id',
    };
    for (const [key, column] of Object.entries(columns)) {
      if (b[key] === undefined) continue;
      let value = b[key];
      if (key === 'level') value = Math.min(4, Math.max(1, Math.round(Number(value || 1))));
      if (key === 'isPro') value = value ? 1 : 0;
      if (key === 'caloriesPerUnit' || key === 'actionId') value = Math.max(0, Number(value || 0));
      if (key === 'equipment' && !['none', 'bench', 'dumbbell', 'band', 'towel'].includes(value)) value = 'none';
      if (key === 'unit' && !['s', 'reps', 'km'].includes(value)) value = 's';
      sets.push(`${column} = ?`);
      vals.push(value);
    }
    if (sets.length) {
      vals.push(req.params.id);
      await db.query(`UPDATE exercises SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (b.steps !== undefined || b.coachTips !== undefined || b.description !== undefined || b.title !== undefined) {
      const current = await db.one('SELECT name FROM exercises WHERE id = ?', [req.params.id]);
      await writeExerciseText(req.params.id, { ...b, name: b.title || b.name || current?.name });
    }
    req.app.get('clearReadCache')?.();
    const exercise = await db.one('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
    res.json({ exercise });
  } catch (e) { next(e); }
});

/** Duplicate an exercise so the admin can rename it and change animation/sound/details. */
router.post('/exercises/:id/duplicate', async (req, res, next) => {
  try {
    const source = await db.one('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
    if (!source) return res.status(404).json({ error: 'not_found' });
    const max = await db.one('SELECT COALESCE(MAX(action_id), 0) + 1 AS n FROM exercises');
    const result = await db.query(
      `INSERT INTO exercises
        (action_id, slug, name, introduce, unit, level, lottie_path, audio_url, video_url,
         image_path, primary_muscle, equipment, calories_per_unit, is_pro, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(max.n), `copy_${Date.now()}`, `${source.name} Copy`, source.introduce,
        source.unit, source.level, source.lottie_path, source.audio_url, source.video_url,
        source.image_path, source.primary_muscle, source.equipment,
        source.calories_per_unit, source.is_pro, source.sort_order,
      ]
    );
    const newId = result.insertId;
    const text = await db.one('SELECT title, description, steps, coach_tips FROM exercise_texts WHERE exercise_id = ? AND lang = ?', [source.id, 'en']);
    if (text) {
      await db.query(
        `INSERT INTO exercise_texts (exercise_id, lang, title, description, steps, coach_tips)
         VALUES (?, 'en', ?, ?, ?, ?)`,
        [newId, `${text.title || source.name} Copy`, text.description, text.steps, text.coach_tips]
      );
    }
    const tips = await db.query('SELECT tip_type, title, content, sort_order FROM exercise_tips WHERE exercise_id = ? AND lang = ?', [source.id, 'en']);
    for (const t of tips) {
      await db.query(
        `INSERT INTO exercise_tips (exercise_id, lang, tip_type, title, content, sort_order)
         VALUES (?, 'en', ?, ?, ?, ?)`,
        [newId, t.tip_type, t.title, t.content, t.sort_order]
      );
    }
    const exercise = await db.one('SELECT * FROM exercises WHERE id = ?', [newId]);
    res.status(201).json({ exercise });
  } catch (e) { next(e); }
});

/** Upload/create a new workout plan with its exercises. */
router.post('/plans', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'validation_error', message: 'Workout name required' });
    const code = String(b.code || '').trim() || `admin_${Date.now()}`;
    const category = String(b.category || 'other');
    const level = Math.min(3, Math.max(1, Number(b.level || 1)));
    const durationSec = Math.max(0, Number(b.durationSec || 0));
    const priceCents = Math.max(0, Number(b.priceCents || 0));
    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 60)
      : (Array.isArray(b.exerciseIds) ? b.exerciseIds.map((id) => ({ exerciseId: id })).slice(0, 60) : []);
    const items = rawItems
      .map((it) => ({
        exerciseId: Number(it.exerciseId || it.id || 0),
        timeSec: Math.max(1, Math.round(Number(it.timeSec || 30))),
        restSec: Math.max(0, Math.round(Number(it.restSec || 10))),
        rounds: Math.max(1, Math.round(Number(it.rounds || 1))),
      }))
      .filter((it) => it.exerciseId);
    const dayName = String(b.dayName || 'Day 1').trim().slice(0, 120) || 'Day 1';

    const planId = await db.transaction(async (conn) => {
      const [ins] = await conn.execute(
        `INSERT INTO workout_plans
          (code, name, description, category, level, duration_sec, total_exercises, rounds, price_cents, lottie_url, cover_image, is_pro, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0)`,
        [code, name, b.description || null, category, level, durationSec, items.length,
         priceCents, b.lottieUrl || null, b.coverImage || null, b.is_pro ? 1 : 0]
      );
      const pid = ins.insertId;
      const [day] = await conn.execute(
        'INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, 1, ?)',
        [pid, dayName]
      );
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const ex = await db.one('SELECT action_id FROM exercises WHERE id = ?', [it.exerciseId]);
        await conn.execute(
          `INSERT INTO workout_plan_items
            (plan_id, day_id, action_id, exercise_id, sequence, time_sec, rest_sec, rounds)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [pid, day.insertId, ex?.action_id ?? 0, it.exerciseId, i,
           it.timeSec, it.restSec, it.rounds]
        );
      }
      return pid;
    });
    req.app.get('clearReadCache')?.();
    const plan = await db.one('SELECT * FROM workout_plans WHERE id = ?', [planId]);
    // Ensure all exercises in the newly created workout have coaching audio.
    await fillAudioGaps({ planId }).catch(() => {});
    res.status(201).json({ plan });
  } catch (e) { next(e); }
});

/**
 * Upload an animation (GIF or Lottie JSON) from the admin panel. The file is
 * saved on the server and served through /api/assets/animations so the app can
 * play it without a native rebuild.
 */
router.post('/assets/animation', async (req, res, next) => {
  try {
    const b = req.body || {};
    const base64 = String(b.base64 || '').replace(/^data:[^,]+,/, '');
    const mime = String(b.mimeType || '');
    const allowed = ['image/gif', 'image/png', 'image/jpeg', 'application/json'];
    if (!base64 || !allowed.includes(mime)) {
      return res.status(400).json({ error: 'validation_error', message: 'Send a GIF, PNG, JPG or Lottie JSON file' });
    }
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'validation_error', message: 'File must be under 5 MB' });
    }
    const ext = mime === 'image/gif' ? '.gif' : mime === 'application/json' ? '.json' : '.png';
    const safe = String(b.name || 'animation').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'animation';
    const file = `anim_${Date.now()}_${safe}${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buffer);
    const base = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.status(201).json({
      url: `${base}/api/assets/animations/${file}`,
      kind: ext === '.gif' ? 'gif' : 'lottie',
      size: buffer.length,
    });
  } catch (e) { next(e); }
});

/** Upload a per-exercise sound cue (MP3 / M4A / WAV / OGG). */
router.post('/assets/audio', async (req, res, next) => {
  try {
    const b = req.body || {};
    const base64 = String(b.base64 || '').replace(/^data:[^,]+,/, '');
    const mime = String(b.mimeType || '');
    const extensions = {
      'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
      'audio/ogg': '.ogg', 'audio/aac': '.aac', 'audio/webm': '.webm',
    };
    const ext = extensions[mime];
    if (!base64 || !ext) {
      return res.status(400).json({ error: 'validation_error', message: 'Send an MP3, M4A, WAV, OGG or AAC file' });
    }
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'validation_error', message: 'Sound file must be under 8 MB' });
    }
    const safe = String(b.name || 'cue').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'cue';
    const file = `cue_${Date.now()}_${safe}${ext}`;
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUDIO_DIR, file), buffer);
    res.status(201).json({ url: `/api/assets/audio/${file}`, size: buffer.length });
  } catch (e) { next(e); }
});

/** Check all workout plans and exercises for missing or broken audio cues. */
router.get('/audio/gaps', async (_req, res, next) => {
  try {
    const report = await scanAudioGaps();
    res.json(report);
  } catch (e) { next(e); }
});

/** Generate and apply coaching audio for all missing workout/exercise gaps (or targeted plan/exerciseIds). */
router.post('/audio/generate', async (req, res, next) => {
  try {
    const b = req.body || {};
    const result = await fillAudioGaps({
      planId: b.planId ? Number(b.planId) : undefined,
      exerciseIds: Array.isArray(b.exerciseIds) ? b.exerciseIds : undefined,
      overwrite: !!b.overwrite,
    });
    res.json(result);
  } catch (e) { next(e); }
});

/** Generate/regenerate coaching audio for a single exercise. */
router.post('/exercises/:id/generate-audio', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    const result = await fillAudioGaps({ exerciseIds: [id], overwrite: true });
    const exercise = await db.one('SELECT * FROM exercises WHERE id = ?', [id]);
    if (!exercise) return res.status(404).json({ error: 'not_found' });
    res.json({ exercise, generated: result.generated[0] || null, failed: result.failed[0] || null });
  } catch (e) { next(e); }
});

module.exports = router;
