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
<style>html,body{background:transparent!important;margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{display:flex;flex-direction:column;justify-content:flex-end;min-height:100vh}
.sheet{background:#fff;border-radius:24px 24px 0 0;min-height:56vh;width:100%;display:flex;flex-direction:column;
align-items:center;justify-content:space-between;padding:48px 20px 28px;text-align:center}
.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ftr{display:flex;align-items:center;gap:5px;color:#64748B;font-size:13px;font-weight:500}
.ftr b{color:#0C2451;font-size:15px;font-weight:800;font-style:italic}
.btn{margin-top:16px;background:#0B120E;color:#fff;border:none;border-radius:12px;padding:13px 24px;font-weight:700;font-size:14px;cursor:pointer}
</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head><body>
<div id="loader" class="sheet">
  <div class="mid">
    <svg width="108" height="124" viewBox="0 0 120 138" fill="none">
      <defs><linearGradient id="sg" x1="20" y1="10" x2="100" y2="128" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#3B82F6"/><stop offset="55%" stop-color="#1D4ED8"/><stop offset="100%" stop-color="#0B33B2"/>
      </linearGradient></defs>
      <path d="M60 6L108 24V64C108 95 87 119 60 132C33 119 12 95 12 64V24L60 6Z" fill="url(#sg)"/>
      <path d="M60 12L102 28V64C102 91 83 113 60 125C37 113 18 91 18 64V28L60 12Z" fill="#0F3DC7" stroke="#60A5FA" stroke-opacity=".35" stroke-width="1.5"/>
    </svg>
    <button id="retry" class="btn" type="button" style="display:none">Retry Checkout</button>
  </div>
  <div class="ftr">Secured By <b>Razorpay</b></div>
</div>
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
    document.getElementById('loader').style.display = 'none';
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

    const amountText = Number(row.amount || 0).toFixed(2).replace(/\.00$/, '');
    const currencyText = String(row.currency || 'INR').replace(/[^A-Z]/g, '').slice(0, 8) || 'INR';
    const symbol = SYMBOLS[currencyText] || `${currencyText} `;
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
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:transparent!important;margin:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;
display:flex;flex-direction:column;justify-content:flex-end;min-height:100vh}
.tapout{flex:1}
.splash{background:#fff;border-radius:24px 24px 0 0;min-height:56vh;width:100%;max-width:480px;margin:0 auto;
display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:48px 20px 28px;
box-shadow:0 -10px 35px rgba(2,6,23,.18)}
.splash-mid{flex:1;display:flex;align-items:center;justify-content:center}
.secured{display:flex;align-items:center;gap:5px;color:#64748B;font-size:13px;font-weight:500}
.secured b{color:#0C2451;font-size:15px;font-weight:800;font-style:italic}
.sheet{display:none;background:#fff;border-radius:22px 22px 0 0;width:100%;max-width:480px;margin:0 auto;
overflow:hidden;box-shadow:0 -10px 35px rgba(2,6,23,.22);animation:up .22s ease-out}
@keyframes up{from{transform:translateY(28px);opacity:.6}to{transform:none;opacity:1}}
.shdr{background:#F3F4F6;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #E5E7EB}
.pamt{font-size:19px;font-weight:800;color:#0A0D0E;letter-spacing:-.2px}
.hacts{display:flex;align-items:center;gap:14px}
.dots{border:none;background:transparent;color:#6B7280;font-size:18px;letter-spacing:1px;padding:2px 4px;cursor:pointer}
.xbtn{color:#6B7280;font-size:21px;line-height:20px;text-decoration:none;font-weight:500;padding:2px 4px}
.minfo{display:none;padding:10px 18px;background:#F8FAFC;border-bottom:1px solid #E5E7EB;font-size:12px;color:#475569}
.minfo.on{display:flex;justify-content:space-between;align-items:center}
.sbody{padding:18px 18px 20px;background:#fff}
.qrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.qleft{display:flex;align-items:center;gap:10px}
.qbadge{width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;background:#5F259F}
.qname{font-size:16px;font-weight:600;color:#111827}
.morebtn{background:transparent;border:none;color:#10A37F;font-size:14px;font-weight:600;cursor:pointer;padding:6px 2px}
.drawer{display:none;margin-bottom:16px;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;background:#F9FAFB}
.drawer.on{display:block}
.dgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;background:#fff}
.ditem{border:1px solid #E5E7EB;border-radius:10px;padding:9px 6px;background:#fff;font-size:12px;font-weight:700;color:#111827;text-align:center;cursor:pointer}
.ditem.sel{border-color:#0A0D0E;background:#F3F4F6}
.dtabrow{display:flex;border-top:1px solid #E5E7EB;background:#F9FAFB}
.dtab{flex:1;padding:10px 6px;border:none;background:transparent;font-size:12px;font-weight:700;color:#4B5563;cursor:pointer;border-right:1px solid #E5E7EB}
.dtab:last-child{border-right:none}
.dtab.on{background:#fff;color:#0A0D0E}
.dpanel{display:none;padding:10px;background:#fff;border-top:1px solid #E5E7EB}
.dpanel.on{display:block}
.inp{width:100%;height:38px;border:1px solid #D1D5DB;border-radius:8px;padding:0 10px;font-size:13px;margin-bottom:8px;background:#fff}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.paybtn{width:100%;height:50px;border:none;border-radius:12px;background:#0A0D0E;color:#fff;font-size:16px;font-weight:700;cursor:pointer;
display:flex;align-items:center;justify-content:center;gap:8px}
.paybtn:disabled{opacity:.75}
.spin{width:18px;height:18px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:s .7s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.legal{margin-top:14px;text-align:center;font-size:12px;line-height:17px;color:#6B7280}
.legal b{color:#374151;font-weight:600}
</style></head>
<body>
<div class="tapout" onclick="window.location.href=CFG.cancelUrl"></div>
<div id="splash" class="splash">
  <div class="splash-mid">
    <svg width="110" height="126" viewBox="0 0 120 138" fill="none">
      <defs><linearGradient id="sg" x1="20" y1="10" x2="100" y2="128" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#3B82F6"/><stop offset="55%" stop-color="#1D4ED8"/><stop offset="100%" stop-color="#0B33B2"/>
      </linearGradient></defs>
      <path d="M60 6L108 24V64C108 95 87 119 60 132C33 119 12 95 12 64V24L60 6Z" fill="url(#sg)"/>
      <path d="M60 12L102 28V64C102 91 83 113 60 125C37 113 18 91 18 64V28L60 12Z" fill="#0F3DC7" stroke="#60A5FA" stroke-opacity=".35" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="secured">Secured By <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14.5 2L8 12.5H12.2L9.5 22L18 9.5H13.4L14.5 2Z" fill="#0C2451"/><path d="M18.2 5L14.8 10.6H17.5L15.6 17.5L21.5 8.5H18.3L18.2 5Z" fill="#3395FF"/></svg><b>Razorpay</b></div>
</div>

<div id="sheet" class="sheet">
  <div class="shdr">
    <div class="pamt">Pay ${symbol}${amountText}</div>
    <div class="hacts">
      <button type="button" class="dots" onclick="document.getElementById('minfo').classList.toggle('on')">&bull;&bull;&bull;</button>
      <a class="xbtn" href="${cancelUrl}">&times;</a>
    </div>
  </div>
  <div id="minfo" class="minfo"><span><b>V_build PRO</b> · Yearly Membership</span><span>Verified</span></div>
  <div class="sbody">
    <div class="qrow">
      <div class="qleft">
        <div id="qbadge" class="qbadge">&#x092A;&#x0947;</div>
        <div id="qname" class="qname">PhonePe</div>
      </div>
      <button type="button" class="morebtn" id="morebtn" onclick="toggleMore()">More Options</button>
    </div>

    <div id="drawer" class="drawer">
      <div class="dgrid">
        <button type="button" class="ditem sel" onclick="pick('upi','PhonePe','&#x092A;&#x0947;','#5F259F',this)">PhonePe</button>
        <button type="button" class="ditem" onclick="pick('upi','Google Pay','G','#1A73E8',this)">Google Pay</button>
        <button type="button" class="ditem" onclick="pick('upi','Paytm','P','#00BAF2',this)">Paytm</button>
      </div>
      <div class="dtabrow">
        <button type="button" class="dtab on" onclick="showTab('t-upi',this)">UPI ID</button>
        <button type="button" class="dtab" onclick="showTab('t-card',this)">Card</button>
        <button type="button" class="dtab" onclick="showTab('t-bank',this)">Netbanking</button>
      </div>
      <div id="t-upi" class="dpanel on">
        <input class="inp" id="vpa" placeholder="Enter UPI ID (e.g. name@okaxis)" value="athlete@okaxis" oninput="method='upi';setMethod('UPI · '+(this.value||'UPI ID'),'U','#1D4ED8')">
      </div>
      <div id="t-card" class="dpanel">
        <input class="inp" placeholder="Card Number" value="4111 •••• •••• 1111" inputmode="numeric" onfocus="method='card';setMethod('Card · •••• 1111','C','#0F172A')">
        <div class="row2"><input class="inp" placeholder="MM / YY" value="12/28"><input class="inp" placeholder="CVV" value="123" type="password"></div>
      </div>
      <div id="t-bank" class="dpanel">
        <div class="bgrid">
          <button type="button" class="ditem" onclick="pick('netbanking','HDFC Bank','H','#004C8F',this)">HDFC Bank</button>
          <button type="button" class="ditem" onclick="pick('netbanking','ICICI Bank','I','#B02A30',this)">ICICI Bank</button>
          <button type="button" class="ditem" onclick="pick('netbanking','SBI Bank','S','#280071',this)">SBI</button>
          <button type="button" class="ditem" onclick="pick('netbanking','Axis Bank','A','#97144D',this)">Axis Bank</button>
        </div>
      </div>
    </div>

    <button type="button" class="paybtn" id="paybtn" onclick="submitPay()">Pay</button>
    <div class="legal">By proceeding, I agree to Razorpay&rsquo;s<br><b>Privacy Notice &bull; Edit Preferences</b></div>
  </div>
</div>

<script id="demo-cfg" type="application/json">${safeJsonScript(cfg)}</script>
<script>
var CFG = JSON.parse(document.getElementById('demo-cfg').textContent);
var method = 'upi';
setTimeout(function(){
  document.getElementById('splash').style.display = 'none';
  document.getElementById('sheet').style.display = 'block';
}, 520);
function setMethod(label, badge, bg){
  document.getElementById('qname').textContent = label;
  var b = document.getElementById('qbadge');
  b.innerHTML = badge;
  b.style.background = bg;
}
function pick(m, label, badge, bg, el){
  method = m;
  setMethod(label, badge, bg);
  document.querySelectorAll('.ditem').forEach(function(n){ n.classList.remove('sel'); });
  if (el) el.classList.add('sel');
}
function toggleMore(){
  var d = document.getElementById('drawer');
  var on = d.classList.toggle('on');
  document.getElementById('morebtn').textContent = on ? 'Hide Options' : 'More Options';
}
function showTab(id, el){
  document.querySelectorAll('.dpanel').forEach(function(p){ p.classList.remove('on'); });
  document.querySelectorAll('.dtab').forEach(function(t){ t.classList.remove('on'); });
  document.getElementById(id).classList.add('on');
  el.classList.add('on');
  if (id === 't-card') { method = 'card'; setMethod('Card · •••• 1111', 'C', '#0F172A'); }
  else if (id === 't-bank') { method = 'netbanking'; }
  else { method = 'upi'; }
}
function submitPay(){
  var btn = document.getElementById('paybtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Processing...';
  setTimeout(function(){ window.location.href = CFG.baseCallback + '&method=' + encodeURIComponent(method); }, 450);
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
