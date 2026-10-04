import { webkit } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = [
    'what-do-i-say/bootstrap.js',
    'what-do-i-say/sparkle-mobile-worker.js'
  ];
  const expected = await Promise.all(paths.map((path) => readFile(path, 'utf8')));

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const matches = await Promise.all(paths.map(async (path, index) => {
      try {
        const response = await fetch(`https://thesheemaedit.com/${path}?verify=${Date.now()}`, { cache: 'no-store' });
        return response.ok && (await response.text()).trim() === expected[index].trim();
      } catch (_) {
        return false;
      }
    }));
    if (matches.every(Boolean)) {
      console.log('PASS production mobile Sparkle assets match the targeted revision');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Pages has not deployed the targeted mobile Sparkle revision');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await waitForProductionAssets();

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1024, height: 1366 },
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});

const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`https://thesheemaedit.com/what-do-i-say/?sparkle_mobile=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });

  const routedToMobile = await page.evaluate(() => window.__WDIS_MOBILE_SPARKLE === true);
  assert(routedToMobile, 'iPad Safari identity was not routed to Sparkle Mobile');
  console.log('PASS iPad Safari identity routes to Sparkle Mobile');

  await page.locator('#prompt').fill('Tell Brandon I can meet tomorrow at 3 PM but I cannot make 2 PM');
  await page.locator('#generate').click();

  await page.waitForFunction(() => {
    const text = document.querySelector('#result')?.textContent?.trim() || '';
    const busy = document.querySelector('#message-form')?.getAttribute('aria-busy') === 'true';
    return !busy && text && text !== 'Your Sparkle message will appear here.';
  }, null, { timeout: 12 * 60 * 1000 });

  const output = (await page.locator('#result').textContent() || '').trim();
  const errorVisible = await page.locator('#ai-error').isVisible();
  const errorText = errorVisible ? (await page.locator('#ai-error-message').textContent() || '').trim() : '';
  console.log(`SPARKLE_MOBILE_OUTPUT ${JSON.stringify(output)}`);
  if (errorText) console.log(`SPARKLE_MOBILE_ERROR ${JSON.stringify(errorText)}`);

  assert(!errorVisible, `Sparkle Mobile showed an error: ${errorText}`);
  assert(/3\s*PM/i.test(output), `Sparkle Mobile lost the available time: ${output}`);
  assert(/2\s*PM/i.test(output), `Sparkle Mobile lost the unavailable time: ${output}`);
  assert(/(?:cannot|can't|can’t|not|unable|unavailable)/i.test(output), `Sparkle Mobile lost the refusal: ${output}`);
  assert(/Brandon/i.test(output), `Sparkle Mobile lost the recipient: ${output}`);

  const relevantErrors = browserErrors.filter((line) => !/favicon|googletagmanager|google-analytics/i.test(line));
  assert(relevantErrors.length === 0, `Browser errors detected:\n${relevantErrors.join('\n')}`);
  console.log('SPARKLE_MOBILE_GENERATION_PASS');
} catch (error) {
  console.error('SPARKLE_MOBILE_GENERATION_FAIL');
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
