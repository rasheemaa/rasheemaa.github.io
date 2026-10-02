const ALLOWED_ORIGINS = new Set([
  'https://thesheemaedit.com',
  'https://www.thesheemaedit.com',
  'https://rasheemaa.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

const OFFER = 'founding_lifetime_v1';
const AMOUNT_CENTS = 1999;

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function validSessionId(value) {
  return /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(String(value || '').trim());
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) {
    console.error('Stripe verification unavailable: STRIPE_SECRET_KEY is missing');
    return res.status(503).json({ error: 'Payment verification is temporarily unavailable.' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (_) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  const sessionId = String(body.sessionId || '').trim();
  if (!validSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid checkout session.' });
  }

  try {
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store'
    });

    const session = await stripeResponse.json().catch(() => ({}));

    if (!stripeResponse.ok) {
      console.error('Stripe session lookup failed', {
        status: stripeResponse.status,
        type: session?.error?.type || null,
        code: session?.error?.code || null
      });
      return res.status(stripeResponse.status === 404 ? 404 : 502).json({
        error: stripeResponse.status === 404 ? 'Checkout session not found.' : 'Payment verification failed. Please try again.'
      });
    }

    const paid = session.payment_status === 'paid' &&
      session.status === 'complete' &&
      Number(session.amount_total) === AMOUNT_CENTS &&
      String(session.currency || '').toLowerCase() === 'usd' &&
      session?.metadata?.wdis_offer === OFFER;

    if (!paid) {
      return res.status(200).json({ paid: false, status: session.payment_status || session.status || 'unpaid' });
    }

    return res.status(200).json({
      paid: true,
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      offer: OFFER
    });
  } catch (error) {
    console.error('Stripe payment verification request failed', { name: error?.name || 'Error' });
    return res.status(502).json({ error: 'Payment verification failed. Please try again.' });
  }
}
