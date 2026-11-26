const https = require('https');
const crypto = require('crypto');

/**
 * Razorpay calls happen only on the server. Keys are read from process.env at
 * call time (the admin can update them without a restart) and are never put in
 * a response, a log line, or an error message.
 */
function credentials() {
  return {
    keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
    secret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
  };
}

function configured() {
  const { keyId, secret } = credentials();
  return !!(keyId && secret);
}

function request(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const { keyId, secret } = credentials();
    if (!keyId || !secret) return reject(new Error('payment_gateway_not_configured'));
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.razorpay.com',
      path: endpoint,
      method,
      timeout: 15000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        // Do not forward the provider body: it may echo request/account data.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`payment_gateway_http_${res.statusCode}`));
        }
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error('payment_gateway_bad_response'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('payment_gateway_timeout')));
    req.on('error', () => reject(new Error('payment_gateway_unavailable')));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Create a hosted Razorpay payment link that opens in the device browser. */
async function createPaymentLink({ amount, currency, description, callbackUrl, notes }) {
  const data = await request('POST', '/v1/payment_links', {
    amount: Math.max(1, Math.round(Number(amount) * 100)), // Razorpay uses paise/cents
    currency: currency || 'USD',
    description: String(description || 'PRO membership').slice(0, 120),
    callback_url: callbackUrl,
    callback_method: 'get',
    notes: notes || {},
  });
  return { id: data.id || null, shortUrl: data.short_url || data.url || null };
}

/** Fetch the authoritative status of a payment straight from Razorpay. */
function fetchPayment(paymentId) {
  const id = String(paymentId || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
  if (!id) return Promise.reject(new Error('invalid_payment_id'));
  return request('GET', `/v1/payments/${id}`);
}

/** Constant-time HMAC verification for Razorpay webhook/checkout signatures. */
function isValidSignature(data, signature) {
  const { secret } = credentials();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(String(data)).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { configured, createPaymentLink, fetchPayment, isValidSignature };
