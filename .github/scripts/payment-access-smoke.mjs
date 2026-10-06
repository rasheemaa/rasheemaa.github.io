import { chromium } from 'playwright';

const BASE = 'https://thesheemaedit.com/what-do-i-say/';
const WORKER_CHECKOUT = 'https://what-do-i-say-payments.rasheema-abdullah.workers.dev/api/checkout';
const FAKE_SESSION = 'cs_live_fake123456789';
const CONTROLLED_PAID_SESSION = 'cs_live_controlledpaid123456789';
const CONTROLLED_CHECKOUT_SESSION = 'cs_live_controlledcheckout123456789';

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function waitForCurrentProduction(page) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await page.goto(`${BASE}?payment_smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const current = await page.evaluate(() => {
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
      const config = Array.from(document.scripts).some((script) => String(script.src || '').includes('/what-do-i-say/config.js?v=9'));
      const payment = Array.from(document.scripts).some((script) => String(script.src || '').includes('/what-do-i-say/payment-v3.js?v=2'));
      const copy = document.body.innerText || '';
      const legacyPaymentLinks = Array.from(document.querySelectorAll('a[href]')).filter((link) => String(link.href || '').includes('buy.stripe.com')).length;
      const checkoutButtons = document.querySelectorAll('[data-founder-checkout]').length;
      return {
        csp,
        config,
        payment,
        legacyPaymentLinks,
        checkoutButtons,
        currentCopy: copy.includes('Lifetime Access') && copy.includes('3 days for $1') && !copy.includes('Founding Member')
      };
    });
    if (
      current.config &&
      current.payment &&
      current.currentCopy &&
      current.legacyPaymentLinks === 0 &&
      current.checkoutButtons >= 1 &&
      current.csp.includes('what-do-i-say-payments.rasheema-abdullah.workers.dev')
    ) {
      console.log('PASS production payment assets match current launch revision');
      console.log('PASS production contains no direct Stripe Payment Link checkout');
      console.log('PASS production exposes Cloudflare checkout buttons');
      return;
    }
    await page.waitForTimeout(3000);
  }
  throw new Error('Production did not serve the current payment wiring before timeout.');
}

const browser = await chromium.launch({ headless: true });
try {
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await waitForCurrentProduction(page);
    await context.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    let checkoutRequest = null;

    await page.route('**/api/checkout', async (route) => {
      const request = route.request();
      checkoutRequest = {
        url: request.url(),
        method: request.method(),
        body: JSON.parse(request.postData() || '{}')
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: CONTROLLED_CHECKOUT_SESSION,
          url: `https://checkout.stripe.com/c/pay/${CONTROLLED_CHECKOUT_SESSION}`,
          offer: 'founder'
        })
      });
    });

    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Controlled Stripe checkout</title>' });
    });

    await page.goto(`${BASE}?checkout_wiring=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { document.querySelector('#paywall').hidden = false; });
    await page.locator('[data-founder-checkout]').first().click();
    await page.waitForURL('https://checkout.stripe.com/**', { timeout: 15_000 });

    assert(checkoutRequest?.url === WORKER_CHECKOUT, 'live Lifetime Access button calls only the Cloudflare checkout Worker');
    assert(checkoutRequest?.method === 'POST', 'live Lifetime Access checkout uses POST');
    assert(/^[a-f0-9]{64}$/.test(String(checkoutRequest?.body?.claimToken || '')), 'live checkout sends a browser-bound purchase claim');
    assert(page.url().startsWith('https://checkout.stripe.com/'), 'validated Cloudflare checkout response redirects only to Stripe Checkout');
    await context.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}?checkout=cancelled`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !location.search.includes('checkout='), null, { timeout: 15_000 });
    const state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      status: document.querySelector('[data-payment-status]')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1')
    }));
    assert(!/Founding Member/i.test(state.trial), 'cancelled checkout does not unlock Lifetime Access');
    assert(/canceled|cancelled/i.test(state.status), 'cancelled checkout is reported as cancelled');
    assert(state.founder === null, 'cancelled checkout stores no founder session');
    await context.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/verify-payment'),
      { timeout: 20_000 }
    );
    await page.goto(`${BASE}?checkout=success&session_id=${FAKE_SESSION}`, { waitUntil: 'domcontentloaded' });
    const response = await responsePromise;
    assert(response.status() !== 200 || !(await response.json().catch(() => ({}))).paid, 'fake success session is not accepted by Cloudflare');
    await page.waitForFunction(() => !location.search.includes('checkout='), null, { timeout: 15_000 });
    const state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      status: document.querySelector('[data-payment-status]')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1')
    }));
    assert(!/Founding Member/i.test(state.trial), 'fake success URL does not unlock Lifetime Access');
    assert(!/unlocked/i.test(state.status), 'fake success URL never shows verified unlock');
    assert(state.founder === null, 'fake success URL stores no verified founder session');
    await context.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((fake) => {
      localStorage.setItem('wdis_founder_session_v1', fake);
      localStorage.setItem('founderVerified', 'true');
      localStorage.setItem('paid', 'true');
    }, FAKE_SESSION);
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/verify-payment'),
      { timeout: 20_000 }
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await responsePromise;
    await page.waitForTimeout(750);
    const state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      status: document.querySelector('[data-payment-status]')?.textContent || ''
    }));
    assert(!/Founding Member/i.test(state.trial), 'fake browser storage does not create Lifetime Access status');
    assert(!/unlocked/i.test(state.status), 'fake browser storage does not show verified unlock');
    await context.close();
  }

  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/verify-payment', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');
      if (body.sessionId !== CONTROLLED_PAID_SESSION) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ paid: false }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ paid: true, accessType: 'founder' })
      });
    });

    await page.goto(`${BASE}?checkout=success&session_id=${CONTROLLED_PAID_SESSION}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Lifetime Access/i.test(document.querySelector('#trial-status')?.textContent || ''), null, { timeout: 15_000 });
    let state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1'),
      pending: localStorage.getItem('wdis_pending_founder_session_v1')
    }));
    assert(/Lifetime Access/i.test(state.trial), 'server-confirmed paid response unlocks Lifetime Access status');
    assert(state.founder === CONTROLLED_PAID_SESSION, 'verified session reference is persisted after server confirmation');
    assert(state.pending === null, 'pending purchase reference is cleared after verification');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Lifetime Access/i.test(document.querySelector('#trial-status')?.textContent || ''), null, { timeout: 15_000 });
    state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1')
    }));
    assert(/Lifetime Access/i.test(state.trial), 'verified Lifetime Access survives a return visit after server re-verification');
    assert(state.founder === CONTROLLED_PAID_SESSION, 'verified session reference remains available for return-visit re-verification');
    await context.close();
  }

  console.log('PAYMENT_ACCESS_SMOKE_PASS');
} finally {
  await browser.close();
}
