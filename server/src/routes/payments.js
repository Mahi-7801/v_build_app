const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getSettings } = require('../points');
const { configured, createPaymentLink, fetchPayment, isValidSignature } = require('../gateway');
const { SUCCESS, applyProviderPayment } = require('../paymentService');

const router = express.Router();
router.use(requireAuth);

/**
 * Start a Razorpay payment. The secret key is used on the server only; the app
 * receives just the hosted checkout URL.
 */
router.post('/create-link', async (req, res, next) => {
  try {
    if (!configured()) {
      return res.status(503).json({
        error: 'payment_not_configured',
        message: 'Payment gateway is not configured yet. Ask the admin to add Razorpay keys in Settings.',
      });
    }
    const settings = getSettings();
    const priceCents = Number(req.user.pro_price_cents || settings.proPriceCents);
    const amount = Math.max(0, priceCents / 100);
    if (amount <= 0) return res.status(400).json({ error: 'invalid_amount' });

    const token = crypto.randomBytes(24).toString('hex');
    const base = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const result = await db.query(
      `INSERT INTO payments
        (user_id, gateway, product_id, amount, currency, discount_percent, points_at_purchase, status, callback_token)
       VALUES (?, 'razorpay', ?, ?, ?, ?, ?, 'created', ?)`,
      [
        req.user.id, 'homeworkout_pro_year', amount, settings.paymentCurrency,
        Number(req.user.pro_discount_percent || 0), Number(req.user.points || 0), token,
      ]
    );
    const rowId = result.insertId;
    const callbackUrl = `${base}/api/payments/callback?token=${token}`;

    let link;
    try {
      link = await createPaymentLink({
        amount,
        currency: settings.paymentCurrency,
        description: 'V_build PRO membership',
        callbackUrl,
        notes: {
          user_id: String(req.user.id),
          payment_record_id: String(rowId),
          product_id: 'homeworkout_pro_year',
        },
      });
    } catch (e) {
      await db.query("UPDATE payments SET status = 'failed' WHERE id = ?", [rowId]);
      throw e;
    }
    if (!link.shortUrl) {
      await db.query("UPDATE payments SET status = 'failed' WHERE id = ?", [rowId]);
      return res.status(502).json({ error: 'payment_link_unavailable' });
    }
    await db.query('UPDATE payments SET payment_link_id = ? WHERE id = ?', [link.id, rowId]);

    // Only a public checkout URL goes back to the client — never keys or secrets.
    res.status(201).json({ url: link.shortUrl, paymentId: rowId, amount, currency: settings.paymentCurrency });
  } catch (e) { next(e); }
});

/**
 * Backup verification path for clients that receive the payment id directly.
 * The provider is always queried server-side; a client cannot grant PRO itself.
 */
router.post('/verify', async (req, res, next) => {
  try {
    const b = req.body || {};
    const providerPaymentId = String(b.paymentId || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    const recordId = Number(b.recordId || 0);
    if (!providerPaymentId) return res.status(400).json({ error: 'payment_id_required' });

    const row = recordId
      ? await db.one('SELECT * FROM payments WHERE id = ? AND user_id = ?', [recordId, req.user.id])
      : await db.one('SELECT * FROM payments WHERE payment_id = ? AND user_id = ?', [providerPaymentId, req.user.id]);
    if (!row) return res.status(404).json({ error: 'payment_not_found' });

    const linkId = String(b.paymentLinkId || row.payment_link_id || '');
    if (b.signature && !isValidSignature(`${linkId}|${providerPaymentId}`, b.signature)) {
      return res.status(400).json({ error: 'invalid_signature' });
    }

    const payment = await fetchPayment(providerPaymentId).catch(() => null);
    const expected = Math.round(Number(row.amount || 0) * 100);
    const amountOk = !expected || Math.abs(Number(payment?.amount || 0) - expected) <= 1;
    const ok = !!payment && amountOk && SUCCESS.has(String(payment.status || '').toLowerCase());
    if (!ok) await db.query("UPDATE payments SET status = 'failed' WHERE id = ?", [row.id]);
    else await applyProviderPayment(row, payment);

    res.json({ verified: ok, isPro: ok });
  } catch (e) { next(e); }
});

module.exports = router;
