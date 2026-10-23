// One static server and one browser harness serve the same Creator Studio sources.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'creator.css'),'utf8');
const ai=fs.readFileSync(path.join(root,'ai.js'),'utf8');
const profile=fs.readFileSync(path.join(root,'profile.js'),'utf8');
const projects=fs.readFileSync(path.join(root,'projects.js'),'utf8');
const drafts=fs.readFileSync(path.join(root,'drafts.js'),'utf8');
const chat=fs.readFileSync(path.join(root,'../chat-app.js'),'utf8');
for(const id of ['task','idea','tone','audience','project','project-search','saved','save','new-project','load','delete','clear','export-projects','creator-name','creator-niche','creator-style','creator-avoid','profile-save','profile-clear','sparkle','copy-prompt','copy-status','edit-draft','draft-editor','apply-draft','generate-ai','cancel-ai','ai-status','save-output','clear-output','output-status','manual-copy']){
 assert.match(html,new RegExp('id="'+id+'"'),'Missing control: '+id);
}
assert.match(html,/noindex,nofollow/);
assert.match(html,/class="skip-link" href="#creator-workspace"/);
assert.match(html,/id="creator-workspace" tabindex="-1"/);
assert.match(html,/role="region" aria-label="Generated creative brief"/);
assert.match(html,/aria-atomic="true"/);
assert.match(css,/@media\(max-width:560px\)/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/min-height:46px/);
for(const color of ['#faf5f0','#39203a','#9c3a6e','#704b96','#f6d5e5','#e9ddf7'])assert(css.includes(color),'Approved site color missing');
assert.match(html,/default-src 'self'/);
assert.match(html,/object-src 'none'/);
assert.match(html,/form-action 'none'/);
assert.doesNotMatch(html,/unsafe-inline|unsafe-eval|\son(?:click|load|error|submit|focus)\s*=/i);
for(const tag of html.match(/<script\b[^>]*>/gi)||[])assert.match(tag,/\bsrc=/,'Executable code must be in a CSP-protected local file');
assert.match(html,/creator-preview\/config.js\?v=2/);
assert.match(html,/creator-preview\/profile.js\?v=2/);
assert.match(html,/creator-preview\/drafts.js\?v=2/);
assert.match(app,/const updateBriefLength=/);
assert.match(app,/document.getElementById\('sparkle'\)\.disabled=!length\|\|length>3500/);
assert.match(app,/v\.length>3500/);
assert.match(app,/text\.length>3500/);
assert.match(app,/Clipboard unavailable\. Instructions are displayed below/);
assert.match(app,/sessionStorage\.setItem\('sparkle_creator_handoff_v1'/);
assert.match(app,/sessionStorage\.removeItem\('sparkle_creator_handoff_v1'\)/);
assert.match(app,/Could not open Sparkle automatically/);
assert.match(chat,/sessionStorage\.removeItem\('sparkle_creator_handoff_v1'/);
assert.match(chat,/Date\.now\(\) - handoff\.created < 300000/);
assert.match(profile,/localStorage\.removeItem\(KEY\)/);
assert.match(projects,/localStorage\.removeItem\(KEY\)/);
assert.match(projects,/editingVersion/);
assert.match(projects,/draft: window\.SparkleCreatorDrafts/);
assert.match(projects,/stored data was left untouched/);
assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|buy\.stripe\.com/);
assert.match(app,/editor\.hidden\?output\.textContent:editor\.value/);
assert.match(ai,/SparkleCreatorDrafts\.confirmReplace/);
assert.match(html,/id="ai-status" class="status" role="status"/);
assert.match(ai,/\/api\/creator\/generate/);
assert.match(ai,/credentials: 'omit'/);
assert.match(ai,/redirect: 'error'/);
assert.match(ai,/method: 'POST'/);
assert.match(ai,/AbortController/);
assert.match(ai,/snapshot\(\) !== pending\.snapshot/);
assert.match(ai,/active !== pending/);
assert.match(ai,/allowedTasks/);
assert.match(ai,/response\.status === 429/);
assert.match(ai,/response\.status >= 500/);
assert.doesNotMatch(ai,/throw new Error\(typeof result\?\.error/);
assert.match(drafts,/localStorage\.setItem\(KEY/);
assert.match(drafts,/localStorage\.removeItem\(KEY/);
assert.match(drafts,/RECOVERY_KEY/);
assert.match(drafts,/confirmReplace/);
assert.match(drafts,/beforeunload/);
assert.match(drafts,/hasUnsavedOutput/);
assert.match(app,/SparkleCreatorDrafts\.confirmReplace/);
assert.match(app,/Describe your idea before replacing the current draft/);
assert.match(drafts,/window\.confirm/);
console.log('Creator Studio static checks passed: controls, CSP, design tokens and data protections.');

if(process.env.CREATOR_BROWSER_TEST==='1'){
 const http=require('node:http');
 const {chromium,webkit}=require('playwright');
 const AxeBuilder=require('@axe-core/playwright').default;
 const siteRoot=path.resolve(root,'../..');
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mjs':'text/javascript; charset=utf-8'};
 const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(siteRoot,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,body)=>{
   if(err){res.writeHead(404).end();return;}
   if(path.extname(file)==='.html')body=Buffer.from(body.toString().replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''));
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  });
 });
 (async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const api='https://sparkle.rasheema-abdullah.workers.dev/api/creator/generate';
  const outputDir=path.join(siteRoot,'.github/reports/creator-studio');
  fs.mkdirSync(outputDir,{recursive:true});
  const report={revision:process.env.GITHUB_SHA||null,kind:'Simulated browsers and deterministic API responses; not physical iPhone or live inference',results:[],screenshots:[]};
  let count=0;
  for(const [engine,runtime] of [['chromium',chromium],['webkit',webkit]]){
   const browser=await runtime.launch({headless:true});
   try{
    for(const width of [360,375,390,430,1280,1440]){
     const phone=width<761;
     const context=await browser.newContext({viewport:{width,height:844},isMobile:phone,hasTouch:phone,serviceWorkers:'block',acceptDownloads:true});
     const page=await context.newPage();page.setDefaultTimeout(12000);
     try{
     let acceptDialogs=true,apiCalls=0,mode='ok',lastPayload;
     const errors=[],requests=[];
     page.on('pageerror',e=>errors.push(e.message));
     page.on('dialog',dialog=>acceptDialogs?dialog.accept():dialog.dismiss());
     await context.route('**/creator-preview/config.js?*',route=>route.fulfill({status:200,contentType:'text/javascript',body:"window.SPARKLE_CREATOR_API_READY=true;window.SPARKLE_CREATOR_API_BASE='https://sparkle.rasheema-abdullah.workers.dev';"}));
     await context.route(api,async route=>{
      if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});return;}
      apiCalls++;lastPayload=JSON.parse(route.request().postData());requests.push(lastPayload);
      if(mode==='offline'){await route.abort('failed');return;}
      const status=mode==='quota'?429:mode==='error'?503:200;
      const output=mode==='html'?'<img src=x onerror=alert(1)> Plain draft':'Draft for '+lastPayload.task+'\nA useful outline to edit.';
      await route.fulfill({status,headers:{'Access-Control-Allow-Origin':origin,'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(status===200?{task:lastPayload.task,output}:{error:'PRIVATE PROVIDER TRACE'})});
     });
     const response=await page.goto(origin+'/what-do-i-say/creator-preview/');
     assert.equal(response.status(),200);
     await page.evaluate(()=>document.fonts.ready);
     await page.keyboard.press('Tab');
     assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');
     await page.keyboard.press('Enter');
     assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-workspace');
     const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,h1:document.querySelectorAll('h1').length,background:getComputedStyle(document.body).backgroundColor}));
     assert(layout.scrollWidth<=width+1,'Horizontal overflow at '+engine+' '+width);
     assert.equal(layout.h1,1);assert.equal(layout.background,'rgb(250, 245, 240)');
     const targets=await page.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(nodes=>nodes.map(node=>({id:node.id,height:node.getBoundingClientRect().height})));
     assert(targets.every(target=>target.height>=44),'Small touch target: '+JSON.stringify(targets.filter(t=>t.height<44)));
     const tasks=['content','growth','reply','sell','deal','pdf','performance'];
     for(const task of tasks){
      await page.locator('#task').selectOption(task);
      await page.locator('#idea').fill(task==='performance'?'Last week: 1000 views, 90 likes, 15 saves, 4 shares. Suggest an experiment.':'An original creator idea for '+task);
      await page.locator('#generate-ai').click();
      await page.waitForFunction(task=>document.getElementById('output').textContent.startsWith('Draft for '+task),task);
      assert.equal(lastPayload.task,task);count++;
     }
     const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
     assert.deepEqual(axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],'Accessibility violations at '+engine+' '+width);
     if(width===390||width===1440){
      await page.locator('.profile-panel summary').click();
      await page.locator('#creator-name').fill('Test Creator');
      await page.locator('#creator-style').fill('Original and conversational');
      await page.locator('#creator-avoid').fill('Do not invent my experiences');
      await page.locator('#profile-save').click();
      assert.match(await page.locator('#profile-status').innerText(),/saved/);
      await page.locator('.profile-panel summary').click();
      await page.locator('#idea').fill('A relatable video about boundaries');
      await page.locator('#make').click();
      assert.match(await page.locator('#output').innerText(),/STARTER FRAMEWORK/);
      await page.locator('#edit-draft').click();await page.locator('#draft-editor').fill('Keep this edited project draft');await page.locator('#apply-draft').click();
      await page.locator('#project').fill('First idea');await page.locator('#save').click();
      const first=await page.locator('#saved').inputValue();
      await page.locator('#new-project').click();
      await page.locator('#idea').fill('Another idea');await page.locator('#project').fill('Second idea');await page.locator('#make').click();await page.locator('#save').click();
      await page.locator('#project-search').fill('First');assert.equal(await page.locator('#saved option').count(),2);
      await page.locator('#saved').selectOption(first);await page.locator('#load').click();
      assert.equal(await page.locator('#output').innerText(),'Keep this edited project draft');
      await page.locator('#edit-draft').click();await page.locator('#draft-editor').fill('Do not discard this edit');
      acceptDialogs=false;await page.locator('#new-project').click();
      assert.equal(await page.locator('#draft-editor').inputValue(),'Do not discard this edit');acceptDialogs=true;
      await page.locator('#apply-draft').click();await page.locator('#save-output').click();
      await page.reload();assert.equal(await page.locator('#output').innerText(),'Do not discard this edit');
      assert.equal(await page.locator('#creator-name').inputValue(),'Test Creator');
      await page.locator('#idea').fill('');await page.locator('#make').click();
      assert.equal(await page.locator('#output').innerText(),'Do not discard this edit');
      mode='quota';await page.locator('#idea').fill('Preserve this');await page.locator('#generate-ai').click();
      await page.waitForFunction(()=>document.getElementById('ai-status').textContent.includes('allowance'));
      assert.equal(await page.locator('#output').innerText(),'Do not discard this edit');
      assert.doesNotMatch(await page.locator('#ai-status').innerText(),/PRIVATE/);
      mode='offline';await page.locator('#generate-ai').click();
      await page.waitForFunction(()=>document.getElementById('ai-status').textContent.includes('not reachable'));
      assert.equal(await page.locator('#output').innerText(),'Do not discard this edit');
      mode='html';await page.locator('#generate-ai').click();
      await page.waitForFunction(()=>document.getElementById('output').textContent.includes('<img'));
      assert.equal(await page.locator('#output img').count(),0,'Provider markup must remain inert text');
      mode='ok';await page.locator('#generate-ai').click();
      await page.waitForFunction(()=>document.getElementById('output').textContent.startsWith('Draft for'));
      assert.match(lastPayload.profile,/Do not invent my experiences/);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export-projects').click();
      const download=await downloadPromise;assert.equal(download.suggestedFilename(),'sparkle-projects-backup.json');
      assert.equal(JSON.parse(fs.readFileSync(await download.path(),'utf8')).length,2);
      await page.locator('#idea').fill('A fresh creator idea');
      await page.locator('#copy-prompt').click();
      assert.match(await page.locator('#copy-status').innerText(),/copied|Clipboard unavailable/);
      await page.locator('#copy').click();
      assert.match(await page.locator('#copy-status').innerText(),/copied|Clipboard unavailable/);
      await page.locator('#saved').selectOption(first);
      acceptDialogs=false;await page.locator('#delete').click();acceptDialogs=true;
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),2);
      await page.locator('#delete').click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),1);
      await page.locator('.danger-zone summary').click();acceptDialogs=false;await page.locator('#clear').click();acceptDialogs=true;
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),1);
      await page.locator('#clear').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('sparkle_creator_projects_v1')),null);
      const name='creator-'+engine+'-'+width+'.png';await page.screenshot({path:path.join(outputDir,name),fullPage:true});report.screenshots.push(name);
      await page.locator('#clear-output').click();
      await page.locator('.profile-panel summary').click();await page.locator('#profile-clear').click();
      assert.equal(await page.locator('#creator-name').inputValue(),'');
      count+=18;
     }
     assert.deepEqual(errors,[],'Unexpected browser errors at '+engine+' '+width);
     report.results.push({engine,width,apiTaskChecks:7,apiCalls,axeViolations:axe.violations.length,layout,browserErrors:errors});
     }catch(error){
      const name='failure-'+engine+'-'+width+'.png';
      await page.screenshot({path:path.join(outputDir,name),fullPage:true});
      report.failure={engine,width,message:error.message};report.screenshots.push(name);
      fs.writeFileSync(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
      throw error;
     }finally{await context.close();}
    }
   }finally{await browser.close();}
  }
  report.checks=count;fs.writeFileSync(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS '+count+' Creator browser checks across Chromium and WebKit, four phone widths and two desktop widths; axe reported zero violations.');
 })().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
}
