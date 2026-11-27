const express = require('express');
const db = require('../db');
const { isDemo, gatewayInfo, fetchPayment, signSignature, isValidSignature } = require('../gateway');
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
<a href="${scheme}">Return to app</a></div>
<script>try{if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'payment_result',ok:${ok ? 'true' : 'false'}}));}}catch(e){}</script></body></html>`;
}

/**
 * Built-in Razorpay demo checkout page — active ONLY while the replaceable demo
 * key is in use. Disabled (404) as soon as live Razorpay keys are configured.
 */
router.get('/demo-checkout', async (req, res) => {
  try {
    if (!isDemo()) return res.status(404).type('html').send(page(false));
    const token = String(req.query.token || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 80);
    const row = token ? await db.one('SELECT * FROM payments WHERE callback_token = ?', [token]) : null;
    if (!row) return res.status(400).type('html').send(page(false));

    const amountText = Number(row.amount || 0).toFixed(2);
    const currencyText = String(row.currency || 'INR').replace(/[^A-Z]/g, '').slice(0, 8) || 'INR';
    const keyPreview = gatewayInfo().keyIdPreview || 'rzp_test_demo';
    const paymentId = `pay_demo_${row.id}_${token.slice(0, 8)}`;
    const linkId = String(row.payment_link_id || `plink_demo_${row.id}`);
    const sig = signSignature(`${linkId}|${paymentId}`);
    const baseCallback = `/api/payments/callback?token=${encodeURIComponent(token)}&razorpay_payment_id=${encodeURIComponent(paymentId)}&razorpay_payment_link_id=${encodeURIComponent(linkId)}&razorpay_payment_link_status=paid&razorpay_signature=${encodeURIComponent(sig)}`;
    const cancelUrl = `/api/payments/callback?token=${encodeURIComponent(token)}`;

    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Razorpay Checkout (Demo Key)</title>
<style>body{font-family:system-ui,sans-serif;background:#0F172A;color:#111827;margin:0;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:20px;overflow:hidden;max-width:400px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.top{background:linear-gradient(135deg,#072654,#004AFF);color:#fff;padding:22px 24px}
.badge{display:inline-block;background:rgba(255,255,255,.18);color:#FDE68A;font-size:10px;font-weight:800;letter-spacing:.8px;
padding:4px 9px;border-radius:999px;margin-bottom:10px}
.top h1{font-size:19px;margin:0}
.amt{font-size:30px;font-weight:900;margin:8px 0 2px}
.body{padding:22px 24px}
.sub{font-size:12px;color:#6B7280;line-height:18px;margin:0 0 14px}
.key{font-family:ui-monospace,monospace;font-size:11px;background:#F3F4F6;padding:8px 10px;border-radius:8px;margin-bottom:16px;color:#374151}
.label{font-size:11px;font-weight:800;color:#4B5563;letter-spacing:.6px;margin-bottom:8px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;border-radius:12px;
padding:13px 16px;font-weight:800;font-size:14px;margin-bottom:10px}
.pay{background:#004AFF;color:#fff}
.upi{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0}
.cardbtn{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE}
.cancel{background:#FEE2E2;color:#B91C1C;margin-top:4px;margin-bottom:0}</style></head>
<body><div class="card">
<div class="top">
<div class="badge">RAZORPAY TEST GATEWAY · DEMO KEY</div>
<h1>V_build PRO Yearly</h1>
<div class="amt">${currencyText} ${amountText}</div>
</div>
<div class="body">
<p class="sub">Complete test payment to unlock PRO on this account and record the transaction in Admin &gt; Payments.</p>
<div class="key">Key ID: ${keyPreview}</div>
<div class="label">CHOOSE TEST PAYMENT METHOD</div>
<a class="btn upi" href="${baseCallback}&method=upi">Pay via UPI (Demo Instant)</a>
<a class="btn cardbtn" href="${baseCallback}&method=card">Pay via Card (Demo Instant)</a>
<a class="btn pay" href="${baseCallback}&method=netbanking">Pay via Netbanking (Demo Instant)</a>
<a class="btn cancel" href="${cancelUrl}">Cancel Payment</a>
</div></div></body></html>`);
  } catch {
    res.status(500).type('html').send(page(false));
  }
});

/** Razorpay redirects the device browser here after checkout. No Bearer token
 * is present, so this route identifies the attempt by an unguessable token. */
router.get('/callback', async (req, res) => {
  try {
    const token = String(req.query.token || '').slice(0, 80);
    const providerPaymentId = String(
      req.query.razorpay_payment_id || req.query.payment_id || req.query.paymentId || ''
    ).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    const signature = String(req.query.razorpay_signature || req.query.signature || '');
    const row = token ? await db.one('SELECT * FROM payments WHERE callback_token = ?', [token]) : null;
    if (!row) return res.status(400).type('html').send(page(false));

    if (!providerPaymentId) {
      await db.query("UPDATE payments SET status = 'abandoned' WHERE id = ?", [row.id]);
      return res.type('html').send(page(false));
    }

    const linkId = String(
      req.query.razorpay_payment_link_id || req.query.payment_link_id || row.payment_link_id || ''
    );
    const refId = String(req.query.razorpay_payment_link_reference_id || '');
    const linkStatus = String(req.query.razorpay_payment_link_status || '');
    const demoMethod = String(req.query.method || 'demo_razorpay').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'demo_razorpay';
    const signatureOk = signature
      ? (isValidSignature(`${linkId}|${refId}|${linkStatus}|${providerPaymentId}`, signature)
        || isValidSignature(`${linkId}|${providerPaymentId}`, signature))
      : false;
    const expected = Math.round(Number(row.amount || 0) * 100);
    const payment = isDemo() && signatureOk
      ? { id: providerPaymentId, amount: expected, currency: row.currency, status: 'captured', method: demoMethod }
      : await fetchPayment(providerPaymentId).catch(() => null);
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
