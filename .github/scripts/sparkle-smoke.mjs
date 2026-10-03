import { chromium } from 'playwright';

const SITE = `https://thesheemaedit.com/what-do-i-say/?sparkle_smoke=${Date.now()}`;
const RESULT_TIMEOUT = 12 * 60 * 1000;

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage']
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Sparkle-Smoke-Test/1.0 Chrome'
});

await context.addInitScript(() => {
  try {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 2 });
  } catch (_) {}
  try {
    localStorage.removeItem('wdis_trial_started_at_v2');
    localStorage.removeItem('wdis_history_v1');
    localStorage.setItem('wdis_sparkle_profile_v1', JSON.stringify({
      profile: 'Sparkle Compatible',
      backend: 'wasm',
      at: Date.now()
    }));
  } catch (_) {}
});

const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSendable(output, label) {
  const text = String(output || '').trim();
  assert(text.length >= 8, `${label} is too short to be a useful message`);
  assert(text.length <= 1600, `${label} is too long to be a practical message`);
  const meta = /^(?:here(?:'s| is)|the (?:message|response|tone)|your draft|i would say|task:|tone:|context:|details:|output only|rewritten message|revised message)/i;
  assert(!meta.test(text), `${label} starts with meta commentary: ${text.slice(0, 140)}`);
  assert(!/output only the final message|do not invent facts|tone:\s*(?:warm|direct|professional|casual|firm|short)/i.test(text), `${label} echoed prompt instructions`);
}

async function resultOrError(previous = '') {
  const handle = await page.waitForFunction((before) => {
    const errorBox = document.querySelector('#ai-error');
    if (errorBox && !errorBox.hidden) {
      return {
        kind: 'error',
        message: document.querySelector('#ai-error-message')?.textContent?.trim() || 'Unknown Sparkle UI error',
        status: document.querySelector('#sparkle-status-text')?.textContent?.trim() || ''
      };
    }

    const form = document.querySelector('#message-form');
    const output = document.querySelector('#result')?.textContent?.trim() || '';
    const panel = document.querySelector('#result-panel');
    const busy = form?.getAttribute('aria-busy') === 'true';
    if (!busy && panel && !panel.hidden && output && output !== before) {
      return {
        kind: 'result',
        output,
        status: document.querySelector('#sparkle-status-text')?.textContent?.trim() || ''
      };
    }
    return false;
  }, previous, { timeout: RESULT_TIMEOUT });

  const value = await handle.jsonValue();
  if (value.kind === 'error') {
    throw new Error(`Sparkle UI error: ${value.message} | ${value.status}`);
  }
  return value;
}

async function generateMode(mode, text) {
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('#prompt').fill(text);
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator('#generate').click();
  const value = await resultOrError(before);
  assertSendable(value.output, mode);
  console.log(`PASS ${mode.toUpperCase()} | ${value.status}`);
  console.log(`OUTPUT ${mode.toUpperCase()}: ${value.output.replace(/\s+/g, ' ').slice(0, 500)}`);
  return value.output;
}

async function refine(action) {
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator(`[data-refine="${action}"]`).click();
  const value = await resultOrError(before);
  assertSendable(value.output, `refine ${action}`);
  console.log(`PASS REFINE ${action.toUpperCase()} | ${value.status}`);
  console.log(`OUTPUT REFINE ${action.toUpperCase()}: ${value.output.replace(/\s+/g, ' ').slice(0, 500)}`);
  return value.output;
}

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const sparkleSrc = await page.locator('script[src*="sparkle.js"]').getAttribute('src');
  assert(sparkleSrc?.includes('sparkle.js?v=4'), `Unexpected Sparkle runtime asset: ${sparkleSrc}`);

  const checkoutActions = await page.locator('#founder a, #founder button').count();
  assert(checkoutActions === 0, 'Checkout is not paused: actionable founder checkout control was found');
  console.log('PASS checkout remains paused');

  const trialBefore = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(!trialBefore, 'Trial started before the first successful Sparkle response');
  console.log('PASS trial has not started before generation');

  const write = await generateMode('write', 'Tell my manager I need tomorrow off for a personal matter. I want to be respectful and not overshare.');
  assert(/tomorrow|personal|day off|time off/i.test(write), 'Write result lost the core time-off request');

  const trialAfter = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(Boolean(trialAfter), 'Trial did not start after the first successful Sparkle response');
  console.log('PASS trial starts only after first successful result');

  const profile = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('wdis_sparkle_profile_v1') || 'null'); } catch (_) { return null; }
  });
  assert(profile?.profile === 'Sparkle Compatible', `Expected Sparkle Compatible profile, received ${JSON.stringify(profile)}`);
  assert(profile?.backend === 'wasm', `Expected WASM backend, received ${JSON.stringify(profile)}`);
  console.log(`PASS model initialized | ${profile.profile} / ${profile.backend}`);

  const reply = await generateMode('reply', 'They said: “Are you mad at me? You have been quiet all day.” I want to say I am overwhelmed and need a little space, but I am not angry at them.');
  assert(/not (?:mad|angry)|overwhelm|space/i.test(reply), 'Reply result lost the core relationship intent');

  const fixed = await generateMode('fix', 'hey i cant make it today sorry i know this is last minute but something came up can we do another day');
  assert(/today|another day|reschedul|make it/i.test(fixed), 'Fix result lost the core cancellation intent');

  for (const action of ['shorter', 'softer', 'firmer', 'professional', 'another']) {
    await refine(action);
  }

  const uiErrorVisible = await page.locator('#ai-error').evaluate((node) => !node.hidden);
  assert(!uiErrorVisible, 'AI error box is visible after the smoke suite');

  const relevantErrors = browserErrors.filter((line) => !/favicon|googletagmanager|google-analytics/i.test(line));
  assert(relevantErrors.length === 0, `Browser errors detected:\n${relevantErrors.join('\n')}`);

  console.log('SPARKLE_SMOKE_TEST_PASS');
} catch (error) {
  console.error('SPARKLE_SMOKE_TEST_FAIL');
  console.error(error?.stack || error);
  try {
    console.error('STATUS:', await page.locator('#sparkle-status-text').textContent());
    console.error('UI ERROR:', await page.locator('#ai-error-message').textContent());
    console.error('BROWSER ERRORS:', browserErrors.join(' | '));
  } catch (_) {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
