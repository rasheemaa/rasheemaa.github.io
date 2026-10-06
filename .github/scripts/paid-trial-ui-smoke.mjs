import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const SITE = 'https://thesheemaedit.com/what-do-i-say/';
const API = 'https://what-do-i-say-payments.rasheema-abdullah.workers.dev';

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function fetchLiveText(path) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://thesheemaedit.com/${path}${separator}lifetime_copy_verify=${Date.now()}`, { cache: 'no-store' });
  assert(response.ok, `live ${path} is reachable`);
  return response.text();
}

async function waitForProductionAssets() {
  // Jekyll removes front matter from index.html during the Pages build, so the
  // rendered HTML is verified behaviorally below instead of byte-for-byte.
  const paths = [
    'what-do-i-say/payment-v3.js',
    'what-do-i-say/paid-trial-access.js',
    'what-do-i-say/chat-app.js',
    'what-do-i-say/service-worker.js'
  ];
  const expected = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const matches = await Promise.all(paths.map(async (path, index) => {
      try {
        const response = await fetch(`https://thesheemaedit.com/${path}?paid_trial_verify=${Date.now()}`, { cache: 'no-store' });
        return response.ok && (await response.text()).trim() === expected[index].trim();
      } catch (_) {
        return false;
      }
    }));
    if (matches.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Production did not deploy the paid trial assets under test');
}

await waitForProductionAssets();

async function waitForCurrentAppShell() {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    try {
      const response = await fetch(`${SITE}?app_shell_verify=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const html = await response.text();
        if (html.includes('/what-do-i-say/chat-app.js?v=26')) return;
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Production app shell did not deploy chat-app.js?v=26 before verification');
}

await waitForCurrentAppShell();

async function waitForShopOffer() {
  let last = '';
  for (let attempt = 0; attempt < 36; attempt += 1) {
    try {
      const response = await fetch(`https://thesheemaedit.com/shop/?paid_trial_shop_verify=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        last = await response.text();
        if (
          last.includes('3 days · $1') &&
          last.includes('no automatic renewal') &&
          last.includes('Lifetime Access $19.99 once') &&
          !last.includes('3 days free') &&
          !last.includes('No card required') &&
          !last.includes('Founding Members')
        ) return;
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Production shop page did not deploy the paid trial offer under test');
}

await waitForShopOffer();

const [homepage, shopPage, mainScript, launchPopup, refunds, terms, rootServiceWorker, paidTrialAccess, scopedServiceWorker] = await Promise.all([
  fetchLiveText(''),
  fetchLiveText('shop/'),
  fetchLiveText('assets/js/main.js?v=2'),
  fetchLiveText('assets/js/wdis-launch-popup.js?v=2'),
  fetchLiveText('what-do-i-say/refunds/'),
  fetchLiveText('what-do-i-say/terms/'),
  fetchLiveText('service-worker.js'),
  fetchLiveText('what-do-i-say/paid-trial-access.js?v=1'),
  fetchLiveText('what-do-i-say/service-worker.js')
]);
assert(homepage.includes('/assets/js/main.js?v=2'), 'homepage loads the cache-busted main script');
assert(shopPage.includes('3 days · $1'), 'shop card shows the $1 three-day trial');
assert(shopPage.includes('no automatic renewal'), 'shop card states no automatic renewal');
assert(shopPage.includes('Lifetime Access $19.99 once'), 'shop card shows Lifetime Access pricing');
assert(shopPage.includes('Start the 3-day trial · $1'), 'shop card CTA uses the paid trial offer');
assert(!shopPage.includes('3 days free'), 'shop card has no stale free-trial price');
assert(!shopPage.includes('No card required'), 'shop card has no stale no-card-required copy');
assert(!shopPage.includes('Founding Members'), 'shop card has no stale Founding Members copy');
assert(!shopPage.includes('Start the free trial'), 'shop card has no stale free-trial CTA');
assert(shopPage.includes('/assets/js/main.js?v=2'), 'shop page loads the cache-busted main script');
assert(mainScript.includes('/assets/js/wdis-launch-popup.js?v=2'), 'main script loads the cache-busted launch popup');
assert(launchPopup.includes('Lifetime Access'), 'launch popup uses Lifetime Access');
assert(launchPopup.includes('3 days for $1 once'), 'launch popup advertises the $1 three-day paid trial');
assert(launchPopup.includes('No automatic renewal'), 'launch popup states there is no automatic renewal');
assert(!launchPopup.includes('3-day free trial'), 'launch popup has no stale free-trial sentence');
assert(!launchPopup.includes('3 days free'), 'launch popup has no stale free-trial badge');
assert(!launchPopup.includes('No card required'), 'launch popup has no stale no-card-required badge');
assert(!launchPopup.includes('Founding Member'), 'launch popup has no stale Founding Member copy');
assert(refunds.includes('Lifetime Access'), 'refund policy uses Lifetime Access');
assert(!refunds.includes('Founding Member'), 'refund policy has no stale Founding Member copy');
assert(terms.includes('Lifetime Access'), 'terms use Lifetime Access');
assert(!terms.includes('Founding Member'), 'terms have no stale Founding Member copy');
assert(rootServiceWorker.includes("sheema-edit-v28"), 'public site is serving cache v28');
assert(rootServiceWorker.includes('/assets/js/main.js?v=2'), 'public cache stores the cache-busted main script');
assert(rootServiceWorker.includes('/assets/js/wdis-launch-popup.js?v=2'), 'public cache stores the cache-busted paid-trial popup');
assert(paidTrialAccess.includes('Choose Lifetime Access to keep using Sparkle.'), 'post-trial state points customers to Lifetime Access');
assert(!paidTrialAccess.includes('Founding Member'), 'post-trial access script has no stale Founding Member copy');
assert(scopedServiceWorker.includes("wdis-v38"), 'What Do I Say scoped cache is refreshed to v38');
assert(scopedServiceWorker.includes('/what-do-i-say/lifetime-copy.js?v=1'), 'Lifetime Access copy guard is a fresh scoped asset');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(() => {
  try {
    [
      'wdis_trial_started_at_v2',
      'wdis_founder_session_v1',
      'wdis_pending_founder_session_v1',
      'wdis_founder_claim_v1',
      'wdis_paid_trial_session_v1',
      'wdis_paid_trial_expires_at_v1',
      'wdis_pending_trial_checkout_v1',
      'wdis_paid_trial_gate_v1',
      'wdis_paid_trial_used_v1'
    ].forEach((key) => localStorage.removeItem(key));
  } catch (_) {}
});

let checkoutBody = null;
await context.route(`${API}/api/checkout`, async (route) => {
  checkoutBody = route.request().postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sessionId: 'cs_live_paidtrialuismoke',
      url: 'https://checkout.stripe.com/c/pay/cs_live_paidtrialuismoke',
      offer: checkoutBody?.offer
    })
  });
});
await context.route('https://checkout.stripe.com/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe Checkout smoke</title>' });
});

