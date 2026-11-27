const db = require('./db');

const SUCCESS = new Set(['captured', 'success', 'paid']);

/**
 * Confirm a provider payment, record it, and unlock PRO only when the provider
 * says the money was actually captured. Called by both the callback and the
 * verify endpoint so both paths behave identically.
 */
async function applyProviderPayment(row, payment) {
  if (!row || !payment) return false;
  if (SUCCESS.has(String(row.status || '').toLowerCase())) return true;
  const status = String(payment.status || '').toLowerCase();
  const ok = SUCCESS.has(status);
  await db.query(
    `UPDATE payments
     SET status = ?, payment_id = ?, method = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      ok ? 'captured' : (status.slice(0, 32) || 'failed'),
      String(payment.id || '').slice(0, 190) || null,
      String(payment.method || '').slice(0, 64) || null,
      row.id,
    ]
  );
  if (ok) {
    await db.query(
      'UPDATE users SET is_pro = 1, pro_expires_at = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
      [row.user_id]
    );
    await db.query(
      `INSERT INTO subscriptions (user_id, product_id, platform, receipt, active, expires_at)
       VALUES (?, ?, 'razorpay', ?, 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
      [row.user_id, row.product_id || 'homeworkout_pro_year', JSON.stringify({
        payment_id: payment.id, amount: payment.amount, currency: payment.currency, method: payment.method || null,
      })]
    );
  }
  return ok;
}

module.exports = { SUCCESS, applyProviderPayment };
