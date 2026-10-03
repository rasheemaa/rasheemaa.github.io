import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = [
    'what-do-i-say/app.js',
    'what-do-i-say/sparkle.js',
    'what-do-i-say/sparkle-worker.js'
  ];
  const expected = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
  for (let attempt = 0; attempt < 24; attempt++) {
    const matches = await Promise.all(paths.map(async (path, index) => {
      try {
        const response = await fetch(`https://thesheemaedit.com/${path}?verify=${Date.now()}`, { cache: 'no-store' });
        return response.ok && (await response.text()).trim() === expected[index].trim();
      } catch (_) {
        return false;
      }
    }));
    if (matches.every(Boolean)) {
      console.log('PASS production assets match the targeted revision');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Pages has not deployed the targeted revision');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await waitForProductionAssets();

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Sparkle-Targeted-Smoke/1.0 Chrome'
});

await context.addInitScript(() => {
  try {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 2 });
  } catch (_) {}
  try {
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

async function waitForResult(previous) {
  const handle = await page.waitForFunction((before) => {
    const errorBox = document.querySelector('#ai-error');
    if (errorBox && !errorBox.hidden) {
      return {
        kind: 'error',
        message: document.querySelector('#ai-error-message')?.textContent?.trim() || 'Unknown Sparkle error',
        status: document.querySelector('#sparkle-status-text')?.textContent?.trim() || ''
      };
    }
    const busy = document.querySelector('#message-form')?.getAttribute('aria-busy') === 'true';
    const output = document.querySelector('#result')?.textContent?.trim() || '';
    if (!busy && output && output !== before) return { kind: 'result', output };
    return false;
  }, previous, { timeout: 12 * 60 * 1000 });
  const value = await handle.jsonValue();
  if (value.kind === 'error') throw new Error(`Sparkle UI error: ${value.message} | ${value.status}`);
  return value.output;
}

async function generate(text, name = 'Priya') {
  await page.locator('[data-mode="write"]').click();
  await page.locator('#person-name').fill(name);
  await page.locator('#situation').selectOption('work');
  await page.locator('#prompt').fill(text);
  const before = (await page.locator('#result').textContent())?.trim() || '';
  await page.locator('#generate').click();
  assert((await page.locator('#result').textContent())?.trim() === before, 'Generation replaced the prior output before a result was ready');
  return waitForResult(before);
}

try {
  await page.goto(`https://thesheemaedit.com/what-do-i-say/?sparkle_targeted=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const sparkleSrc = await page.locator('script[src*="sparkle.js"]').getAttribute('src');
  assert(sparkleSrc?.includes('sparkle.js?v=13'), `Unexpected Sparkle runtime asset: ${sparkleSrc}`);

  const good = await generate('I need Friday off for a personal matter. Ask Priya to confirm she received the message.');
  assert(/Friday/i.test(good), 'Setup generation lost Friday');
  console.log(`PASS targeted setup generation: ${good.replace(/\s+/g, ' ').slice(0, 300)}`);

  const retryDraft = 'I cannot make the 3 PM meeting Tuesday. Ask Priya if 4 PM works instead.';
  await page.locator('#prompt').fill(retryDraft);
  await page.evaluate(() => {
    window.__sparkleRealForTargetedSmoke = window.Sparkle;
    const real = window.Sparkle;
    window.Sparkle = Object.freeze({
      ...real,
      generate: () => {
        const error = new Error('Forced transient Sparkle targeted failure.');
        error.code = 'sparkle_targeted_retry';
        return Promise.reject(error);
      }
    });
  });

  await page.locator('#generate').click();
  await page.locator('#ai-error').waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('#message-form')?.getAttribute('aria-busy') !== 'true');
  assert((await page.locator('#result').textContent())?.trim() === good, 'Transient failure replaced the previous good output');
  assert((await page.locator('#prompt').inputValue()) === retryDraft, 'Transient failure changed the retry draft');

  await page.evaluate(() => {
    window.Sparkle = window.__sparkleRealForTargetedSmoke;
    delete window.__sparkleRealForTargetedSmoke;
  });

  await page.locator('#ai-retry').click();
  assert((await page.locator('#result').textContent())?.trim() === good, 'Retry replaced the previous good output before success');
  const output = await waitForResult(good);

  assert(/\bTuesday\b/i.test(output), 'Retry lost Tuesday');
  assert(/\b3\s*PM\b/i.test(output), 'Retry lost 3 PM');
  assert(/\b4\s*PM\b/i.test(output), 'Retry lost 4 PM');
  assert(/\b(?:cannot|can['’]t|unable|unavailable|not able|conflict|reschedul(?:e|ing)|another commitment)\b/i.test(output), `Retry lost the explicit scheduling refusal: ${output}`);
  assert(!/\bI\s+can\s+make\s+(?:the\s+)?3\s*PM\b/i.test(output), `Retry reversed the 3 PM refusal: ${output}`);
  assert(/\b(?:work|works|okay|ok|available|let me know)\b/i.test(output), 'Retry lost the request to check whether 4 PM works');
  assert(!/\bAsk\s+Priya\b/i.test(output), `Retry repeated note-taking instructions: ${output}`);
  assert(!/\bImportant:\s*(?:Keep these exact details:|Preserve my refusal|Use different wording)/i.test(output), `Retry leaked an internal validator note: ${output}`);

  const relevantErrors = browserErrors.filter((line) => !/favicon|googletagmanager|google-analytics/i.test(line));
  assert(relevantErrors.length === 0, `Browser errors detected:\n${relevantErrors.join('\n')}`);

  console.log(`PASS TARGETED RETRY REFUSAL: ${output.replace(/\s+/g, ' ').slice(0, 500)}`);
  console.log('SPARKLE_TARGETED_TEST_PASS');
} catch (error) {
  console.error('SPARKLE_TARGETED_TEST_FAIL');
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
