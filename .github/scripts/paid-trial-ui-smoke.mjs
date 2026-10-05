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

const [homepage, mainScript, launchPopup, refunds, terms, rootServiceWorker, paidTrialAccess, scopedServiceWorker] = await Promise.all([
  fetchLiveText(''),
  fetchLiveText('assets/js/main.js?v=2'),
  fetchLiveText('assets/js/wdis-launch-popup.js?v=2'),
  fetchLiveText('what-do-i-say/refunds/'),
  fetchLiveText('what-do-i-say/terms/'),
  fetchLiveText('service-worker.js'),
  fetchLiveText('what-do-i-say/paid-trial-access.js?v=1'),
  fetchLiveText('what-do-i-say/service-worker.js')
]);
assert(homepage.includes('/assets/js/main.js?v=2'), 'homepage loads the cache-busted main script');
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
assert(scopedServiceWorker.includes("wdis-v37"), 'What Do I Say scoped cache is refreshed to v37');
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

  console.log('PAID_TRIAL_UI_PASS');
} finally {
  await context.close();
  await browser.close();
}
