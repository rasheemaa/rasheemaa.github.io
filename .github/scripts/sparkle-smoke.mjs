import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = [
    'what-do-i-say/chat-app.js',
    'what-do-i-say/sparkle.js',
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
const RESULT_TIMEOUT = 12 * 60 * 1000;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Sparkle-Smoke-Test/1.0 Chrome' });

await context.addInitScript(() => {
  try {
    localStorage.removeItem('wdis_trial_started_at_v2');
    localStorage.removeItem('wdis_founder_session_v1');
    localStorage.removeItem('wdis_pending_founder_session_v1');
    localStorage.setItem('wdis_sparkle_profile_v1', JSON.stringify({ profile: 'Sparkle Compatible', backend: 'wasm', at: Date.now() }));
  } catch {}
});

const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });

function assert(condition, message) { if (!condition) throw new Error(message); }
function has(text, pattern) { return pattern.test(String(text || '')); }
function assertSendable(output, label) {
  const text = String(output || '').trim();
  assert(text.length >= 8, `${label} is too short`);
  assert(text.length <= 1600, `${label} is too long`);
  assert(!/^(?:here(?:'s| is)|rewritten message|revised message|message:|response:)/i.test(text), `${label} starts with meta commentary`);
  assert(!/<\/?think>|<\|/i.test(text), `${label} leaked model markup`);
}

async function assistantCount() { return page.locator('.message-row.assistant:not(.working)').count(); }
async function waitForAnswer(before) {
  await page.waitForFunction((count) => {
    const error = document.querySelector('#ai-error');
    if (error && !error.hidden) return true;
    return document.querySelectorAll('.message-row.assistant:not(.working)').length > count && !document.querySelector('#generate')?.disabled;
  }, before, { timeout: RESULT_TIMEOUT });
  const errorVisible = await page.locator('#ai-error').evaluate(node => !node.hidden);
  if (errorVisible) throw new Error(`Sparkle UI error: ${(await page.locator('#ai-error-message').textContent()) || 'unknown error'}`);
  return (await page.locator('.message-row.assistant:not(.working) .bubble').last().textContent())?.trim() || '';
}

async function send(text) {
  const before = await assistantCount();
  await page.locator('#prompt').fill(text);
  await page.locator('#generate').click();
  const output = await waitForAnswer(before);
  assertSendable(output, 'Sparkle answer');
  return output;
}

async function resetMode(mode) {
  if (await page.locator('#new-message-top').isVisible()) await page.locator('#new-message-top').click();
  await page.locator(`[data-mode="${mode}"]`).click();
}

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const assets = await page.evaluate(() => [...document.scripts].map(script => script.getAttribute('src') || ''));
  assert(assets.some(src => src.includes('sparkle.js?v=22')), 'Production is not loading sparkle.js?v=22');
  assert(assets.some(src => src.includes('chat-app.js?v=23')), 'Production is not loading chat-app.js?v=23');

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
  console.log('PASS compact chat-first mobile layout');

  const trialBefore = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(!trialBefore, 'Trial started before the first successful response');

  await resetMode('write');
  const write = await send('Tell Jordan I cannot make dinner Friday at 7 PM because I am exhausted, but I can see her Saturday at 2 PM instead.');
  assert(has(write, /Jordan/i), 'Write lost Jordan');
  assert(has(write, /Friday/i) && has(write, /7\s*PM/i), 'Write lost Friday 7 PM');
  assert(has(write, /Saturday/i) && has(write, /2\s*PM/i), 'Write lost Saturday 2 PM');
  assert(await page.locator('#new-message-top').isVisible(), 'New message control did not appear');
  const trialAfter = await page.evaluate(() => localStorage.getItem('wdis_trial_started_at_v2'));
  assert(Boolean(trialAfter), 'Trial did not start after the first successful response');

  const latest = page.locator('.message-row.assistant:not(.working)').last();
  const actionTexts = await latest.locator('.response-actions > button').allTextContents();
  assert(actionTexts[0]?.includes('Just right'), `First response action is not Just right: ${actionTexts}`);
  assert(actionTexts[1]?.includes('More options'), `Second response action is not More options: ${actionTexts}`);
  await latest.locator('.more-options').click();
  assert(await latest.locator('.refine-options').isVisible(), 'More options did not expand');
  console.log('PASS Just right first, More options second');

  let before = await assistantCount();
  await latest.locator('.refine-options button').filter({ hasText: 'Make it firmer' }).click();
  const firmer = await waitForAnswer(before);
  assertSendable(firmer, 'firmer');
  assert(has(firmer, /Friday/i) && has(firmer, /Saturday/i), 'Firmer refinement lost schedule details');
  console.log('PASS quick refinement stays in the chat');

  before = await assistantCount();
  await page.locator('#prompt').fill('Make it less apologetic, but keep both dates and times.');
  await page.locator('#generate').click();
  const custom = await waitForAnswer(before);
  assertSendable(custom, 'typed refinement');
  assert(has(custom, /Friday/i) && has(custom, /7\s*PM/i), 'Typed refinement lost Friday 7 PM');
  assert(has(custom, /Saturday/i) && has(custom, /2\s*PM/i), 'Typed refinement lost Saturday 2 PM');
  const userBubbles = await page.locator('.message-row.user .bubble').allTextContents();
  assert(userBubbles.some(text => text.includes('Make it less apologetic')), 'Typed refinement did not appear as a user chat bubble');
  console.log('PASS typed back-and-forth refinement');

  await resetMode('reply');
  const reply = await send('They said: “Are you mad at me?” I want to say I am not mad at them, I have just been overwhelmed and need a quiet night.');
  assertSendable(reply, 'reply');
  assert(!/^you(?:'re| are) not mad at me/i.test(reply), 'Reply reversed the speaker perspective');
  console.log('PASS reply mode');

  await resetMode('fix');
  const fixed = await send('hi maya i cant meet friday at 4 PM. i can meet saturday at 10 AM.');
  assertSendable(fixed, 'fix');
  assert(has(fixed, /Maya/i), 'Fix lost Maya');
  assert(has(fixed, /Friday/i) && has(fixed, /4\s*PM/i), 'Fix lost Friday 4 PM');
  assert(has(fixed, /Saturday/i) && has(fixed, /10\s*AM/i), 'Fix lost Saturday 10 AM');
  console.log('PASS fix mode');

  assert(browserErrors.length === 0, `Browser errors: ${browserErrors.join(' | ')}`);
  console.log('PASS What Do I Say chat production smoke test');
} finally {
  await browser.close();
}
