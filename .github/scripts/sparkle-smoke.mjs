import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = [
    'what-do-i-say/chat-app.js',
    'what-do-i-say/config.js',
    'what-do-i-say/payment-v3.js',
    'what-do-i-say/sparkle.js',
    'what-do-i-say/sparkle-cloud-mobile.js',
    'what-do-i-say/sparkle-worker.js',
    'what-do-i-say/styles.css',
    'what-do-i-say/service-worker.js'
  ];
  const expected = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  for (let attempt = 0; attempt < 36; attempt++) {
    const matches = await Promise.all(paths.map(async (path, index) => {
      try {
        const response = await fetch(`https://thesheemaedit.com/${path}?verify=${Date.now()}`, { cache: 'no-store' });
        return response.ok && (await response.text()).trim() === expected[index].trim();
      } catch { return false; }
    }));
    if (matches.every(Boolean)) {
      console.log('PASS production assets match the tested chat revision');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Pages has not deployed the chat revision under test');
}
await waitForProductionAssets();

const SITE = `https://thesheemaedit.com/what-do-i-say/?sparkle_smoke=${Date.now()}`;
const BASE = 'https://thesheemaedit.com/what-do-i-say/';
const API = 'https://what-do-i-say-payments.rasheema-abdullah.workers.dev';
const RESULT_TIMEOUT = 12 * 60 * 1000;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });

function assert(condition, message) { if (!condition) throw new Error(message); }
function has(text, pattern) { return pattern.test(String(text || '')); }
function normalized(text) { return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
function assertSendable(output, label) {
  const text = String(output || '').trim();
  assert(text.length >= 8, `${label} is too short`);
  assert(text.length <= 1600, `${label} is too long`);
  assert(!/^(?:here(?:'s| is)|rewritten message|revised message|message:|response:)/i.test(text), `${label} starts with meta commentary`);
  assert(!/<\/?think>|<\|/i.test(text), `${label} leaked model markup`);
}
function assertSchedule(output, label) {
  assertSendable(output, label);
  assert(has(output, /Jordan/i), `${label} lost Jordan`);
  assert(has(output, /Friday/i) && has(output, /7\s*PM/i), `${label} lost Friday 7 PM`);
  assert(has(output, /Saturday/i) && has(output, /2\s*PM/i), `${label} lost Saturday 2 PM`);
  assert(has(output, /(?:cannot|can['’]?t|cant|won['’]?t|wont|will not|unable|unavailable|not available|don['’]?t think I(?:['’]?ll| will) be able|do not think I(?:['’]?ll| will) be able|don['’]?t think I can|do not think I can)/i), `${label} lost the refusal`);
}

async function freshContext(userAgent = 'Sparkle-Smoke-Test/1.0 Chrome') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    try {
      localStorage.removeItem('wdis_trial_started_at_v2');
      localStorage.removeItem('wdis_founder_session_v1');
      localStorage.removeItem('wdis_pending_founder_session_v1');
      localStorage.removeItem('wdis_founder_claim_v1');
      localStorage.setItem('wdis_sparkle_profile_v1', JSON.stringify({ profile: 'Sparkle Compatible', backend: 'wasm', at: Date.now() }));
    } catch {}
  });
  return context;
}

const context = await freshContext();
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });

