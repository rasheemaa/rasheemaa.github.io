import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, join, extname} from 'node:path';
import {chromium, webkit, devices} from 'playwright';

const root=resolve('.');
const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'};
const server=createServer(async(req,res)=>{
  const uri=new URL(req.url||'/', 'http://localhost');
  let path=uri.pathname;
  if(path==='/what-do-i-say/video-studio/') path+='index.html';
  if(path==='/what-do-i-say/') path+='index.html';
  if(!/^\/what-do-i-say\/(video-studio\/|index\.html$)/.test(path)){
    res.writeHead(404).end('not found'); return;
  }
  try {
    const text=await readFile(join(root,path), 'utf8');
    const body=path.endsWith('.html')?text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'').replace('upgrade-insecure-requests',''):text;
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/plain'});
    res.end(body);
  } catch (_) {res.writeHead(404).end('not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const origin='http://127.0.0.1:'+server.address().port;
async function smoke(browserType,name,options={}){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(origin))requests.push(r.url());});
  try {
    const resp=await page.goto(origin+'/what-do-i-say/video-studio/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(resp.status(),200,name+' page not served');
    assert.match(await page.title(),/Sparkle Video Studio/);
    assert.equal(await page.locator('iframe').count(),0,name+' unmoderated iframe exposed');
    assert.equal(await page.locator('a[href*="huggingface.co/spaces/"]').count(),0,name+' generator escape link exposed');
    assert.equal(await page.locator('#prepare').isDisabled(),true,name+' prompt preparation unexpectedly enabled');
    assert.equal(await page.locator('#prepared-panel').isVisible(),false);
    assert.match(await page.locator('#video-safety-status').innerText(),/unavailable|disabled|until|not available/i);
    assert.match(await page.locator('.generator-note').innerText(),/No depictions of minors/);
    assert.match(await page.locator('.generator-note').innerText(),/sexual violence/i);
    await page.locator('[data-sample="street"]').click();
    assert.match(await page.locator('#scene').inputValue(),/adult woman/);
    await page.locator('#format').selectOption('16:9');
    await page.locator('#lighting').selectOption('golden');
    await page.locator('#scene').fill('A 12-year-old child in a park');
    // Programmatic click dispatch cannot override the lock, even if the UI is tampered with.
    await page.evaluate(()=>{
      const button=document.getElementById('prepare');
      button.disabled=false;
      button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      document.getElementById('copy').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    });
    assert.equal(await page.locator('#prepared-panel').isVisible(),false);
    assert.equal(await page.locator('#prepared').inputValue(),'');
    assert.match(await page.locator('#composer-status').innerText(),/unavailable/);
    assert.deepEqual(requests,[],name+' external request issued: '+requests.join(', '));
    assert.deepEqual(errors,[],name+' JavaScript errors');
    const dim=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(dim.scroll<=dim.width+3,name+' horizontal overflow '+JSON.stringify(dim));
    console.log('PASS',name,JSON.stringify({safetyLocked:true,externalRequests:0,layout:dim}));
  } finally {await context.close();await browser.close();}
}
try {
  await smoke(chromium,'desktop chromium',{viewport:{width:1280,height:850}});
  await smoke(chromium,'mobile chromium',{...devices['Pixel 7']});
  await smoke(webkit,'iphone webkit',{...devices['iPhone 13']});
  console.log('PASS: all safety-lock browser checks');
} finally {server.close();}
