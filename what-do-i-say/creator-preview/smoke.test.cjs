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
  const http = require('node:http');
  const { chromium } = require('playwright');
  const siteRoot = path.resolve(root, '../..');
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
  const server = http.createServer((req,res)=>{
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(siteRoot,'.'+pathname);
    if (!file.startsWith(siteRoot+path.sep)) {res.writeHead(403).end();return;}
    fs.readFile(file,(err,body)=>{
      if(err){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'});
      res.end(body);
    });
  });
  (async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser = await chromium.launch({headless:true});
    try {
      const page = await browser.newPage({viewport:{width:390,height:844}});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port+'/what-do-i-say/creator-preview/');
      await page.locator('#idea').fill('A relatable video about boundaries');
      await page.locator('#make').click();
      assert.match(await page.locator('#output').innerText(),/STARTER FRAMEWORK/);
      await page.locator('#edit-draft').click();
      await page.locator('#draft-editor').fill('Keep this draft');
      await page.locator('#apply-draft').click();
      assert.equal(await page.locator('#output').innerText(),'Keep this draft');
      await page.locator('#idea').fill('');
      await page.locator('#make').click();
      assert.equal(await page.locator('#output').innerText(),'Keep this draft','Blank brief must preserve existing work');
      assert.match(await page.locator('#output-status').innerText(),/Describe your idea/);
      assert.deepEqual(errors,[],'Browser must not raise script errors');
      console.log('Creator Studio mobile browser interactions passed.');
    } finally {await browser.close();}
  })().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
}
