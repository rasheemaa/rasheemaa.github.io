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
    console.error('Stripe checkout unavailable: STRIPE_SECRET_KEY is missing');
    return res.status(503).json({ error: 'Secure checkout is temporarily unavailable.' });
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', 'https://thesheemaedit.com/what-do-i-say/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', 'https://thesheemaedit.com/what-do-i-say/?checkout=cancelled');
  params.set('customer_creation', 'always');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(AMOUNT_CENTS));
  params.set('line_items[0][price_data][product_data][name]', 'What Do I Say? Founding Member');
  params.set('line_items[0][price_data][product_data][description]', 'Core access for life during the founding launch.');
  params.set('metadata[wdis_offer]', OFFER);
  params.set('metadata[wdis_amount_cents]', String(AMOUNT_CENTS));
  params.set('payment_intent_data[metadata][wdis_offer]', OFFER);

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString(),
      cache: 'no-store'
    });

    const data = await stripeResponse.json().catch(() => ({}));

    if (!stripeResponse.ok || !data?.url || !data?.id) {
      console.error('Stripe checkout session creation failed', {
        status: stripeResponse.status,
        type: data?.error?.type || null,
        code: data?.error?.code || null
      });
      return res.status(502).json({ error: 'Secure checkout could not start. Please try again.' });
    }

    return res.status(200).json({ url: data.url, sessionId: data.id });
  } catch (error) {
    console.error('Stripe checkout session request failed', { name: error?.name || 'Error' });
    return res.status(502).json({ error: 'Secure checkout could not start. Please try again.' });
  }
}
