// Run with: node what-do-i-say/creator-preview/smoke.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile.js'), 'utf8');
const projects = fs.readFileSync(path.join(root, 'projects.js'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'ai.js'), 'utf8');
const drafts = fs.readFileSync(path.join(root, 'drafts.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, '..', 'chat-app.js'), 'utf8');
for (const id of ['task', 'idea', 'tone', 'audience', 'project', 'project-search', 'saved', 'save', 'new-project', 'load', 'delete', 'clear', 'creator-name', 'creator-niche', 'creator-style', 'creator-avoid', 'profile-save', 'profile-clear', 'sparkle', 'copy-prompt', 'copy-status']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing control: ' + id);
}
assert.match(html, /noindex,nofollow/);
assert.match(html, /class="skip-link" href="#creator-workspace"/);
assert.match(html, /id="creator-workspace" tabindex="-1"/);
assert.match(html, /role="region" aria-label="Generated creative brief"/);
assert.match(html, /aria-atomic="true"/);
assert.match(html, /@media\(max-width:560px\)/);
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(html, /min-height:46px/);
assert.ok(html.indexOf('creator-preview/profile.js?v=1') < html.indexOf('const updateBriefLength='), 'Creator Brain must initialize before the handoff meter');
assert.match(html, /document.getElementById\('sparkle'\)\.disabled=!length\|\|length>3500/);
assert.match(html, /v\.length>3500/);
assert.match(html, /text\.length>3500/);
assert.match(html, /Clipboard unavailable\. Instructions are displayed above/);
assert.match(html, /sessionStorage\.setItem\('sparkle_creator_handoff_v1'/);
assert.match(html, /sessionStorage\.removeItem\('sparkle_creator_handoff_v1'\)/);
assert.match(html, /Could not open Sparkle automatically/);
assert.match(chat, /sessionStorage\.removeItem\('sparkle_creator_handoff_v1'/);
assert.match(chat, /Date\.now\(\) - handoff\.created < 300000/);
assert.match(profile, /localStorage\.removeItem\(KEY\)/);
assert.match(projects, /localStorage\.removeItem\(KEY\)/);
assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|buy\.stripe\.com/);
assert.match(html, /id="generate-ai"/);
for (const id of ['edit-draft','draft-editor','apply-draft']) assert.match(html,new RegExp('id="'+id+'"'));
assert.match(html, /editor\.hidden\?output\.textContent:editor\.value/);
assert.match(ai, /SparkleCreatorDrafts\.confirmReplace/);
assert.match(html, /id="ai-status" role="status"/);
assert.match(html, /creator-preview\/ai\.js\?v=1/);
assert.match(html, /what-do-i-say\/config\.js/);
assert.match(ai, /\/api\/creator\/generate/);
assert.match(ai, /credentials:'omit'/);
assert.match(ai, /method:'POST'/);
assert.match(ai, /AbortController/);
assert.match(ai, /output\.textContent = previous/);
assert.match(ai, /allowedTasks/);
assert.match(ai, /previousEditor/);
assert.match(ai, /editor\.value = previousEditor/);
assert.match(ai, /response\.status === 429/);
assert.match(ai, /response\.status >= 500/);
assert.doesNotMatch(ai, /throw new Error\(typeof result\?\.error/);
for (const id of ['save-output','clear-output','output-status']) assert.match(html,new RegExp('id="'+id+'"'));
assert.match(html, /creator-preview\/drafts\.js\?v=1/);
assert.match(drafts, /localStorage\.setItem\(KEY/);
assert.match(drafts, /localStorage\.removeItem\(KEY/);
assert.match(drafts, /MAX_AGE/);
assert.match(drafts, /confirmReplace/);
assert.match(drafts, /beforeunload/);
assert.match(drafts, /hasUnsavedOutput/);
assert.match(ai, /SparkleCreatorDrafts\.confirmReplace/);
assert.match(html, /SparkleCreatorDrafts\.confirmReplace/);
assert.match(html, /Describe your idea before replacing the current draft/);
assert.match(html, /editor\.hidden=true;document\.getElementById\('draft-editor-label'\)\.hidden=true/);
assert.match(drafts, /window\.confirm/);
console.log('Creator Studio static checks passed.');

if (process.env.CREATOR_BROWSER_TEST === '1') {
  (async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless:true });
    try {
      for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('dialog',dialog => dialog.accept());
        await page.route('**/what-do-i-say/config.js', route => route.fulfill({
          status:200,contentType:'application/javascript',
          body:"window.WDIS_API_BASE='https://creator-test.invalid';"
        }));
        let sent;
        await page.route('https://creator-test.invalid/api/creator/generate',async route => {
          sent=route.request().postDataJSON();
          await route.fulfill({status:200,contentType:'application/json',
            headers:{'access-control-allow-origin':'*'},
            body:JSON.stringify({task:sent.task,output:'Browser verified draft'})});
        });
        await page.goto('http://127.0.0.1:8765/what-do-i-say/creator-preview/',{waitUntil:'load'});
        await page.locator('#idea').fill('A creator browser test');
        await page.locator('#make').click();
        assert.match(await page.locator('#output').innerText(),/A creator browser test/);
        await page.locator('#edit-draft').click();
        await page.locator('#draft-editor').fill('Edited browser draft');
        await page.locator('#apply-draft').click();
        assert.equal(await page.locator('#output').innerText(),'Edited browser draft');
        await page.locator('#idea').fill('');
        await page.locator('#make').click();
        assert.equal(await page.locator('#output').innerText(),'Edited browser draft');
        await page.locator('#idea').fill('A creator browser test');
        await page.locator('#project').fill('Browser project');
        await page.locator('#save').click();
        assert.match(await page.locator('#save-status').innerText(),/saved on this device/);
        await page.locator('#generate-ai').click();
        await page.locator('#ai-status').getByText(/AI draft ready/).waitFor();
        assert.equal(sent.idea,'A creator browser test');
        assert.equal(await page.locator('#output').innerText(),'Browser verified draft');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true,'Mobile horizontal overflow');
        await context.close();
      }
    } finally { await browser.close(); }
    console.log('Creator desktop and mobile browser checks passed.');
  })().catch(error => {console.error(error);process.exitCode=1;});
}
