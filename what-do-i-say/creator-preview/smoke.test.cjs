// One static server and one browser harness serve the same Creator Studio sources.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'creator.css'),'utf8');
const sparkleStudioCss=fs.readFileSync(path.join(root,'sparkle-studio.css'),'utf8');
const ai=fs.readFileSync(path.join(root,'ai.js'),'utf8');
const profile=fs.readFileSync(path.join(root,'profile.js'),'utf8');
const projects=fs.readFileSync(path.join(root,'projects.js'),'utf8');
const drafts=fs.readFileSync(path.join(root,'drafts.js'),'utf8');
const chat=fs.readFileSync(path.join(root,'../chat-app.js'),'utf8');
for(const id of ['task','idea','tone','audience','project','project-search','saved','save','new-project','load','delete','clear','export-projects','import-projects','project-backup','backup-status','creator-name','creator-niche','creator-style','creator-avoid','profile-save','profile-clear','sparkle','copy-prompt','copy-status','edit-draft','draft-editor','apply-draft','generate-ai','cancel-ai','ai-status','save-output','clear-output','output-status','manual-copy']){
 assert.match(html,new RegExp('id="'+id+'"'),'Missing control: '+id);
}
assert.match(html,/noindex,nofollow/);
assert.match(html,/class="skip-link" href="#creator-workspace"/);
assert.match(html,/id="creator-workspace" tabindex="-1"/);
assert.match(html,/<h2 id="composer-title">Plan a post or video<\/h2>/);
assert.match(html,/id="make" type="button">Create content brief<\/button>/);
assert.match(html,/id="ai-controls" class="button-row" hidden/);
assert.match(html,/id="saved-heading">Saved projects<\/span>/);
assert.match(html,/class="backup-disclosure"/);
assert.match(html,/task-flow\.js\?v=1/);
for(const id of ['idea-label','task-help','audience-label','tone-label','composer-description','draft-description','task-mode-status']){
  assert.match(html,new RegExp('id="'+id+'"'),'Missing contextual task field: '+id);
}
const taskFlow=fs.readFileSync(path.join(root,'task-flow.js'),'utf8');
for(const mode of ['content','growth','reply','sell','deal','pdf','performance'])assert.match(taskFlow,new RegExp('\\b'+mode+':\\{'),'Task mode is missing: '+mode);
assert.match(taskFlow,/window\.SparkleCreatorTaskFlow/);

