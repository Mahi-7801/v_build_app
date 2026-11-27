const express = require('express');
const db = require('../db');
const { isDemo, keyIdForCheckout, gatewayInfo, fetchPayment, signSignature, isValidSignature } = require('../gateway');
const { SUCCESS, applyProviderPayment } = require('../paymentService');

const router = express.Router();

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const safeJsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

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
 * Official Razorpay Standard Checkout page — used whenever real Razorpay keys
 * (rzp_test_... or rzp_live_...) are configured. Opens the real Razorpay
 * bottom-sheet gateway right inside the app WebView.
 */
router.get('/checkout', async (req, res) => {
  try {
    if (isDemo()) return res.status(404).type('html').send(page(false));
    const token = String(req.query.token || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 80);
    const row = token
      ? await db.one(
        `SELECT p.*, u.display_name, u.email, u.phone
         FROM payments p
         JOIN users u ON u.id = p.user_id
         WHERE p.callback_token = ?`,
        [token]
      )
      : null;
    if (!row || !row.order_id) return res.status(400).type('html').send(page(false));

    const keyId = keyIdForCheckout();
    if (!keyId) return res.status(503).type('html').send(page(false));

    const cfg = {
      key: keyId,
      amount: Math.max(100, Math.round(Number(row.amount || 0) * 100)),
      currency: String(row.currency || 'INR').toUpperCase(),
      name: 'V_build PRO',
      description: 'Yearly PRO Membership',
      order_id: String(row.order_id),
      token,
      prefill: {
        name: String(row.display_name || '').slice(0, 80),
        email: String(row.email || '').slice(0, 120),
        contact: String(row.phone || '').slice(0, 20),
      },
    };

    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Razorpay Checkout</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#F3F6FB;color:#0F172A;margin:0;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center}
.box{background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 8px 24px rgba(15,23,42,.08)}
.spin{width:32px;height:32px;border:3px solid #E2E8F0;border-top-color:#004AFF;border-radius:50%;margin:0 auto 14px;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
h2{font-size:16px;margin:0 0 6px}p{font-size:13px;color:#64748B;margin:0 0 16px}
.btn{display:inline-block;background:#004AFF;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-weight:700;font-size:13px;cursor:pointer}
</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head><body>
<div class="box"><div class="spin"></div><h2>Opening Razorpay</h2><p>Loading secure checkout for V_build PRO...</p>
<button id="retry" class="btn" type="button" style="display:none">Open Razorpay</button></div>
<form id="vf" method="POST" action="/api/payments/checkout-verify" style="display:none">
<input name="token" value=""><input name="razorpay_payment_id" value=""><input name="razorpay_order_id" value=""><input name="razorpay_signature" value="">
</form>
<script id="rzp-cfg" type="application/json">${safeJsonScript(cfg)}</script>
<script>
(function(){
  var cfg = JSON.parse(document.getElementById('rzp-cfg').textContent);
  var submitted = false;
  function launch(){
    if (typeof Razorpay === 'undefined') { document.getElementById('retry').style.display='inline-block'; return; }
    var rzp = new Razorpay({
      key: cfg.key,
      amount: cfg.amount,
      currency: cfg.currency,
      name: cfg.name,
      description: cfg.description,
      order_id: cfg.order_id,
      prefill: cfg.prefill,
      theme: { color: '#004AFF' },
      modal: {
        backdropclose: false,
        ondismiss: function(){
          if (!submitted) window.location.replace('/api/payments/callback?token=' + encodeURIComponent(cfg.token));
        }
      },
      handler: function(resp){
        submitted = true;
        var f = document.getElementById('vf');
        f.token.value = cfg.token;
        f.razorpay_payment_id.value = resp.razorpay_payment_id || '';
        f.razorpay_order_id.value = resp.razorpay_order_id || '';
        f.razorpay_signature.value = resp.razorpay_signature || '';
        f.submit();
      }
    });
    rzp.on('payment.failed', function(){
      document.getElementById('retry').style.display='inline-block';
    });
    rzp.open();
  }
  document.getElementById('retry').onclick = launch;
  window.onload = launch;
})();
</script></body></html>`);
  } catch {
    res.status(500).type('html').send(page(false));
  }
});

/** Standard Checkout form callback verifying HMAC-SHA256(order_id|payment_id). */
router.post('/checkout-verify', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const b = req.body || {};
    const token = String(b.token || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 80);
    const providerPaymentId = String(b.razorpay_payment_id || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    const orderId = String(b.razorpay_order_id || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    const signature = String(b.razorpay_signature || '');
    const row = token ? await db.one('SELECT * FROM payments WHERE callback_token = ?', [token]) : null;
    if (!row || !providerPaymentId) return res.status(400).type('html').send(page(false));

    const expectedOrder = String(row.order_id || orderId);
    const signatureOk = !!signature && !!expectedOrder
      && isValidSignature(`${expectedOrder}|${providerPaymentId}`, signature);
    const expected = Math.round(Number(row.amount || 0) * 100);
    const payment = await fetchPayment(providerPaymentId).catch(() => null);
    const amountOk = !!payment && (!expected || Math.abs(Number(payment.amount || 0) - expected) <= 1);
    const verified = !!payment && amountOk && (signatureOk || SUCCESS.has(String(payment.status || '').toLowerCase()));
    await applyProviderPayment(row, verified ? { ...payment, order_id: expectedOrder } : { ...(payment || {}), status: 'failed' });
    res.type('html').send(page(verified));
  } catch {
    res.status(500).type('html').send(page(false));
  }
});

/**
 * Built-in Razorpay demo checkout bottom-sheet — active ONLY while the replaceable demo
 * key is in use. Disabled (404) as soon as live Razorpay keys (rzp_test_... / rzp_live_...) are configured.
 */
router.get('/demo-checkout', async (req, res) => {
  try {
    if (!isDemo()) return res.status(404).type('html').send(page(false));
    const token = String(req.query.token || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 80);
    const row = token ? await db.one('SELECT * FROM payments WHERE callback_token = ?', [token]) : null;
    if (!row) return res.status(400).type('html').send(page(false));

    const amountText = Number(row.amount || 0).toFixed(2);
    const currencyText = String(row.currency || 'INR').replace(/[^A-Z]/g, '').slice(0, 8) || 'INR';
    const symbol = SYMBOLS[currencyText] || `${currencyText} `;
    const keyPreview = gatewayInfo().keyIdPreview || 'rzp_test_demo';
    const paymentId = `pay_demo_${row.id}_${token.slice(0, 8)}`;
    const linkId = String(row.payment_link_id || `plink_demo_${row.id}`);
    const sig = signSignature(`${linkId}|${paymentId}`);
    const baseCallback = `/api/payments/callback?token=${encodeURIComponent(token)}&razorpay_payment_id=${encodeURIComponent(paymentId)}&razorpay_payment_link_id=${encodeURIComponent(linkId)}&razorpay_payment_link_status=paid&razorpay_signature=${encodeURIComponent(sig)}`;
    const cancelUrl = `/api/payments/callback?token=${encodeURIComponent(token)}`;
    const cfg = { baseCallback, cancelUrl, amountLabel: `${symbol}${amountText}` };

    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Razorpay Checkout</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:rgba(15,23,42,.52);color:#1E293B;margin:0;
display:flex;flex-direction:column;justify-content:flex-end;min-height:100vh}
.sheet{background:#F8FAFC;border-radius:18px 18px 0 0;width:100%;max-width:460px;margin:0 auto;overflow:hidden;
box-shadow:0 -12px 40px rgba(2,6,23,.28);display:flex;flex-direction:column;max-height:92vh}
.hdr{background:linear-gradient(135deg,#072654 0%,#1547A8 100%);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px}
.logo{width:40px;height:40px;border-radius:10px;background:#fff;color:#004AFF;font-weight:900;font-size:19px;
display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hinfo{flex:1;min-width:0}
.hname{font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px}
.trust{font-size:10px;background:rgba(16,185,129,.22);color:#A7F3D0;border:1px solid rgba(167,243,208,.35);
padding:2px 6px;border-radius:999px;font-weight:700}
.hsub{font-size:12px;color:rgba(255,255,255,.78);margin-top:2px}
.hright{text-align:right;display:flex;align-items:center;gap:10px}
.hamt{font-size:17px;font-weight:900}
.close{width:28px;height:28px;border-radius:14px;background:rgba(255,255,255,.15);color:#fff;border:none;
font-size:18px;line-height:28px;text-align:center;cursor:pointer;text-decoration:none}
.scroll{padding:14px 16px;overflow-y:auto}
.sec{font-size:11px;font-weight:800;color:#64748B;letter-spacing:.7px;margin:6px 0 8px;text-transform:uppercase}
.card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin-bottom:12px}
.opt{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid #F1F5F9;cursor:pointer;text-decoration:none;color:inherit}
.opt:last-child{border-bottom:none}
.ico{width:34px;height:34px;border-radius:8px;background:#EFF6FF;color:#1D4ED8;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;flex-shrink:0}
.otitle{font-size:14px;font-weight:700;color:#0F172A}
.osub{font-size:11px;color:#64748B;margin-top:2px}
.chev{margin-left:auto;color:#94A3B8;font-weight:700}
.upi-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 14px;background:#F8FAFC;border-bottom:1px solid #E2E8F0}
.appbtn{background:#fff;border:1px solid #CBD5E1;border-radius:10px;padding:9px 6px;text-align:center;font-size:12px;font-weight:800;color:#0F172A;cursor:pointer}
.appbtn span{display:block;font-size:10px;font-weight:600;color:#64748B;margin-top:2px}
.panel{display:none;padding:14px;background:#F8FAFC;border-top:1px solid #E2E8F0}
.panel.open{display:block}
.inp{width:100%;height:42px;border:1px solid #CBD5E1;border-radius:9px;padding:0 12px;font-size:14px;margin-bottom:9px;background:#fff}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.paybtn{width:100%;height:44px;border:none;border-radius:10px;background:#072654;color:#fff;font-size:14px;font-weight:800;cursor:pointer}
.banks{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.bank{background:#fff;border:1px solid #CBD5E1;border-radius:9px;padding:10px;font-size:12px;font-weight:700;color:#1E293B;text-align:left;cursor:pointer}
.ftr{background:#fff;border-top:1px solid #E2E8F0;padding:10px 16px;text-align:center;font-size:11px;color:#64748B}
.ftr b{color:#072654}
.overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);align-items:center;justify-content:center;z-index:20}
.overlay.on{display:flex}
.pbox{background:#fff;border-radius:14px;padding:22px 26px;text-align:center;max-width:280px;width:85%}
.spin{width:30px;height:30px;border:3px solid #E2E8F0;border-top-color:#072654;border-radius:50%;margin:0 auto 12px;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style></head>
<body>
<div class="sheet">
  <div class="hdr">
    <div class="logo">V</div>
    <div class="hinfo">
      <div class="hname">V_build PRO <span class="trust">Trusted</span></div>
      <div class="hsub">Yearly Membership</div>
    </div>
    <div class="hright">
      <div class="hamt">${symbol}${amountText}</div>
      <a class="close" href="${cancelUrl}">&times;</a>
    </div>
  </div>
  <div class="scroll">
    <div class="sec">Pay using UPI</div>
    <div class="card">
      <div class="upi-apps">
        <button type="button" class="appbtn" onclick="go('upi')">GPay<span>UPI Instant</span></button>
        <button type="button" class="appbtn" onclick="go('upi')">PhonePe<span>UPI Instant</span></button>
        <button type="button" class="appbtn" onclick="go('upi')">Paytm<span>UPI Instant</span></button>
      </div>
      <div class="opt" onclick="toggle('p-upi')">
        <div class="ico">UPI</div>
        <div><div class="otitle">UPI ID / Mobile Number</div><div class="osub">Pay with any UPI ID (GPay, PhonePe, BHIM)</div></div>
        <div class="chev">&rsaquo;</div>
      </div>
      <div id="p-upi" class="panel">
        <input class="inp" id="upi-id" placeholder="yourname@okaxis" value="athlete@okaxis">
        <button type="button" class="paybtn" onclick="go('upi')">Verify &amp; Pay ${symbol}${amountText}</button>
      </div>
    </div>
    <div class="sec">Cards, Netbanking &amp; More</div>
    <div class="card">
      <div class="opt" onclick="toggle('p-card')">
        <div class="ico">CARD</div>
        <div><div class="otitle">Card</div><div class="osub">Visa, Mastercard, RuPay &amp; Maestro</div></div>
        <div class="chev">&rsaquo;</div>
      </div>
      <div id="p-card" class="panel">
        <input class="inp" placeholder="Card Number" value="4111 •••• •••• 1111" inputmode="numeric">
        <div class="row2"><input class="inp" placeholder="MM / YY" value="12/28"><input class="inp" placeholder="CVV" value="123" type="password"></div>
        <button type="button" class="paybtn" onclick="go('card')">Pay ${symbol}${amountText}</button>
      </div>
      <div class="opt" onclick="toggle('p-nb')">
        <div class="ico">BANK</div>
        <div><div class="otitle">Netbanking</div><div class="osub">All Indian banks supported</div></div>
        <div class="chev">&rsaquo;</div>
      </div>
      <div id="p-nb" class="panel">
        <div class="banks">
          <button type="button" class="bank" onclick="go('netbanking')">HDFC Bank</button>
          <button type="button" class="bank" onclick="go('netbanking')">ICICI Bank</button>
          <button type="button" class="bank" onclick="go('netbanking')">State Bank of India</button>
          <button type="button" class="bank" onclick="go('netbanking')">Axis Bank</button>
        </div>
      </div>
      <div class="opt" onclick="go('wallet')">
        <div class="ico">WLT</div>
        <div><div class="otitle">Wallet</div><div class="osub">PhonePe, Amazon Pay, Mobikwik &amp; more</div></div>
        <div class="chev">&rsaquo;</div>
      </div>
    </div>
  </div>
  <div class="ftr">Secured by <b>Razorpay</b> · Demo key (${keyPreview}) — enter real keys in Admin &gt; Settings for live charges</div>
</div>
<div id="ov" class="overlay"><div class="pbox"><div class="spin"></div><div style="font-weight:800;font-size:15px">Verifying payment...</div><div style="font-size:12px;color:#64748B;margin-top:4px">Confirming with Razorpay</div></div></div>
<script id="demo-cfg" type="application/json">${safeJsonScript(cfg)}</script>
<script>
var CFG = JSON.parse(document.getElementById('demo-cfg').textContent);
function toggle(id){
  var el = document.getElementById(id);
  var open = el.classList.contains('open');
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('open'); });
  if (!open) el.classList.add('open');
}
function go(method){
  document.getElementById('ov').classList.add('on');
  setTimeout(function(){ window.location.href = CFG.baseCallback + '&method=' + encodeURIComponent(method); }, 550);
}
</script></body></html>`);
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
