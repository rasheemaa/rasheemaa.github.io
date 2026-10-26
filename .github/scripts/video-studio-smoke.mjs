import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, join, extname} from 'node:path';
import {chromium, webkit, devices} from 'playwright';

const root = resolve('.');
const html = await readFile('what-do-i-say/video-studio/index.html', 'utf8');
const script = await readFile('what-do-i-say/video-studio/studio.js', 'utf8');
assert.match(html, /Generation disabled/);
assert.match(html, /Video creation is paused/);
assert.match(html, /frame-src 'none'/);
assert.match(html, /connect-src 'none'/);
assert.match(html, /form-action 'none'/);
assert.doesNotMatch(html, /<iframe\\b|<script\\b|<form\\b|<textarea\\b|<input\\b|<button\\b/i);
assert.doesNotMatch(html, /https?:\\/\\/[^\\s"'<>]+/i);
assert.doesNotMatch(html, /huggingface|hf\\.space|ltx-2-3|generate.video/i);
assert.doesNotMatch(script, /\\bfetch\\s*\\(|XMLHttpRequest|\\bsubmit\\s*\\(|clipboard|createElement/i);

const mime={'.css':'text/css','.html':'text/html'};
const server=createServer(async(req,res)=>{
  let path=new URL(req.url||'/', 'http://localhost').pathname;
  if(path==='/what-do-i-say/video-studio/')path+='index.html';
  if(!/^\\/what-do-i-say\\/video-studio\\/(?:index\\.html|studio\\.css)$/.test(path)){
    res.writeHead(404).end('not found');return;
  }
  try{
    const data=await readFile(join(root,path),'utf8');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/plain'});
    res.end(data.replace(/^---\\s*\\n[\\s\\S]*?\\n---\\s*\\n/,''));
  } catch {res.writeHead(404).end('not found')}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
const origin='http://127.0.0.1:'+server.address().port;
async function check(type,device,label){
  const browser=await type.launch({headless:true});
  const context=await browser.newContext(device);
  const page=await context.newPage();
  const requests=[],errors=[];
  page.on('request',req=>{ if(new URL(req.url()).origin!==origin)requests.push(req.url()); });
  page.on('pageerror',err=>errors.push(err.message));
  page.on('popup',()=>errors.push('unexpected popup'));
  try{
    const response=await page.goto(origin+'/what-do-i-say/video-studio/',{waitUntil:'load'});
    assert.equal(response.status(),200);
    assert.match(await page.title(),/Safety Review/);
    assert.equal(await page.getByRole('heading',{name:'Video creation is paused'}).count(),1);
    assert.equal(await page.locator('iframe,form,textarea,input,button,script').count(),0);
    assert.equal(await page.locator('a[href^="http"]').count(),0);
    assert.match(await page.locator('body').innerText(),/No videos can be generated/);
    assert.deepEqual(requests,[],'external network request');
    assert.deepEqual(errors,[],'browser errors');
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scroll<=dimensions.width+3,'horizontal overflow: '+JSON.stringify(dimensions));
    console.log('PASS '+label+' safe disabled video studio',dimensions);
  } finally {await context.close();await browser.close();}
}
try{
 await check(chromium,{viewport:{width:1280,height:800}},'desktop chromium');
 await check(chromium,{...devices['Pixel 7']},'mobile chromium');
 await check(webkit,{...devices['iPhone 13']},'mobile webkit');
} finally {server.close();}
