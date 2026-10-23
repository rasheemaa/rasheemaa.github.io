import { webkit } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = [
    'what-do-i-say/bootstrap.js',
    'what-do-i-say/sparkle-mobile-safe-worker.js'
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
const modelRequests = [];
const safeWorkerRequests = [];
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('request', (request) => {
  const url = request.url();
  if (/huggingface\.co|hf\.co|cdn-lfs\.huggingface\.co/i.test(url)) modelRequests.push(url);
  if (/sparkle-mobile-safe-worker\.js/i.test(url)) safeWorkerRequests.push(url);
});

async function assistantCount() {
  return page.locator('.message-row.assistant:not(.working)').count();
}

async function generateAndAssert(promptText, availableTime, unavailableTime) {
  const before = await assistantCount();
  await page.locator('#prompt').fill(promptText);
  await page.locator('#generate').click();
  await page.waitForFunction((count) => {
    const error = document.querySelector('#ai-error');
    if (error && !error.hidden) return true;
    const answers = document.querySelectorAll('.message-row.assistant:not(.working)');
    return answers.length > count && !document.querySelector('#generate')?.disabled;
  }, before, { timeout: 30_000 });

  const errorVisible = await page.locator('#ai-error').evaluate((node) => !node.hidden);
  const errorText = errorVisible ? (await page.locator('#ai-error-message').textContent() || '').trim() : '';
  if (errorText) console.log(`SPARKLE_MOBILE_ERROR ${JSON.stringify(errorText)}`);
  assert(!errorVisible, `Sparkle Mobile showed an error: ${errorText}`);

  const output = (await page.locator('.message-row.assistant:not(.working) .bubble').last().textContent() || '').trim();
  console.log(`SPARKLE_MOBILE_OUTPUT ${JSON.stringify(output)}`);
  assert(output.length >= 8, `Sparkle Mobile returned an empty or tiny answer: ${output}`);
  assert(new RegExp(availableTime.replace(' ', '\\s*'), 'i').test(output), `Sparkle Mobile lost the available time: ${output}`);
  assert(new RegExp(unavailableTime.replace(' ', '\\s*'), 'i').test(output), `Sparkle Mobile lost the unavailable time: ${output}`);
  assert(/(?:cannot|can't|can’t|not|unable|unavailable)/i.test(output), `Sparkle Mobile lost the refusal: ${output}`);
  assert(/Brandon/i.test(output), `Sparkle Mobile lost the recipient: ${output}`);
  return output;
}

try {
  await page.goto(`https://thesheemaedit.com/what-do-i-say/?sparkle_mobile=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const mobileState = await page.evaluate(() => ({
    routed: window.__WDIS_MOBILE_SPARKLE === true,
    safe: window.__WDIS_MOBILE_SAFE_MODE === true,
    nativeWorker: window.__WDIS_MOBILE_NATIVE_WORKER === true
  }));
  assert(mobileState.routed, 'iPad Safari identity was not routed to Sparkle Mobile');
  assert(mobileState.safe, 'iPad Safari crash-safe mode was not enabled');
  assert(mobileState.nativeWorker, 'iPad Safari native safe worker mode was not enabled');
  console.log('PASS iPad Safari identity routes to native crash-safe Sparkle Mobile');

  await generateAndAssert('Tell Brandon I can meet tomorrow at 3 PM but I cannot make 2 PM', '3 PM', '2 PM');
  await page.waitForTimeout(3_000);
  await generateAndAssert('Tell Brandon I can meet tomorrow at 4 PM but I cannot make 1 PM', '4 PM', '1 PM');

  assert(safeWorkerRequests.length >= 1, 'iPad safe worker was never requested');
  assert(modelRequests.length === 0, `iPad safe mode unexpectedly requested an AI model: ${modelRequests.join(', ')}`);
  console.log('PASS iPad safe mode stays on the tiny local worker and does not load the crashing browser model');

  await page.waitForTimeout(10_000);
  assert(!page.isClosed(), 'WebKit page closed after generation');

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
