import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
const AxeBuilder=createRequire(import.meta.url)('@axe-core/playwright').default;

const root=resolve('.'), reports=resolve('.github/reports/video-planner');
await mkdir(reports,{recursive:true});
const types={'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/api/video/capabilities'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:false}));return;}
    const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
    res.end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
try {
  for(const [name,engine,width] of [['desktop',chromium,1280],['phone',webkit,390]]){
    const browser=await engine.launch({headless:true});
    try {
      const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',acceptDownloads:true});
      const page=await context.newPage(), errors=[], external=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
      page.on('dialog',d=>d.accept());
      assert.equal((await page.goto(origin+'/what-do-i-say/video-planner/')).status(),200);
      assert.equal(await page.locator('#plan-workspace').isVisible(),false);
      assert.equal(await page.locator('#creative-settings').getAttribute('open'),null);
      assert.equal(await page.locator('#start-plan').isVisible(),true);
      assert.equal(await page.locator('#generate-video').isVisible(),false);
      assert.equal(await page.locator('#video-result').isVisible(),false);
      const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      assert.equal(await overflow(),false);
      await page.screenshot({path:resolve(reports,name+'-start.png'),fullPage:true});
      const idea='A short film about my handmade earrings. Warm light and a slow reveal of the finished pair.';
      await page.locator('#concept').fill(idea);
      await page.locator('#start-plan').click();
      assert.equal(await page.locator('#plan-workspace').isVisible(),true);
      assert.equal(await page.locator('#scene-count').innerText(),'1 scene');
      assert.equal(await page.locator('#scene-0-action').inputValue(),idea);
      assert.equal(await page.locator('#scene-editor').getAttribute('open'),null);
      await page.locator('#edit-scenes').click();
      assert.equal(await page.locator('#scene-0-action').evaluate(el=>el===document.activeElement),true);
      await page.locator('#scene-0-action').fill('Close detail of my earrings in warm light.');
      await page.locator('#add-scene').click();
      await page.locator('#scene-1-action').fill('Reveal the finished pair.');
      await page.getByRole('button',{name:'Move scene 2 up',exact:true}).click();
      await page.locator('#fit').click();
      assert.match(await page.locator('#timing').innerText(),/15 of 15 seconds/);
      const scenes=await page.locator('#timeline').innerText();
      await page.locator('#start-plan').click();
      assert.equal(await page.locator('#timeline').innerText(),scenes,'Returning to the plan preserves edited scenes');
      await page.locator('#title').fill('Jewelry film');
      await page.locator('#save').click();
      await page.getByText('Video plan saved in this browser. Download a backup to keep a separate copy.',{exact:true}).waitFor();
      await page.reload();
      assert.equal(await page.locator('#title').inputValue(),'Jewelry film');
      assert.equal(await page.locator('#timeline').innerText(),scenes);
      await page.locator('#show-plan').click();
      assert.match(await page.locator('#plan-text').innerText(),/No video or audio has been generated/);
      assert.equal(await overflow(),false);
      const a11y=await new AxeBuilder({page}).analyze();
      assert.deepEqual(a11y.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id),[]);
      await page.screenshot({path:resolve(reports,name+'-plan.png'),fullPage:true});
      await page.locator('#new').click();
      assert.equal(await page.locator('#plan-workspace').isVisible(),false);
      await page.locator('#open-library').click();
      await page.locator('#saved-projects').selectOption({label:'Jewelry film'});
      await page.locator('#load').click();
      assert.equal(await page.locator('#timeline').innerText(),scenes);
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      await context.close();
      console.log('PASS '+name+': simple start, exact idea, editing, timing, saved recovery, accessible controls and zero provider calls');
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve=>server.close(resolve));}
