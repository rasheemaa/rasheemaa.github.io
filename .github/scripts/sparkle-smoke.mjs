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

function has(text, pattern) {
  return pattern.test(String(text || ''));
}

function assertSendable(output, label) {
  const text = String(output || '').trim();
  assert(text.length >= 8, `${label} is too short to be a useful message`);
  assert(text.length <= 1600, `${label} is too long to be a practical message`);
  const meta = /^(?:here(?:'s| is)|the (?:message|response|tone)|your draft|i would say|task:|tone:|context:|details:|output only|rewritten message|revised message)/i;
  assert(!meta.test(text), `${label} starts with meta commentary: ${text.slice(0, 140)}`);
  assert(!/output only the final message|do not invent facts|tone:\s*(?:warm|direct|professional|casual|firm|short)/i.test(text), `${label} echoed prompt instructions`);
  assert(!/\bImportant:\s*(?:Keep these exact details:|Do not introduce or change numbers|Preserve my refusal|Keep my question|Use different wording|Make the message meaningfully shorter)/i.test(text), `${label} leaked an internal Sparkle quality check: ${text}`);
  assert(!/\bAlex\b|\blunch\b|next week/i.test(text), `${label} leaked a training/example fact: ${text}`);
  assert(!/\b(?:you're|you are) welcome for your understanding\b/i.test(text), `${label} reversed the courtesy wording: ${text}`);
}

function schedulePolarityByAnchor(output) {
  const map = new Map();
  const clauses = String(output || '').split(/\bbut\b|[.!?;]+/i);
  clauses.forEach((clause) => {
    const polarity = /\b(?:cannot|can't|can’t|unable|unavailable|not able)\b/i.test(clause)
      ? 'negative'
      : /\b(?:can|available|able to)\b/i.test(clause)
        ? 'positive'
        : '';
    if (!polarity) return;
    if (/\bFriday\b/i.test(clause)) map.set('friday', polarity);
    if (/\b4\s*PM\b/i.test(clause)) map.set('4pm', polarity);
    if (/\bSaturday\b/i.test(clause)) map.set('saturday', polarity);
    if (/\b10\s*AM\b/i.test(clause)) map.set('10am', polarity);
  });
  return map;
}

function assertFixFacts(output, label) {
  assert(has(output, /\bMaya\b/i), `${label} lost Maya`);
  assert(has(output, /\bEli\b/i), `${label} lost Eli`);
  assert(has(output, /\bFriday\b/i), `${label} lost Friday`);
  assert(has(output, /\b4\s*PM\b/i), `${label} lost 4 PM`);
  assert(has(output, /\bSaturday\b/i), `${label} lost Saturday`);
  assert(has(output, /\b10\s*AM\b/i), `${label} lost 10 AM`);
  assert(has(output, /\b(?:can't|cannot|unable|not able)\b/i), `${label} lost the refusal`);
  const polarity = schedulePolarityByAnchor(output);
  assert(polarity.get('friday') === 'negative', `${label} changed Friday from unavailable to available`);
  assert(polarity.get('4pm') === 'negative', `${label} changed 4 PM from unavailable to available`);
  assert(polarity.get('saturday') === 'positive', `${label} changed Saturday from available to unavailable`);
  assert(polarity.get('10am') === 'positive', `${label} changed 10 AM from available to unavailable`);
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

async function waitForIdle() {
  await page.waitForFunction(() => document.querySelector('#message-form')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30_000 });
}

async function assertOutputPreserved(before, label) {
  const current = (await page.locator('#result').textContent())?.trim() || '';
  assert(current === before, `${label} replaced the previous output before a new result was ready`);
}

async function generateMode(mode, text, { name = '', situation = 'general' } = {}) {
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('#person-name').fill(name);
  await page.locator('#situation').selectOption(situation);
  await page.locator('#prompt').fill(text);
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator('#generate').click();
  await assertOutputPreserved(before, `${mode} generation`);
  const value = await resultOrError(before);
  assertSendable(value.output, mode);
  console.log(`PASS ${mode.toUpperCase()} | ${value.status}`);
  console.log(`OUTPUT ${mode.toUpperCase()}: ${value.output.replace(/\s+/g, ' ').slice(0, 500)}`);
  return value.output;
}

async function refine(action) {
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator(`[data-refine="${action}"]`).click();
  await assertOutputPreserved(before, `refine ${action}`);
  const value = await resultOrError(before);
  assertSendable(value.output, `refine ${action}`);
  console.log(`PASS REFINE ${action.toUpperCase()} | ${value.status}`);
  console.log(`OUTPUT REFINE ${action.toUpperCase()}: ${value.output.replace(/\s+/g, ' ').slice(0, 500)}`);
  return value.output;
}

async function cancelBeforeFirstSuccess() {
  const draft = 'I need Friday off for a personal matter. I do not want to explain why. Ask Priya to confirm she received the message.';
  await page.locator('[data-mode="write"]').click();
  await page.locator('#person-name').fill('Priya');
  await page.locator('#situation').selectOption('work');
  await page.locator('#prompt').fill(draft);
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator('#generate').click();
  await page.locator('#sparkle-cancel').waitFor({ state: 'visible', timeout: 10_000 });
  await assertOutputPreserved(before, 'cancelled generation');
  await page.locator('#sparkle-cancel').click();
  await waitForIdle();

  assert((await page.locator('#prompt').inputValue()) === draft, 'Cancellation changed or cleared the user draft');
  await assertOutputPreserved(before, 'cancellation');
  const trial = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(!trial, 'Cancellation started the free trial before a successful Sparkle response');
  const errorVisible = await page.locator('#ai-error').evaluate((node) => !node.hidden);
  assert(!errorVisible, 'Cancellation showed an AI error instead of a stopped state');
  console.log('PASS CANCEL | draft and output preserved; trial not started');
}

async function retryAfterTransientFailure(previousOutput) {
  const draft = 'I cannot make the 3 PM meeting Tuesday. Ask Priya if 4 PM works instead.';
  await page.locator('[data-mode="write"]').click();
  await page.locator('#person-name').fill('Priya');
  await page.locator('#situation').selectOption('work');
  await page.locator('#prompt').fill(draft);

  await page.evaluate(() => {
    window.__sparkleRealForSmoke = window.Sparkle;
    const real = window.Sparkle;
    window.Sparkle = Object.freeze({
      ...real,
      generate: () => {
        const error = new Error('Forced transient Sparkle smoke failure.');
        error.code = 'sparkle_smoke_retry';
        return Promise.reject(error);
      }
    });
  });

  await page.locator('#generate').click();
  await page.locator('#ai-error').waitFor({ state: 'visible', timeout: 10_000 });
  await waitForIdle();
  await assertOutputPreserved(previousOutput, 'failed generation');
  assert((await page.locator('#prompt').inputValue()) === draft, 'Failed generation changed or cleared the user draft');

  await page.evaluate(() => {
    window.Sparkle = window.__sparkleRealForSmoke;
    delete window.__sparkleRealForSmoke;
  });

  await page.locator('#ai-retry').click();
  await assertOutputPreserved(previousOutput, 'retry');
  const value = await resultOrError(previousOutput);
  assertSendable(value.output, 'retry');
  assert(has(value.output, /\bTuesday\b/i), 'Retry lost Tuesday');
  assert(has(value.output, /\b3\s*PM\b/i), 'Retry lost 3 PM');
  assert(has(value.output, /\b4\s*PM\b/i), 'Retry lost 4 PM');
  assert(has(value.output, /\b(?:work|works|okay|ok|available)\b/i), 'Retry lost the request to check whether 4 PM works');
  console.log(`PASS RETRY | ${value.status}`);
  console.log(`OUTPUT RETRY: ${value.output.replace(/\s+/g, ' ').slice(0, 500)}`);
  return value.output;
}

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const sparkleSrc = await page.locator('script[src*="sparkle.js"]').getAttribute('src');
  assert(sparkleSrc?.includes('sparkle.js?v=11'), `Unexpected Sparkle runtime asset: ${sparkleSrc}`);

  const resultVisible = await page.locator('#result-panel').evaluate((node) => !node.hidden);
  assert(resultVisible, 'Sparkle output panel is not visible before generation');
  assert((await page.locator('#result').textContent())?.includes('Sparkle message will appear here'), 'Sparkle output placeholder is missing');
  console.log('PASS Sparkle output area is visible before generation');

  const trialBefore = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(!trialBefore, 'Local usage state was present before the first successful Sparkle response');

  await cancelBeforeFirstSuccess();

  const write = await generateMode(
    'write',
    'I need Friday off for a personal matter. I do not want to explain why. Ask Priya to confirm she received the message.',
    { name: 'Priya', situation: 'work' }
  );
  assert(has(write, /\bFriday\b/i), 'Write lost Friday');
  assert(has(write, /personal/i), 'Write lost the personal-matter context');
  assert(has(write, /\b(?:off|unavailable|away)\b/i), 'Write lost the time-off request');
  assert(has(write, /\b(?:confirm|received|got (?:this|the message)|let me know)\b/i), 'Write lost the confirmation request');
  assert(has(write, /\bPriya\b|\byou\b/i), 'Write did not address Priya directly');
  assert(!has(write, /\bshe\b/i), 'Write still refers to Priya in third person instead of addressing her');
  assert(!has(write, /\bAlex\b|\blunch\b|next week/i), 'Write copied the removed example instead of the user facts');

  const trialAfter = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(Boolean(trialAfter), 'Successful Sparkle response did not record local usage state');

  const profile = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('wdis_sparkle_profile_v1') || 'null'); } catch (_) { return null; }
  });
  assert(profile?.profile === 'Sparkle Compatible', `Expected Sparkle Compatible profile, received ${JSON.stringify(profile)}`);
  assert(profile?.backend === 'wasm', `Expected WASM backend, received ${JSON.stringify(profile)}`);
  console.log(`PASS model initialized | ${profile.profile} / ${profile.backend}`);

  await retryAfterTransientFailure(write);

  const reply = await generateMode(
    'reply',
    'They said: “Are you mad at me because I cancelled dinner?” I want to say I am overwhelmed and need a little space, but I am not angry at them and I will text them tomorrow.',
    { name: 'Jordan', situation: 'relationship' }
  );
  assert(has(reply, /overwhelm|space/i), 'Reply lost the need for space');
  assert(has(reply, /\bI(?:'m| am)\s+not\s+(?:mad|angry|upset)\s+(?:at|with)\s+you\b/i), 'Reply reversed or lost who is not angry');
  assert(!has(reply, /\byou(?:'re| are)\s+not\s+(?:mad|angry|upset)\s+(?:at|with)\s+me\b/i), 'Reply reversed the speaker and recipient');
  assert(has(reply, /tomorrow/i), 'Reply lost the tomorrow follow-up');
  assert(has(reply, /\byou\b/i), 'Reply does not address the sender directly');
  assert(!has(reply, /\bthem\b/i), 'Reply still talks about the sender in third person');

  const fixed = await generateMode(
    'fix',
    'hey maya i cant bring eli to soccer friday at 4 pm but i can saturday at 10 am sorry',
    { name: 'Maya', situation: 'cancel' }
  );
  assertFixFacts(fixed, 'Fix');

  for (const action of ['shorter', 'softer', 'firmer', 'professional', 'another']) {
    const output = await refine(action);
    assertFixFacts(output, `Refine ${action}`);
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