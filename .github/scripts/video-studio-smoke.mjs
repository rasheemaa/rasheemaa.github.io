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
    // HTTPS-only upgrade rules are tested in production. HTTP localhost cannot satisfy them in WebKit.
    const body=path.endsWith('.html')?text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'').replace('upgrade-insecure-requests',''):text;
    res.writeHead(200, {'Content-Type':mime[extname(path)]||'text/plain'});
    res.end(body);
  } catch(e) { res.writeHead(404).end('not found'); }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const origin='http://127.0.0.1:'+server.address().port;
const expected='https://lightricks-ltx-2-3.hf.space/';
async function smoke(browserType,name,options={}){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(options);
  // The parent app is tested without consuming GPU quota. A separate live check verifies provider status.
  await context.route('https://lightricks-ltx-2-3.hf.space/**',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><title>LTX embed placeholder for UI test</title>'
  }));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    const resp=await page.goto(origin+'/what-do-i-say/video-studio/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(resp.status(),200, name+' page not served');
    assert.match(await page.title(),/Sparkle Video Studio/);
    assert.equal(await page.locator('iframe').getAttribute('src'),expected);
    assert.equal(await page.locator('iframe').count(),1);
    assert.equal(await page.locator('#prepared-panel').isVisible(),false);
    await page.locator('#prepare').click();
    assert.match(await page.locator('#composer-status').innerText(),/First describe/);
    await page.locator('[data-sample="street"]').click();
    await page.locator('#format').selectOption('16:9');
    await page.locator('#lighting').selectOption('golden');
    await page.locator('#prepare').click();
    assert.equal(await page.locator('#prepared-panel').isVisible(),true);
    const value=await page.locator('#prepared').inputValue();
    assert.match(value,/Philadelphia/);
    assert.match(value,/16:9/);
    assert.match(value,/golden-hour/);
    await page.locator('#camera').selectOption('tracking');
    assert.equal(await page.locator('#prepared-panel').isVisible(),false,'stale prompt still shown');
    await page.locator('#prepare').click();
    assert.match(await page.locator('#prepared').inputValue(),/Smooth tracking/);
    await page.locator('#copy').click();
    await page.waitForFunction(() => /copied|selected/i.test(document.getElementById('composer-status').textContent), null, {timeout:5000});
    assert.match(await page.locator('#composer-status').innerText(),/copied|selected/i);
    assert.equal(await page.locator('a[href="/what-do-i-say/"]').count()>0,true);
    assert.equal(await page.locator('a[href="https://huggingface.co/spaces/Lightricks/LTX-2-3"]').count()>0,true);
    assert.equal(errors.length,0,name+' page error(s): '+errors.join('; '));
    const dim=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(dim.scroll<=dim.width+3, name+' horizontal overflow '+JSON.stringify(dim));
    console.log('PASS',name,JSON.stringify({embed:expected,layout:dim,preparedCharacters:value.length}));
  }finally{
    await context.close(); await browser.close();
  }
}
try {
  await smoke(chromium,'desktop chromium',{viewport:{width:1280,height:850}});
  await smoke(chromium,'mobile chromium',{...devices['Pixel 7']});
  await smoke(webkit,'iphone webkit',{...devices['iPhone 13']});
  console.log('PASS: All browser-side static functional checks');
} finally {server.close();}
