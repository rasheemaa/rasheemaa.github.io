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
  if(!/^\/what-do-i-say\/video-studio\//.test(path)){
    res.writeHead(404).end('not found'); return;
  }
  try {
    const file=await readFile(join(root,path),'utf8');
    const body=path.endsWith('.html')?file.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'').replace('upgrade-insecure-requests',''):file;
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/plain'});
    res.end(body);
  } catch(e) {res.writeHead(404).end('not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const origin='http://127.0.0.1:'+server.address().port;
async function smoke(browserType,name,options={}){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(options);
  const page=await context.newPage(), external=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
  try {
    const response=await page.goto(origin+'/what-do-i-say/video-studio/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response.status(),200,name+' not served');
    assert.match(await page.title(),/Sparkle Video Studio/);
    assert.equal(await page.locator('iframe, script, textarea, input, form, button, video').count(),0,name+' unsafe interactive generator surface');
    assert.equal(await page.locator('a[href^="http"]').count(),0,name+' external generator link');
    assert.match(await page.locator('main').innerText(),/video creation is paused/i);
    assert.match(await page.locator('main').innerText(),/minors/);
    assert.match(await page.locator('main').innerText(),/sexual violence/);
    assert.match(await page.locator('main').innerText(),/server.side screening/i);
    assert.deepEqual(external,[],name+' outbound request');
    assert.deepEqual(errors,[],name+' page errors');
    const dim=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(dim.scroll<=dim.width+3,name+' horizontal overflow '+JSON.stringify(dim));
    console.log('PASS',name,JSON.stringify({locked:true,externalRequests:0,layout:dim}));
  } finally {await context.close(); await browser.close();}
}
try {
  await smoke(chromium,'desktop chromium',{viewport:{width:1280,height:850}});
  await smoke(chromium,'mobile chromium',{...devices['Pixel 7']});
  await smoke(webkit,'iphone webkit',{...devices['iPhone 13']});
  console.log('PASS: Studio safety hold verified across browsers');
} finally {server.close();}
