const express = require('express');
const db = require('../db');
const { fetchPayment, isValidSignature } = require('../gateway');
const { SUCCESS, applyProviderPayment } = require('../paymentService');

const router = express.Router();

/** Fixed strings only — no user/provider text is interpolated into the page. */
function page(ok) {
  const title = ok ? 'Payment complete' : 'Payment not completed';
  const body = ok
    ? 'Your PRO membership is active. You can close this page and return to the app.'
    : 'We could not confirm this payment. If money was charged, please contact support from the app.';
  const scheme = ok ? 'homeworkout://payment?status=success' : 'homeworkout://payment?status=failed';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#F6F8FA;color:#1C212C;margin:0;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
.card{background:#fff;border-radius:18px;padding:32px;max-width:380px;box-shadow:0 12px 30px rgba(0,74,255,.12)}
h1{font-size:22px;margin:0 0 12px}p{font-size:14px;line-height:21px;color:#6B7280;margin:0 0 24px}
a{display:inline-block;background:#004AFF;color:#fff;text-decoration:none;border-radius:999px;
padding:12px 24px;font-weight:700}.ok{color:#22C55E}</style></head>
<body><div class="card"><h1 class="${ok ? 'ok' : ''}">${title}</h1><p>${body}</p>
<a href="${scheme}">Return to app</a></div></body></html>`;
}

/** Razorpay redirects the device browser here after checkout. No Bearer token
 * is present, so this route identifies the attempt by an unguessable token. */
router.get('/', async (req, res) => {
  try {
    const token = String(req.query.token || '').slice(0, 80);
    const providerPaymentId = String(req.query.payment_id || req.query.paymentId || '')
      .replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    const signature = String(req.query.signature || '');
    const row = token ? await db.one('SELECT * FROM payments WHERE callback_token = ?', [token]) : null;
    if (!row) return res.status(400).type('html').send(page(false));

    if (!providerPaymentId) {
      await db.query("UPDATE payments SET status = 'abandoned' WHERE id = ?", [row.id]);
      return res.type('html').send(page(false));
    }

    const linkId = String(req.query.payment_link_id || row.payment_link_id || '');
    const signatureOk = signature ? isValidSignature(`${linkId}|${providerPaymentId}`, signature) : false;
    const payment = await fetchPayment(providerPaymentId).catch(() => null);
    const expected = Math.round(Number(row.amount || 0) * 100);
    const amountOk = !!payment && (!expected || Math.abs(Number(payment.amount || 0) - expected) <= 1);
    // A matching signature OR a captured status fetched directly from Razorpay.
    const verified = !!payment && amountOk &&
      (signatureOk || SUCCESS.has(String(payment.status || '').toLowerCase()));
    await applyProviderPayment(row, verified ? payment : { ...(payment || {}), status: 'failed' });

    res.type('html').send(page(verified));
  } catch {
    // Never render an error message that could contain gateway data.
    res.status(500).type('html').send(page(false));
  }
});

module.exports = router;