assert.match(html,/Advanced filters/);
for(const id of ['creator-filter-concise','creator-filter-hashtags','creator-filter-hype'])assert.match(html,new RegExp('id="'+id+'"'));
assert.match(html,/Reset saved filters/);
assert.match(profile,/sparkle_creator_profile_v1/);
assert.match(profile,/briefNotes/);
assert.match(app,/SparkleCreatorProfile\?\.briefNotes\(\)/);
assert.match(html,/Advanced: Back up or move projects/);
assert.match(html,/role="region" aria-label="Generated creative brief"/);
assert.match(html,/aria-atomic="true"/);
assert.match(html,/creator-preview\/sparkle-studio\.css\?v=6/);
assert.match(html,/← Back to Sparkle/);
assert.doesNotMatch(html,/<a class="site-link" href="\/">The Sheema Edit<\/a>/);
for(const color of ['#251b2d','#76677f','#fffaf7','#ff5aa9','#eadfff'])assert(sparkleStudioCss.includes(color),'Original Sparkle token missing: '+color);
assert.match(sparkleStudioCss,/border-radius:28px/);
assert.match(sparkleStudioCss,/backdrop-filter:blur\(18px\)/);
assert.match(sparkleStudioCss,/linear-gradient/);

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
assert.match(html,/creator-preview\/profile.js\?v=3/);
assert.match(html,/creator-preview\/entry.js\?v=1/);
assert.match(html,/Realistic AI video generation is not available yet/);
assert.match(html,/Create and edit videos/);
assert.match(html,/Write or plan something/);
assert.doesNotMatch(html,/href="\/what-do-i-say\/free-engine\/"/,'The technical nature demo must not be presented as the video editor');
assert.match(html,/Editing your own video is also not available in this build/);
assert.match(html,/creator-preview\/drafts.js\?v=2/);
assert.match(html,/creator-preview\/backups.js\?v=1/);
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
 const https=require('node:https');
 const os=require('node:os');
 const {execFileSync}=require('node:child_process');
 // An ephemeral local certificate lets WebKit honor upgrade-insecure-requests.
 // Trust is relaxed only for this isolated test context, never in the product.
 const tlsDir=fs.mkdtempSync(path.join(os.tmpdir(),'sparkle-browser-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tlsDir,'key.pem'),'-out',path.join(tlsDir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 const {chromium,webkit,devices}=require('playwright');
 const AxeBuilder=require('@axe-core/playwright').default;
 const siteRoot=process.env.CREATOR_SITE_ROOT?path.resolve(process.env.CREATOR_SITE_ROOT):path.resolve(root,'../..');
 const studioPath=process.env.CREATOR_PREVIEW_PATH||'/what-do-i-say/creator-preview/';
 const writingPath=process.env.CREATOR_WRITING_PATH||'/what-do-i-say/';
 for(const route of [studioPath,writingPath]){
  assert(route.startsWith('/')&&route.endsWith('/')&&!route.includes('..'),'Use explicit local directory routes');
  assert(fs.existsSync(path.join(siteRoot,route,'index.html')),'Browser test route is missing: '+route);
 }
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mjs':'text/javascript; charset=utf-8'};
 const server=https.createServer({key:fs.readFileSync(path.join(tlsDir,'key.pem')),cert:fs.readFileSync(path.join(tlsDir,'cert.pem'))},(req,res)=>{
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
  const origin='https://127.0.0.1:'+server.address().port;
  const api='https://sparkle.rasheema-abdullah.workers.dev/api/creator/generate';
   const outputDir=process.env.CREATOR_REPORT_DIR?path.resolve(process.env.CREATOR_REPORT_DIR):path.join(siteRoot,'.github/reports/creator-studio');
   if(process.env.CREATOR_SITE_ROOT)assert(process.env.CREATOR_REPORT_DIR&&!outputDir.startsWith(siteRoot+path.sep),'Keep packaged-site test artifacts outside deployed assets');
  fs.mkdirSync(outputDir,{recursive:true});
  const report={revision:process.env.GITHUB_SHA||null,kind:'Simulated browsers and deterministic API responses; not physical iPhone or live inference',results:[],screenshots:[]};
  let count=0;
  for(const [engine,runtime] of [['chromium',chromium],['webkit',webkit]]){
   const browser=await runtime.launch({headless:true});
   try{
    for(const width of [360,375,390,430,1280,1440]){
     const phone=width<761;
     const context=await browser.newContext({viewport:{width,height:844},isMobile:phone,hasTouch:phone,userAgent:phone?devices['iPhone 13'].userAgent:undefined,serviceWorkers:'block',acceptDownloads:true,ignoreHTTPSErrors:true});
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
     const response=await page.goto(origin+studioPath);
     assert.equal(response.status(),200);
     await page.evaluate(()=>document.fonts.ready);
     assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 250, 247)','The production styles must load over HTTPS');
     if(width===390||width===1440){
      const name='initial-'+engine+'-'+width+'.png';
      await page.screenshot({path:path.join(outputDir,name)});report.screenshots.push(name);
     }
     await page.keyboard.press('Tab');
     assert.equal(await page.evaluate(()=>document.activeElement.className),'skip-link');
     await page.keyboard.press('Enter');
     assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-workspace');
     const layout=await page.evaluate(()=>({
       scrollWidth:document.documentElement.scrollWidth,
       viewport:innerWidth,
       h1:document.querySelectorAll('h1').length,
       background:getComputedStyle(document.body).backgroundColor,
       gradient:getComputedStyle(document.body).backgroundImage,
       surface:getComputedStyle(document.querySelector('.video-feature')).borderTopLeftRadius,
       surfaceGradient:getComputedStyle(document.querySelector('.video-feature')).backgroundImage,
       headingFont:getComputedStyle(document.querySelector('#creator-studio-title')).fontFamily,
       buttonRadius:getComputedStyle(document.querySelector('.video-cta')).borderTopLeftRadius,
       buttonGradient:getComputedStyle(document.querySelector('.video-cta')).backgroundImage,
       headerGlass:getComputedStyle(document.querySelector('.studio-header')).backdropFilter,
       brandColor:getComputedStyle(document.querySelector('.brand')).color
     }));
     assert(layout.scrollWidth<=width+1,'Horizontal overflow at '+engine+' '+width);
     assert.equal(layout.h1,1);assert.equal(layout.background,'rgb(255, 250, 247)');
     assert.match(layout.gradient,/linear-gradient/,'Sparkle pink-lavender page background missing');
     assert.match(layout.surfaceGradient,/linear-gradient/,'Futuristic Creator Studio surface missing');
     assert.match(layout.headingFont,/Georgia/,'Creator Studio must share Sparkle homepage typography');
     assert.equal(layout.surface,phone?'23px':'28px','Creator Studio needs rounded Sparkle cards');
     assert.equal(layout.buttonRadius,'17px','Video planning option needs rounded corners');
     assert.match(layout.buttonGradient,/linear-gradient/,'Primary action needs Sparkle accent');
     assert.equal(layout.brandColor,'rgb(37, 27, 45)','Brand colors should match Sparkle home');
     assert.equal(layout.headerGlass,'blur(18px)','Studio header should carry frosted Sparkle surface');

     assert.equal(await page.locator('#studio-tools').getAttribute('open'),null,'Creator tools must begin collapsed');
     assert.equal(await page.locator('#composer').isVisible(),false,'Advanced composer must not crowd landing screen');
     assert(await page.locator('.video-cta').isVisible(),'Video creation entry must remain accessible');
     assert.match(await page.locator('.video-cta').innerText(),/Create a video/);
     assert.equal(await page.locator('.studio-start-edit').count(),0,'Do not substitute the nature demo for creating or editing a user video');
     assert(await page.locator('#start-creator-draft').isVisible(),'Drafting must be one click away');
     if (width===390 || width===1440) {
       await page.locator('#start-creator-draft').click();
       assert.equal(await page.locator('#studio-tools').getAttribute('open'),'','Draft shortcut must expand tools');
       assert.equal(await page.locator('#task').isVisible(),true);
       await page.locator('#studio-tools > summary').click();
     }
     await page.locator('#studio-tools > summary').click();
     assert(await page.locator('#composer').isVisible(),'Creator tools must expand on demand');
     assert.equal(await page.locator('#composer-title').innerText(),'Plan a post or video');
     assert(await page.locator('#make').isVisible(),'Free draft must be the primary action');
     assert(await page.locator('#generate-ai').isVisible(),'Mocked available AI remains accessible');
     assert(await page.locator('.projects-disclosure > summary').innerText().then(s=>s.includes('Saved projects')));
     assert(await page.locator('.backup-disclosure').getAttribute('open')===null,'Advanced backups stay collapsed');
     if(phone)assert(await page.evaluate(()=>document.getElementById('output').getBoundingClientRect().top<document.getElementById('project').getBoundingClientRect().top),'The draft must follow the composer before project management on phones');
     if(width===390||width===1440)await page.locator('.projects-disclosure > summary').click();
     const targets=await page.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(nodes=>nodes.map(node=>({id:node.id,height:node.getBoundingClientRect().height})));
     assert(targets.every(target=>target.height>=44),'Small touch target: '+JSON.stringify(targets.filter(t=>t.height<44)));
     const taskCases=[
       ['content','Plan a post or video','What is your post or video idea?','Create content brief','Your content brief','Relatable and confident'],
       ['growth','Plan your content schedule','What is your content goal?','Create posting plan','Your posting plan','Practical and encouraging'],
       ['reply','Plan your response','What did they say, and what do you want to say back?','Create reply outline','Your reply outline','Warm and conversational'],
       ['sell','Plan an offer','What are you offering and why does it help?','Create promotion brief','Your promotion brief','Friendly and helpful'],
       ['deal','Review a brand deal','What is the brand offering or requesting?','Create deal review','Your brand deal review','Clear and professional'],
       ['pdf','Outline a digital product','What digital product do you want to make?','Create product outline','Your product outline','Warm and conversational'],
       ['performance','Review your content metrics','What were your actual results, and from when?','Create metrics review','Your metrics review','Clear and professional']
     ];
     for(const [task,title,question,button,draftTitle,defaultTone] of taskCases){
      const previousDraft=await page.locator('#output').innerText();
      await page.locator('#task').selectOption(task);
      assert.equal(await page.locator('#composer-title').innerText(),title);
      assert.equal(await page.locator('#idea-label').innerText(),question);
      assert.equal(await page.locator('#make').innerText(),button);
      assert.equal(await page.locator('#draft-title').innerText(),draftTitle);
      assert.equal(await page.locator('#tone').inputValue(),defaultTone);
      assert(await page.locator('#idea').getAttribute('placeholder'));
      assert(await page.locator('#audience').getAttribute('placeholder'));
      assert(await page.locator('#task-help').innerText());
      assert.equal(await page.locator('#output').innerText(),previousDraft,'Task switching must preserve current work');
      await page.locator('#idea').fill(task==='performance'?'Last week: 1000 views, 90 likes, 15 saves, 4 shares. Suggest an experiment.':'An original creator idea for '+task);
      await page.locator('#generate-ai').click();
      await page.waitForFunction(task=>document.getElementById('output').textContent.startsWith('Draft for '+task),task);
      assert.equal(lastPayload.task,task);
      assert.equal(lastPayload.tone,defaultTone);
      count++;
     }
     const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
     assert.deepEqual(axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],'Accessibility violations at '+engine+' '+width);
     if(width===390||width===1440){
      await page.locator('.profile-panel > summary').click();
      await page.locator('#creator-name').fill('Test Creator');
      await page.locator('#creator-filter-concise').click();
      await page.locator('#creator-filter-hashtags').click();
      assert.equal(await page.locator('#creator-filter-concise').getAttribute('aria-pressed'),'true');
      await page.locator('#creator-style').fill('Original and conversational');
      await page.locator('#creator-avoid').fill('Do not invent my experiences');
      await page.locator('#profile-save').click();
      assert.match(await page.locator('#profile-status').innerText(),/saved/);
      await page.locator('.profile-panel > summary').click();
      await page.locator('#idea').fill('A relatable video about boundaries');
      await page.locator('#make').click();
      assert.match(await page.locator('#output').innerText(),/STARTER FRAMEWORK/);
      assert.match(await page.locator('#output').innerText(),/YOUR SAVED ADVANCED FILTERS/);
      assert.match(await page.locator('#output').innerText(),/Do not include hashtags/);
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
      await page.reload();
      await page.locator('#studio-tools > summary').click();
      await page.locator('.projects-disclosure > summary').click();
      assert.equal(await page.locator('#output').innerText(),'Do not discard this edit');
      assert.equal(await page.locator('#creator-name').inputValue(),'Test Creator');
      await page.locator('.profile-panel > summary').click();
      assert.equal(await page.locator('#creator-filter-hashtags').getAttribute('aria-pressed'),'true');
      await page.locator('.profile-panel > summary').click();
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
      assert.match(lastPayload.profile,/Do not include hashtags/);
      await page.locator('.backup-disclosure > summary').click();
      const downloadPromise=page.waitForEvent('download');await page.locator('#export-projects').click();
      const download=await downloadPromise;assert.equal(download.suggestedFilename(),'sparkle-projects-backup.json');
      const backupPath=await download.path();
      const backupRecords=JSON.parse(fs.readFileSync(backupPath,'utf8'));
      assert.equal(backupRecords.length,2);
      await page.locator('#project-backup').setInputFiles(backupPath);
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('already saved'));
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),2);
      await page.locator('#project-backup').setInputFiles({name:'damaged.json',mimeType:'application/json',buffer:Buffer.from('{damaged')});
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('not a readable JSON'));
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),2);
      await page.locator('#idea').fill('A fresh creator idea');
      await page.locator('#copy-prompt').click();
      await page.waitForFunction(()=>/copied|Clipboard unavailable/.test(document.getElementById('copy-status').textContent));
      assert.match(await page.locator('#copy-status').innerText(),/copied|Clipboard unavailable/);
      await page.locator('#copy').click();
      await page.waitForFunction(()=>/copied|Clipboard unavailable/.test(document.getElementById('copy-status').textContent));
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
      const keptForm=await page.locator('#idea').inputValue(),keptDraft=await page.locator('#output').innerText();
      acceptDialogs=false;await page.locator('#project-backup').setInputFiles(backupPath);
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('cancelled'));acceptDialogs=true;
      assert.equal(await page.evaluate(()=>localStorage.getItem('sparkle_creator_projects_v1')),null);
      await page.locator('#project-backup').setInputFiles(backupPath);
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('2 projects restored'));
      assert.equal(await page.locator('#saved option').count(),3);
      assert.equal(await page.locator('#idea').inputValue(),keptForm);
      assert.equal(await page.locator('#output').innerText(),keptDraft);
      assert.equal(await page.locator('#creator-name').inputValue(),'Test Creator');
      const conflicting=[{...backupRecords[0],draft:'An imported copy with the same ID'}];
      await page.locator('#project-backup').setInputFiles({name:'conflict.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(conflicting))});
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('separate copies'));
      const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')));
      assert.equal(restored.length,3);
      assert.equal(restored.find(p=>p.id===backupRecords[0].id).draft,backupRecords[0].draft);
      assert.equal(restored[0].draft,'An imported copy with the same ID');
      await page.locator('#project-backup').setInputFiles(backupPath);
      await page.waitForFunction(()=>document.getElementById('backup-status').textContent.includes('already saved'));
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sparkle_creator_projects_v1')).length),3);
      const name='creator-'+engine+'-'+width+'.png';await page.screenshot({path:path.join(outputDir,name),fullPage:true});report.screenshots.push(name);
      await page.locator('#clear-output').click();
      await page.locator('.profile-panel > summary').click();await page.locator('.filter-reset > summary').click();await page.locator('#profile-clear').click();
      assert.equal(await page.locator('#creator-name').inputValue(),'');
      count+=24;
     }
     assert.deepEqual(errors,[],'Unexpected Creator browser errors at '+engine+' '+width);
     await context.route(/https:\/\/(?:cdn\.jsdelivr\.net|huggingface\.co|[^/]+\.hf\.co)\//,route=>route.abort());
     let writingCalls=0,writingPayload,writingFailure=false;
      await context.route('**/api/generate',async route=>{
      if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});return;}
      writingCalls++;
      writingPayload=route.request().postDataJSON();
      if(writingFailure){await route.abort('failed');return;}
      await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({message:'Would Friday at 6 PM work for you?'})});
     });
     if(width===390){
      await page.locator('#idea').fill('A short original content idea');
      await page.locator('#sparkle').click();
       await page.waitForURL(origin+writingPath);
      assert.match(await page.locator('#prompt').inputValue(),/You are Sparkle Creator/);
      assert.equal(writingCalls,0,'Handoff must prefill without sending');
      }else await page.goto(origin+writingPath);
     await page.evaluate(()=>document.fonts.ready);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sparkle writing page overflows at '+engine+' '+width);
      assert.equal(await page.locator('.creator-entry').getAttribute('href'),studioPath);
     const mainAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
     assert.deepEqual(mainAxe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],'Sparkle writing accessibility violations');
     if(width===390||width===1440){const name='writing-'+engine+'-'+width+'.png';await page.screenshot({path:path.join(outputDir,name)});report.screenshots.push(name);}
     if(engine==='webkit'&&width===390){
      await page.locator('#prompt').fill('Ask if Friday at 6 PM works.');await page.locator('#generate').click();
      await page.waitForFunction(()=>document.querySelector('#conversation .message-row.assistant .bubble')?.textContent.includes('Would Friday'));
      assert.equal(writingCalls,1);
      for(const [key,label] of [['shorter','Make it shorter'],['softer','Make it softer'],['firmer','Make it firmer'],['professional','Make it professional'],['another','Try another version']]){
       const before=writingCalls;
       await page.locator('.more-options').last().click();
       await page.locator('.refine-options').last().getByRole('button',{name:label,exact:true}).click();
       await page.waitForFunction(()=>!document.getElementById('generate').disabled);
       assert.equal(writingCalls,before+1,'Refinement must use the existing writing API');
       assert.equal(writingPayload.refine,key,'The selected refinement must reach the writing API');
      }
      writingFailure=true;
      await page.locator('#prompt').fill('Change Friday to Saturday.');await page.locator('#generate').click();
      await page.locator('#ai-error').waitFor({state:'visible'});
      assert.equal(await page.locator('#prompt').inputValue(),'Change Friday to Saturday.','Network failures must retain the requested edit');
      writingFailure=false;await page.locator('#ai-retry').click();
      await page.waitForFunction(()=>!document.getElementById('generate').disabled);
      assert.equal(await page.locator('#ai-error').isVisible(),false);
      await page.locator('.just-right').last().click();
      await page.locator('.start-new').last().click();
      assert.equal(await page.locator('#conversation .message-row').count(),0);
      count+=9;
     }
     count+=2;

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
 })().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close(()=>fs.rmSync(tlsDir,{recursive:true,force:true})));
}