async function assistantCount(target = page) { return target.locator('.message-row.assistant:not(.working)').count(); }
async function waitForAnswer(before, target = page) {
  await target.waitForFunction((count) => {
    const error = document.querySelector('#ai-error');
    if (error && !error.hidden) return true;
    return document.querySelectorAll('.message-row.assistant:not(.working)').length > count && !document.querySelector('#generate')?.disabled;
  }, before, { timeout: RESULT_TIMEOUT });
  const errorVisible = await target.locator('#ai-error').evaluate(node => !node.hidden);
  if (errorVisible) throw new Error(`Sparkle UI error: ${(await target.locator('#ai-error-message').textContent()) || 'unknown error'}`);
  return (await target.locator('.message-row.assistant:not(.working) .bubble').last().textContent())?.trim() || '';
}
async function send(text, target = page) {
  const before = await assistantCount(target);
  await target.locator('#prompt').fill(text);
  await target.locator('#generate').click();
  const output = await waitForAnswer(before, target);
  assertSendable(output, 'Sparkle answer');
  return output;
}
async function resetMode(mode, target = page) {
  if (await target.locator('#new-message-top').isVisible()) await target.locator('#new-message-top').click();
  await target.locator(`[data-mode="${mode}"]`).click();
}
async function refineWith(label, target = page) {
  const current = target.locator('.message-row.assistant:not(.working)').last();
  const more = current.locator('.more-options');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  const before = await assistantCount(target);
  await current.locator('.refine-options button').filter({ hasText: label }).click();
  return waitForAnswer(before, target);
}

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const assets = await page.evaluate(() => [...document.scripts].map(script => script.getAttribute('src') || ''));
  assert(assets.some(src => src.includes('sparkle.js?v=22')), 'Production is not loading sparkle.js?v=22');
  assert(assets.some(src => src.includes('sparkle-cloud-mobile.js?v=2')), 'Production is not loading sparkle-cloud-mobile.js?v=2');
  assert(assets.some(src => src.includes('chat-app.js?v=24')), 'Production is not loading chat-app.js?v=24');
  assert(assets.some(src => src.includes('config.js?v=9')), 'Production is not loading config.js?v=9');
  assert(assets.some(src => src.includes('payment-v3.js?v=1')), 'Production is not loading payment-v3.js?v=1');

  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    composerRight: document.querySelector('.composer-box')?.getBoundingClientRect().right || 0
  }));
  assert(layout.width === 390, `Unexpected viewport: ${layout.width}`);
  assert(layout.scrollWidth <= layout.width + 2, `Horizontal overflow: ${JSON.stringify(layout)}`);
  assert(layout.composerRight <= layout.width + 1, `Composer overflows: ${JSON.stringify(layout)}`);
  assert(await page.locator('#welcome-card').isVisible(), 'Welcome card is not visible');
  assert((await page.locator('.mode').count()) === 3, 'Expected three starter choices');
  assert((await page.locator('[data-checkout-offer="trial"]').count()) >= 1, 'Trial checkout control is missing');
  assert((await page.locator('[data-founder-checkout]').count()) >= 1, 'Lifetime Access checkout control is missing');
  console.log('PASS compact chat-first mobile layout');

  const health = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/health`, { cache: 'no-store', credentials: 'omit', mode: 'cors' });
    return { status: response.status, data: await response.json() };
  }, API);
  assert(health.status === 200 && health.data?.ok === true && health.data?.provider === 'cloudflare-workers', `Cloudflare payment health failed: ${JSON.stringify(health)}`);

  const rejectedCheckout = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store', credentials: 'omit', mode: 'cors' });
    return { status: response.status, data: await response.json() };
  }, API);
  assert(rejectedCheckout.status === 400, `Live checkout accepted a missing browser claim: ${JSON.stringify(rejectedCheckout)}`);

  const rejectedVerify = await page.evaluate(async (api) => {
    const claim = 'a'.repeat(64);
    localStorage.setItem('wdis_founder_claim_v1', claim);
    const response = await fetch(`${api}/api/verify-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'cs_live_notarealsession', claimToken: claim }), cache: 'no-store', credentials: 'omit', mode: 'cors' });
    const data = await response.json();
    return { status: response.status, data, unlocked: localStorage.getItem('wdis_founder_session_v1') };
  }, API);
  assert(rejectedVerify.status === 400 && rejectedVerify.data?.paid !== true && !rejectedVerify.unlocked, `Invalid payment verification unlocked access: ${JSON.stringify(rejectedVerify)}`);
  console.log('PASS live Cloudflare payment health and rejection boundaries');

  const trialBefore = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(!trialBefore, 'Trial started before the first successful response');

  await resetMode('write');
  await page.locator('#prompt').fill('Tell Alex I cannot make tonight.');
  await page.locator('#generate').click();
  await page.locator('#sparkle-cancel').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#sparkle-cancel').click();
  await page.waitForFunction(() => !document.querySelector('#generate')?.disabled, null, { timeout: 20_000 });
  assert(!(await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Cancellation started the trial');
  assert((await page.locator('.message-row.user .bubble').last().textContent())?.includes('Alex'), 'Canceled user message disappeared');
  await page.locator('#new-message-top').click();
  console.log('PASS cancellation preserves the user message and does not start the trial');

  await resetMode('write');
  const directRequest = await send('Can you loan me a dollar?');
  assertSendable(directRequest, 'Human-directed request');
  assert(/loan|lend|borrow|dollar|\$1|one dollar/i.test(directRequest), 'Human-directed request lost the money request');
  assert(!/(?:I(?:'m| am) sorry[^.!?]{0,80})?(?:I (?:can(?:not|'t)|am unable to)|as an AI|I do not have money|I don't have money|I cannot loan|I can't loan|I cannot lend|I can't lend)/i.test(directRequest), 'Sparkle treated a message for another person as a request directed at the AI');
  console.log('PASS communication intent: direct human request is returned as a sendable message, not answered by Sparkle');

  await page.locator('#new-message-top').click();
  const write = await send('Tell Jordan I cannot make dinner Friday at 7 PM because I am exhausted, but I can see her Saturday at 2 PM instead.');
  assertSchedule(write, 'Write');
  assert(await page.locator('#new-message-top').isVisible(), 'New message control did not appear');
  assert(Boolean(await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Trial did not start after the first successful response');

  let latest = page.locator('.message-row.assistant:not(.working)').last();
  let actionTexts = await latest.locator('.response-actions > button').allTextContents();
  assert(actionTexts[0]?.includes('Just right'), `First response action is not Just right: ${actionTexts}`);
  assert(actionTexts[1]?.includes('More options'), `Second response action is not More options: ${actionTexts}`);
  console.log('PASS Just right first, More options second');

  const refinements = [
    ['Make it shorter','Shorter'],
    ['Make it softer','Softer'],
    ['Make it firmer','Firmer'],
    ['Make it professional','Professional'],
    ['Try another version','Another']
  ];
  let previous = write;
  for (const [button,label] of refinements) {
    const output = await refineWith(button);
    assertSchedule(output, label);
    if (label === 'Shorter') assert(output.split(/\s+/).length < previous.split(/\s+/).length, 'Shorter did not get shorter');
    if (label === 'Another') assert(normalized(output) !== normalized(previous), 'Another returned the same wording');
    previous = output;
    console.log(`PASS ${label} refinement`);
  }

  let before = await assistantCount();
  await page.locator('#prompt').fill('Make it less apologetic, but keep Jordan and both dates and times.');
  await page.locator('#generate').click();
  const custom = await waitForAnswer(before);
  assertSchedule(custom, 'Typed refinement');
  const userBubbles = await page.locator('.message-row.user .bubble').allTextContents();
  assert(userBubbles.some(text => text.includes('Make it less apologetic')), 'Typed refinement did not appear as a user chat bubble');
  console.log('PASS typed back-and-forth refinement');

  latest = page.locator('.message-row.assistant:not(.working)').last();
  await latest.locator('.just-right').click();
  assert(await latest.locator('.start-new').isVisible(), 'Just right did not offer a clean next-message action');
  console.log('PASS Just right acceptance flow');

  await resetMode('reply');
  const reply = await send('They said: “Are you mad at me?” I want to say I am not mad at them, I have just been overwhelmed and need a quiet night.');
  assertSendable(reply, 'Reply');
  assert(!/^you(?:'re| are) not mad at me/i.test(reply), 'Reply reversed the speaker perspective');
  before = await assistantCount();
  await page.locator('#prompt').fill('Make it a little warmer without changing who is upset.');
  await page.locator('#generate').click();
  const replyEdit = await waitForAnswer(before);
  assertSendable(replyEdit, 'Reply typed refinement');
  assert(!/^you(?:'re| are) not mad at me/i.test(replyEdit), 'Reply refinement reversed the speaker perspective');
  console.log('PASS reply mode and typed reply refinement');

  await resetMode('fix');
  const fixed = await send('hi maya i cant meet friday at 4 PM. i can meet saturday at 10 AM.');
  assertSendable(fixed, 'Fix');
  assert(has(fixed, /Maya/i), 'Fix lost Maya');
  assert(has(fixed, /Friday/i) && has(fixed, /4\s*PM/i), 'Fix lost Friday 4 PM');
  assert(has(fixed, /Saturday/i) && has(fixed, /10\s*AM/i), 'Fix lost Saturday 10 AM');
  assert(has(fixed, /(?:cannot|can't|can’t|won't|will not|unable|unavailable)/i), 'Fix lost the refusal');
  console.log('PASS fix mode');

  assert(browserErrors.length === 0, `Browser errors: ${browserErrors.join(' | ')}`);
  console.log('PASS live Sparkle generation, every refinement, cancellation, trial start, Reply, Fix and typed chat edits');

  const mockContext = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Sparkle-Controller-Test/1.0', serviceWorkers: 'block' });
  await mockContext.route('**/what-do-i-say/sparkle.js*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `(() => { let calls = 0; window.Sparkle = Object.freeze({ name: 'Sparkle', mode: 'test', generate: async (_payload, {onStatus} = {}) => { calls += 1; onStatus?.({phase:'generating',message:'Testing retry…'}); if (calls === 1) { const error = new Error('Injected retry failure'); error.code = 'sparkle_test'; throw error; } return 'Hi Sam, retry worked and the message is ready.'; }, cancel: () => {} }); })();`
    });
  });
  await mockContext.addInitScript(() => {
    localStorage.removeItem('wdis_trial_started_at_v2');
    localStorage.removeItem('wdis_founder_session_v1');
    localStorage.removeItem('wdis_pending_founder_session_v1');
  });
  const mockPage = await mockContext.newPage();
  await mockPage.goto(`${BASE}?controller_smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await mockPage.locator('#prompt').fill('Tell Sam I will be late.');
  await mockPage.locator('#generate').click();
  await mockPage.locator('#ai-error').waitFor({ state: 'visible', timeout: 10_000 });
  assert(!(await mockPage.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Failed generation started the trial');
  await mockPage.locator('#ai-retry').click();
  await mockPage.locator('.message-row.assistant:not(.working) .bubble').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await mockPage.locator('.message-row.assistant:not(.working) .bubble').last().textContent())?.includes('retry worked'), 'Retry did not replace the failure with an answer');
  assert(Boolean(await mockPage.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Successful retry did not start the trial');
  console.log('PASS deterministic retry and trial timing');

  await mockPage.evaluate(() => {
    localStorage.setItem('wdis_trial_started_at_v2', String(Date.now() - (4 * 86400000)));
    localStorage.removeItem('wdis_founder_session_v1');
    localStorage.removeItem('wdis_pending_founder_session_v1');
  });
  const expiredUserMessagesBefore = await mockPage.locator('.message-row.user').count();
  await mockPage.locator('#prompt').fill('This should be gated.');
  await mockPage.locator('#generate').click();
  assert(await mockPage.locator('#paywall').isVisible(), 'Expired trial did not open the paywall');
  assert((await mockPage.locator('.message-row.user').count()) === expiredUserMessagesBefore, 'Expired trial submitted a message before payment');
  console.log('PASS expired trial gating');
  await mockContext.close();

  const paymentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Sparkle-Payment-UI-Test/1.0', serviceWorkers: 'block' });
  let checkoutRequested = false;
  await paymentContext.route(`${API}/api/checkout`, async route => {
    checkoutRequested = true;
    const body = JSON.parse(route.request().postData() || '{}');
    assert(/^[a-f0-9]{64}$/.test(String(body.claimToken || '')), 'Checkout UI did not send a browser claim');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId:'cs_live_uifixture123', url:'https://checkout.stripe.com/c/pay/cs_live_uifixture123' }) });
  });
  await paymentContext.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe fixture</title>' }));
  const paymentPage = await paymentContext.newPage();
  await paymentPage.goto(`${BASE}?payment_ui=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await paymentPage.locator('[data-founder-checkout]').first().click();
  await paymentPage.waitForURL(/checkout\.stripe\.com/, { timeout: 10_000 });
  assert(checkoutRequested, 'Founder button did not call the Cloudflare checkout route');
  console.log('PASS founder button sends browser claim and accepts only Stripe checkout navigation');
  await paymentContext.close();

  const invalidContext = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Sparkle-Invalid-Payment-Test/1.0', serviceWorkers: 'block' });
  const invalidPage = await invalidContext.newPage();
  await invalidPage.goto(`${BASE}?checkout=success&session_id=not-a-stripe-session`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await invalidPage.waitForTimeout(250);
  assert(!(await invalidPage.evaluate(() => localStorage.getItem('wdis_founder_session_v1'))), 'Invalid return session unlocked founder access');
  assert(!/Founding Member/i.test((await invalidPage.locator('#trial-status').textContent()) || ''), 'Invalid return session changed access status');
  console.log('PASS invalid Stripe return never unlocks access');
  await invalidContext.close();

  console.log('PASS What Do I Say comprehensive production smoke test');
} finally {
  await context.close().catch(() => {});
  await browser.close();
}