const page = await context.newPage();
try {
  await page.goto(`${SITE}?paid_trial_ui=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const scripts = await page.evaluate(() => [...document.scripts].map((script) => script.getAttribute('src') || ''));
  assert(scripts.some((src) => src.includes('payment-v3.js?v=1')), 'production loads the $1 trial checkout controller');
  assert(scripts.some((src) => src.includes('paid-trial-access.js?v=1')), 'production loads the paid trial access gate');
  assert(scripts.some((src) => src.includes('lifetime-copy.js?v=1')), 'production loads the Lifetime Access copy guard');
  assert(scripts.some((src) => src.includes('chat-app.js?v=26')), 'production loads the cache-busted access-status app');

  await page.waitForFunction(() => document.querySelector('#trial-status')?.textContent?.includes('$1'));
  assert((await page.locator('#trial-status').textContent())?.includes('$1'), 'fresh customer sees the $1 three-day trial price');
  assert((await page.locator('#trial-detail').textContent())?.toLowerCase().includes('no auto-renewal'), 'fresh customer sees no automatic renewal');

  await page.locator('#prompt').fill('Tell Maya I am running ten minutes late.');
  await page.locator('#generate').click();
  await page.locator('#paywall').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.locator('.message-row.assistant:not(.working)').count()) === 0, 'fresh customer cannot generate before purchasing access');

  const trialButton = page.locator('#paywall [data-checkout-offer="trial"]');
  const lifetimeButton = page.locator('#paywall [data-checkout-offer="founder"]');
  assert(await trialButton.isVisible(), 'paywall offers the $1 trial');
  assert((await trialButton.textContent())?.includes('$1'), '$1 trial button shows the price');
  assert(await lifetimeButton.isVisible(), 'paywall offers the separate Lifetime Access option');
  assert((await lifetimeButton.textContent())?.includes('Lifetime Access'), 'Lifetime Access button uses the current offer name');
  assert((await lifetimeButton.textContent())?.includes('$19.99'), 'Lifetime Access button keeps the $19.99 one-time price');
  const paywallText = await page.locator('#paywall').innerText();
  assert(paywallText.includes('Lifetime Access'), 'visible paywall copy names Lifetime Access');
  assert(!paywallText.includes('Founding Member'), 'visible paywall copy has no stale Founding Member text');

  await trialButton.click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10_000 });
  assert(checkoutBody?.offer === 'trial', '$1 trial button sends the trial offer to checkout');
  assert(/^[a-f0-9]{64}$/.test(String(checkoutBody?.claimToken || '')), 'trial checkout remains browser-claim bound');

  // The page is now on checkout.stripe.com. Inspect the browser context's
  // persisted storage for The Sheema Edit origin rather than Stripe localStorage.
  const storage = await context.storageState();
  const siteOrigin = storage.origins.find((entry) => entry.origin === 'https://thesheemaedit.com');
  const pendingTrial = siteOrigin?.localStorage?.find((entry) => entry.name === 'wdis_pending_trial_checkout_v1')?.value || '';
  assert(pendingTrial === '1', 'browser remembers that the pending checkout is the trial');

  {
    const trialReturnContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    const trialClaim = 'a'.repeat(64);
    const trialSession = 'cs_live_paidtrialreturn123';
    let trialVerifyBody = null;

    await trialReturnContext.addInitScript(({ claim }) => {
      localStorage.setItem('wdis_founder_claim_v1', claim);
      localStorage.setItem('wdis_pending_trial_checkout_v1', '1');
      [
        'wdis_founder_session_v1',
        'wdis_pending_founder_session_v1',
        'wdis_paid_trial_session_v1',
        'wdis_paid_trial_expires_at_v1',
        'wdis_paid_trial_used_v1'
      ].forEach((key) => localStorage.removeItem(key));
    }, { claim: trialClaim });

    await trialReturnContext.route(`${API}/api/verify-payment`, async (route) => {
      trialVerifyBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paid: true,
          accessType: 'trial',
          expiresAt: Date.now() + (72 * 60 * 60 * 1000),
          autoRenews: false
        })
      });
    });

    const trialReturnPage = await trialReturnContext.newPage();
    await trialReturnPage.goto(`${SITE}?checkout=success&session_id=${trialSession}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await trialReturnPage.waitForFunction(
      (session) => localStorage.getItem('wdis_paid_trial_session_v1') === session,
      trialSession,
      { timeout: 15_000 }
    );
    await trialReturnPage.waitForFunction(
      () => (document.querySelector('#trial-detail')?.textContent || '').includes('$1 trial active'),
      null,
      { timeout: 15_000 }
    );

    const trialState = await trialReturnPage.evaluate(() => ({
      trialSession: localStorage.getItem('wdis_paid_trial_session_v1'),
      founderSession: localStorage.getItem('wdis_founder_session_v1'),
      pendingTrial: localStorage.getItem('wdis_pending_trial_checkout_v1'),
      trialUsed: localStorage.getItem('wdis_paid_trial_used_v1'),
      trialStart: Number(localStorage.getItem('wdis_trial_started_at_v2') || 0),
      status: document.querySelector('#trial-status')?.textContent || '',
      detail: document.querySelector('#trial-detail')?.textContent || '',
      paymentStatus: document.querySelector('[data-payment-status]')?.textContent || '',
      paywallHidden: document.querySelector('#paywall')?.hidden === true,
      search: location.search
    }));

    assert(trialVerifyBody?.sessionId === trialSession, 'paid trial return verifies the Stripe session from the success URL');
    assert(trialVerifyBody?.claimToken === trialClaim, 'paid trial return stays bound to the purchasing browser claim');
    assert(trialState.trialSession === trialSession, 'paid trial success return activates exactly the paid trial entitlement');
    assert(trialState.founderSession === null, 'paid trial success return does not grant Lifetime Access');
    assert(trialState.pendingTrial === null, 'paid trial pending marker clears after verification');
    assert(trialState.trialUsed === '1', 'paid trial is recorded as used after verification');
    assert(trialState.trialStart > 0 && Date.now() - trialState.trialStart < 3 * 24 * 60 * 60 * 1000, 'paid trial return creates an active three-day access window');
    assert(trialState.detail.includes('$1 trial active') && trialState.detail.includes('no auto-renewal'), 'paid trial return shows the active non-renewing trial state');
    assert(/trial is active/i.test(trialState.paymentStatus), 'paid trial return confirms access to the customer');
    assert(trialState.paywallHidden, 'paid trial return closes the paywall after server verification');
    assert(trialState.search === '', 'paid trial success parameters are removed after verification starts');

    await trialReturnContext.close();
  }

  {
    const lifetimeReturnContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block'
    });
    const lifetimeClaim = 'b'.repeat(64);
    const lifetimeSession = 'cs_live_lifetimereturn123';
    let lifetimeVerifyBody = null;

    await lifetimeReturnContext.addInitScript(({ claim }) => {
      localStorage.setItem('wdis_founder_claim_v1', claim);
      [
        'wdis_pending_trial_checkout_v1',
        'wdis_paid_trial_session_v1',
        'wdis_paid_trial_expires_at_v1',
        'wdis_founder_session_v1',
        'wdis_pending_founder_session_v1'
      ].forEach((key) => localStorage.removeItem(key));
    }, { claim: lifetimeClaim });

    await lifetimeReturnContext.route(`${API}/api/verify-payment`, async (route) => {
      lifetimeVerifyBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ paid: true, accessType: 'founder' })
      });
    });

    const lifetimeReturnPage = await lifetimeReturnContext.newPage();
    await lifetimeReturnPage.goto(`${SITE}?checkout=success&session_id=${lifetimeSession}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    const lifetimePageErrors = [];
    lifetimeReturnPage.on('pageerror', (error) => lifetimePageErrors.push(String(error?.stack || error)));
    await lifetimeReturnPage.waitForTimeout(1500);
    const lifetimeDiagnostic = await lifetimeReturnPage.evaluate(() => ({
      founderSession: localStorage.getItem('wdis_founder_session_v1'),
      pendingFounder: localStorage.getItem('wdis_pending_founder_session_v1'),
      pendingTrial: localStorage.getItem('wdis_pending_trial_checkout_v1'),
      claim: localStorage.getItem('wdis_founder_claim_v1'),
      paymentStatus: document.querySelector('[data-payment-status]')?.textContent || '',
      scripts: [...document.scripts].map((script) => script.getAttribute('src') || ''),
      search: location.search
    }));
    console.log('LIFETIME_RETURN_DIAGNOSTIC', JSON.stringify({
      verifyBody: lifetimeVerifyBody,
      state: lifetimeDiagnostic,
      pageErrors: lifetimePageErrors
    }));
    assert(Boolean(lifetimeVerifyBody), 'Lifetime Access return reaches the server verification request');
    assert(lifetimePageErrors.length === 0, 'Lifetime Access return has no browser runtime error');
    await lifetimeReturnPage.waitForFunction(
      (session) => localStorage.getItem('wdis_founder_session_v1') === session,
      lifetimeSession,
      { timeout: 15_000 }
    );
    await lifetimeReturnPage.waitForFunction(
      () => /Lifetime Access/i.test(document.querySelector('[data-payment-status]')?.textContent || ''),
      null,
      { timeout: 15_000 }
    );

    const lifetimeState = await lifetimeReturnPage.evaluate(() => ({
      founderSession: localStorage.getItem('wdis_founder_session_v1'),
      pendingFounder: localStorage.getItem('wdis_pending_founder_session_v1'),
      trialSession: localStorage.getItem('wdis_paid_trial_session_v1'),
      paymentStatus: document.querySelector('[data-payment-status]')?.textContent || '',
      paywallHidden: document.querySelector('#paywall')?.hidden === true,
      search: location.search
    }));

    assert(lifetimeVerifyBody?.sessionId === lifetimeSession, 'Lifetime Access return verifies the Stripe session from the success URL');
    assert(lifetimeVerifyBody?.claimToken === lifetimeClaim, 'Lifetime Access return stays bound to the purchasing browser claim');
    assert(lifetimeState.founderSession === lifetimeSession, 'server-verified Lifetime Access persists for return visits');
    assert(lifetimeState.pendingFounder === null, 'Lifetime Access pending session clears after verification');
    assert(lifetimeState.trialSession === null, 'Lifetime Access return does not create a paid trial entitlement');
    assert(/Lifetime Access/i.test(lifetimeState.paymentStatus) && /unlocked/i.test(lifetimeState.paymentStatus), 'Lifetime Access return visibly confirms the current offer name');
    assert(!/Founding Member/i.test(lifetimeState.paymentStatus), 'Lifetime Access return exposes no stale Founding Member copy');
    assert(lifetimeState.paywallHidden, 'Lifetime Access return closes the paywall after server verification');
    assert(lifetimeState.search === '', 'Lifetime Access success parameters are removed after verification');

    await lifetimeReturnContext.close();
  }

  console.log('PAID_TRIAL_UI_PASS');
} finally {
  await context.close();
  await browser.close();
}
