const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** Play Billing receipt validation stub (server-side verification hook). */
router.post('/verify', async (req, res, next) => {
  try {
    const { productId, receipt, platform = 'google_play', discountPercent = 0 } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'validation_error', message: 'productId required' });
    // A 40% discount is only honoured when the user has earned 5,000 fire points.
    const requested = Number(discountPercent || 0);
    const allowed = requested === 40 && Number(req.user.points || 0) >= 5000 ? 40 : 0;
    const receiptValue = JSON.stringify({
      receipt: receipt || null,
      discountPercent: allowed,
      pointsAtPurchase: Number(req.user.points || 0),
    });
    const result = await db.query(
      'INSERT INTO subscriptions (user_id, product_id, platform, receipt, active) VALUES (?, ?, ?, ?, 1)',
      [req.user.id, productId, platform, receiptValue]
    );
    await db.query('UPDATE users SET is_pro = 1, pro_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?', [req.user.id]);
    const sub = await db.one('SELECT * FROM subscriptions WHERE id = ?', [result.insertId]);
    const user = await db.one('SELECT id, is_pro, pro_expires_at FROM users WHERE id = ?', [req.user.id]);
    res.status(201).json({ subscription: sub, user });
  } catch (e) { next(e); }
});

/** DB-backed PRO status used by the app UI (checks subscription + expiry). */
router.get('/status', async (req, res, next) => {
  try {
    const user = await db.one('SELECT is_pro, pro_expires_at FROM users WHERE id = ?', [req.user.id]);
    const subs = await db.query(
      'SELECT id, product_id, active, expires_at FROM subscriptions WHERE user_id = ? AND active = 1 ORDER BY purchased_at DESC LIMIT 1',
      [req.user.id]
    );
    const activeSub = subs[0] || null;
    const notExpired = !user.pro_expires_at || new Date(user.pro_expires_at) > new Date();
    const isPro = Number(user.is_pro) === 1 && notExpired;
    res.json({
      isPro,
      is_pro: isPro ? 1 : 0,
      paymentDone: !!activeSub,
      subscription: activeSub,
      proExpiresAt: user.pro_expires_at,
    });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT id, product_id, platform, active, purchased_at, expires_at FROM subscriptions WHERE user_id = ? ORDER BY purchased_at DESC',
      [req.user.id]
    );
    res.json({
      subscriptions: rows,
      isPro: req.user.is_pro === 1,
      points: req.user.points || 0,
      discountPercent: req.user.pro_discount_percent || 0,
      discountedPriceCents: req.user.pro_price_cents,
    });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE subscriptions SET active = 0 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    await db.query('UPDATE users SET is_pro = 0, pro_expires_at = NULL WHERE id = ?', [req.user.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
