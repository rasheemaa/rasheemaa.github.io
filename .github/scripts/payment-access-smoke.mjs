import { chromium } from 'playwright';

const BASE = 'https://thesheemaedit.com/what-do-i-say/';
const FAKE_SESSION = 'cs_live_fake123456789';

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
      const config = Array.from(document.scripts).some((script) => String(script.src || '').includes('/what-do-i-say/config.js?v=8'));
      const copy = document.body.innerText || '';
      return {
        csp,
        config,
        currentCopy: copy.includes('Founding Member access is verified securely.') && !copy.includes('verification is being reconnected')
      };
    });
    if (current.config && current.currentCopy && current.csp.includes('what-do-i-say-payments.rasheema-abdullah.workers.dev')) {
      console.log('PASS production payment assets match current launch revision');
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
    await page.goto(`${BASE}?checkout=cancelled`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !location.search.includes('checkout='), null, { timeout: 15_000 });
    const state = await page.evaluate(() => ({
      trial: document.querySelector('#trial-status')?.textContent || '',
      status: document.querySelector('[data-founder-status]')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1')
    }));
    assert(!/Founding Member/i.test(state.trial), 'cancelled checkout does not unlock Founding Member access');
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
      status: document.querySelector('[data-founder-status]')?.textContent || '',
      founder: localStorage.getItem('wdis_founder_session_v1')
    }));
    assert(!/Founding Member/i.test(state.trial), 'fake success URL does not unlock Founding Member access');
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
      status: document.querySelector('[data-founder-status]')?.textContent || ''
    }));
    assert(!/Founding Member/i.test(state.trial), 'fake browser storage does not create Founding Member status');
    assert(!/unlocked/i.test(state.status), 'fake browser storage does not show verified unlock');
    await context.close();
  }

  console.log('PAYMENT_ACCESS_SMOKE_PASS');
} finally {
  await browser.close();
}
