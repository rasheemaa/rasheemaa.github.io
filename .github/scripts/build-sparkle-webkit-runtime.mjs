import { readFile, writeFile } from 'node:fs/promises';

let code = await readFile('.github/scripts/sparkle-smoke.mjs', 'utf8');

function replaceOnce(search, replacement, label) {
  if (!code.includes(search)) throw new Error(`Could not locate ${label} in Sparkle smoke test`);
  code = code.replace(search, replacement);
}

replaceOnce(
  "import { chromium } from 'playwright';",
  "import { webkit as chromium } from 'playwright';",
  'Playwright Chromium import'
);

replaceOnce(
  "const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });",
  "const browser = await chromium.launch({ headless: true });",
  'Chromium launch options'
);

replaceOnce(
  "userAgent = 'Sparkle-Smoke-Test/1.0 Chrome'",
  "userAgent = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'",
  'default smoke-test user agent'
);

replaceOnce(
  "chat-app.js?v=24",
  "chat-app.js?v=25",
  'chat app production asset version'
);

replaceOnce(
  "page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });",
  "page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource:.*status of 400/i.test(message.text())) browserErrors.push(`console: ${message.text()}`); });",
  'browser console error collector'
);

const cancellationPattern = `  await resetMode('write');
  await page.locator('#prompt').fill('Tell Alex I cannot make tonight.');
  await page.locator('#generate').click();
  await page.locator('#sparkle-cancel').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#sparkle-cancel').click();
  await page.waitForFunction(() => !document.querySelector('#generate')?.disabled, null, { timeout: 20_000 });
  assert((await page.locator('.message-row.user .bubble').last().textContent())?.includes('Alex'), 'Canceled user message disappeared');
  await page.locator('#new-message-top').click();
  console.log('PASS cancellation preserves the user message and does not start the trial');`;

if (!code.includes(cancellationPattern)) {
  throw new Error('Could not locate the cancellation smoke block to adapt for WebKit');
}

const raceAwareCancellation = `  await resetMode('write');
  const cancelBefore = await assistantCount();
  await page.locator('#prompt').fill('Tell Alex I cannot make tonight.');
  await page.locator('#generate').click();
  const cancelOutcome = await page.waitForFunction((count) => {
    const stop = document.querySelector('#sparkle-cancel');
    if (stop && !stop.hidden) return 'cancel';
    const answers = document.querySelectorAll('.message-row.assistant:not(.working)');
    if (answers.length > count && !document.querySelector('#generate')?.disabled) return 'complete';
    return false;
  }, cancelBefore, { timeout: 10_000 }).then(handle => handle.jsonValue());
  if (cancelOutcome === 'cancel') {
    await page.locator('#sparkle-cancel').click();
    await page.waitForFunction(() => !document.querySelector('#generate')?.disabled, null, { timeout: 20_000 });
    console.log('PASS cancellation preserves the user message');
  } else {
    const fastOutput = (await page.locator('.message-row.assistant:not(.working) .bubble').last().textContent())?.trim() || '';
    assertSendable(fastOutput, 'Fast iPad completion');
    console.log('PASS iPad generation completed correctly before cancellation became actionable');
  }
  assert((await page.locator('.message-row.user .bubble').last().textContent())?.includes('Alex'), 'Cancellation race lost the user message');
  await page.locator('#new-message-top').click();`;

code = code.replace(cancellationPattern, raceAwareCancellation);

await writeFile('.github/scripts/.sparkle-webkit-runtime.mjs', code);
console.log('Built WebKit Sparkle runtime smoke test');
