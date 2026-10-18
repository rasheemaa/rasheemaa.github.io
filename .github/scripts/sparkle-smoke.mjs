import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const url = 'https://thesheemaedit.com/what-do-i-say/';
const isWebKit = process.argv[2] === 'webkit';
const engine = isWebKit ? webkit : chromium;
const expectedController = readFileSync('what-do-i-say/chat-app.js','utf8').trim();
let deployed = false;
for (let i = 0; i < 35; i++) {
  try {
    const response = await fetch(url + '?smoke=' + Date.now(), {cache:'no-store'});
    const html = response.ok ? await response.text() : '';
    const scriptResponse = await fetch(url + 'chat-app.js?smoke=' + Date.now(), {cache:'no-store'});
    const controller = scriptResponse.ok ? (await scriptResponse.text()).trim() : '';
    if (html.includes('chat-app.js?v=30') && controller === expectedController && !/data-mode=|class="mode-tabs"|id="paywall"/.test(html)) {
      deployed = true; break;
    }
  } catch {}
  if (i < 34) await new Promise(resolve => setTimeout(resolve, 5000));
}
assert(deployed, 'The one-input Sparkle page has not reached production');
const browser = await engine.launch({headless:true});
const agent = isWebKit
  ? 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function test(cloud) {
  const context = await browser.newContext({userAgent:agent,viewport:{width:390,height:844},serviceWorkers:'block'});
  const fake = "window.__calls=[];window.Sparkle=Object.freeze({generate:async function(p){window.__calls.push(p);return \"Hi Jordan, I can't make Friday at 7 PM, but I can meet Saturday at 2 PM.\";},cancel:function(){}});";
  await context.route('**/what-do-i-say/sparkle.js*', route => route.fulfill({status:200,contentType:'application/javascript',body:fake}));
  await context.route('**/what-do-i-say/sparkle-cloud-mobile.js*', route => route.fulfill({status:200,contentType:'application/javascript',body:cloud ? 'window.__WDIS_MOBILE_CLOUD_SPARKLE=true;' : ''}));
  await context.route('**/what-do-i-say/sparkle-quality-hotfix.js*', route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
  await context.route('**/what-do-i-say/sparkle-first-draft-polish.js*', route => route.fulfill({status:200,contentType:'application/javascript',body:''}));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(await page.locator('.mode,[data-mode],.mode-tabs').count(),0);
    assert.equal(await page.locator('#paywall').count(),0);
    assert.match(await page.locator('#trial-status').textContent(),/Free for everyone/i);
    for (const [input,intent] of [
      ['Tell Jordan I cannot make Friday.','write'],
      ['They said: Are you mad? I want to say I need a quiet night.','reply'],
      ['Fix this message: hey i cant do Friday.','fix'],
      ['Can you loan me a dollar?','write']
    ]) {
      await page.locator('#prompt').fill(input);
      await page.locator('#generate').click();
      try {
        await page.waitForFunction(() => window.__calls?.length > 0 && !document.querySelector('#generate')?.disabled,null,{timeout:15000});
      } catch (error) {
        const details = await page.evaluate(() => ({calls:window.__calls?.length ?? null,loaded:Boolean(window.Sparkle?.generate),error:document.querySelector('#ai-error-message')?.textContent || '',disabled:document.querySelector('#generate')?.disabled}));
        throw new Error('Sparkle browser test failed: '+JSON.stringify({input,details,errors,original:String(error)}));
      }
      assert.equal(await page.evaluate(() => window.__calls.at(-1).mode),cloud?'auto':intent,input);
      await page.locator('.message-row.assistant:not(.working) .bubble').last().waitFor();
      await page.locator('#new-message-top').click();
      await page.evaluate(() => {window.__calls=[];});
    }
    await page.locator('#prompt').fill('Tell Jordan I cannot make Friday.');
    await page.locator('#generate').click();
    await page.waitForFunction(() => window.__calls.length === 1 && !document.querySelector('#generate')?.disabled,null,{timeout:15000});
    await page.locator('.message-row.assistant:not(.working) .more-options').last().click();
    await page.locator('.message-row.assistant:not(.working) .refine-options button').filter({hasText:'Make it softer'}).last().click();
    await page.waitForFunction(() => window.__calls.length === 2 && !document.querySelector('#generate')?.disabled,null,{timeout:15000});
    assert.equal(await page.evaluate(() => window.__calls.at(-1).refine),'softer');
    assert.deepEqual(errors,[]);
    console.log('PASS '+(isWebKit?'iPad WebKit':'Chromium')+' '+(cloud?'auto intent':'desktop inference')+': single composer, all requests, refinement, no gate');
  } finally { await context.close(); }
}
try { await test(isWebKit); if (!isWebKit) await test(true); }
finally { await browser.close(); }