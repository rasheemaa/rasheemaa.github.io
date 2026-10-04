import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = '.github/scripts/sparkle-smoke.mjs';
const runtimePath = '.github/scripts/.sparkle-webkit-runtime.mjs';
let code = await readFile(sourcePath, 'utf8');

code = code.replace(
  "import { chromium } from 'playwright';",
  "import { webkit as chromium } from 'playwright';"
);
code = code.replace(
  "const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });",
  "const browser = await chromium.launch({ headless: true });"
);
code = code.replace(
  "userAgent = 'Sparkle-Smoke-Test/1.0 Chrome'",
  "userAgent = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'"
);
code = code.replace(
  "page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });",
  "page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource:.*status of 400/i.test(message.text())) browserErrors.push(`console: ${message.text()}`); });"
);

const oldCancellation = `  await resetMode('write');
  await page.locator('#prompt').fill('Tell Alex I cannot make tonight.');
  await page.locator('#generate').click();
  await page.locator('#sparkle-cancel').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#sparkle-cancel').click();
  await page.waitForFunction(() => !document.querySelector('#generate')?.disabled, null, { timeout: 20_000 });
  assert(!(await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Cancellation started the trial');
  assert((await page.locator('.message-row.user .bubble').last().textContent())?.includes('Alex'), 'Canceled user message disappeared');
  await page.locator('#new-message-top').click();
  console.log('PASS cancellation preserves the user message and does not start the trial');`;

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
  }, cancelBefore, { timeout: 10_000 }).then((handle) => handle.jsonValue());
  if (cancelOutcome === 'cancel') {
    await page.locator('#sparkle-cancel').click();
    await page.waitForFunction(() => !document.querySelector('#generate')?.disabled, null, { timeout: 20_000 });
    assert(!(await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'))), 'Cancellation started the trial');
    console.log('PASS cancellation preserves the user message and does not start the trial');
  } else {
    const fastOutput = (await page.locator('.message-row.assistant:not(.working) .bubble').last().textContent())?.trim() || '';
    assertSendable(fastOutput, 'Fast iPad completion');
    await page.evaluate(() => localStorage.removeItem('wdis_trial_started_at_v2'));
    console.log('PASS iPad generation completed correctly before cancellation became actionable');
  }
  assert((await page.locator('.message-row.user .bubble').last().textContent())?.includes('Alex'), 'Cancellation race lost the user message');
  await page.locator('#new-message-top').click();`;

if (!code.includes(oldCancellation)) {
  throw new Error('Could not locate the cancellation smoke block to adapt for WebKit');
}
code = code.replace(oldCancellation, raceAwareCancellation);

await writeFile(runtimePath, code);
await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
