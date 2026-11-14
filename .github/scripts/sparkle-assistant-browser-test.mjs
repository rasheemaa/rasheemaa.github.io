import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium, webkit} from 'playwright';

const draft={siteName:'Happy Paws',headline:'Fresh care for pups',subheading:'Gentle baths and trims.',theme:'ocean',ctaLabel:'View services',sections:[{heading:'Baths',body:'Thoughtful wash.'},{heading:'Trims',body:'Tidy coats.'}]};
const requests=[];
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=path==='/what-do-i-say/'?'/what-do-i-say/index.html':path;
  if(!file.startsWith('/what-do-i-say/')&&!file.startsWith('/assets/')){res.writeHead(404);res.end();return;}
  try{
    const f=resolve('.'+file);
    if(!f.startsWith(resolve('what-do-i-say/'))&&!f.startsWith(resolve('assets/')))throw Error('Invalid path');
    let data=readFileSync(f);
    if(file.endsWith('index.html'))data=Buffer.from(data.toString().replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''));
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
    res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
async function check(engine,name){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true,
    userAgent:name==='WebKit'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1':undefined});
  for(const f of ['sparkle-cloud-mobile.js','sparkle-quality-hotfix.js','sparkle-first-draft-polish.js']){
    await context.route('**/what-do-i-say/'+f+'*',r=>r.fulfill({status:200,contentType:'application/javascript',body:f==='sparkle-cloud-mobile.js'?'window.__WDIS_MOBILE_CLOUD_SPARKLE=true;':''}));
  }
  await context.route('**/what-do-i-say/sparkle.js*',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:'window.__writing=[];window.Sparkle={generate:async p=>{window.__writing.push(p);return "Hi Jordan, I cannot make Friday."},cancel:()=>{}};'}));
  await context.route('**/api/assistant',async r=>{
    if(r.request().method()==='OPTIONS'){await r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}});return;}
    const p=r.request().postDataJSON();requests.push(p);
    const result=p.task==='website'?{type:'website',message:'I created a website draft. Not published.',website:draft}:{type:'chat',message:'What kind of website do you want?'};
    await r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const send=async text=>{await page.locator('#prompt').fill(text);await page.locator('#generate').click();await page.waitForFunction(()=>!document.querySelector('#generate')?.disabled);};
  try{
    await page.goto('http://127.0.0.1:'+port+'/what-do-i-say/',{waitUntil:'domcontentloaded'});
    await send('Create me a website');
    assert.equal(requests.at(-1).task,'chat');
    await send('For my dog grooming business');
    assert.equal(requests.at(-1).task,'website');
    assert.equal(await page.locator('.website-preview').count(),1);
    const downloaded=page.waitForEvent('download');
    await page.getByRole('button',{name:'Save HTML website'}).click();
    assert.equal((await downloaded).suggestedFilename(),'sparkle-website.html');
    await send('Make it blue');
    assert.equal(requests.at(-1).task,'website');
    assert.equal(requests.at(-1).existingWebsite.siteName,'Happy Paws');
    await page.locator('#new-message-top').click();
    await send('Tell Jordan I cannot make Friday');
    assert.equal(await page.evaluate(()=>window.__writing.length),1);
    await send('Make it warmer');
    assert.equal(await page.evaluate(()=>window.__writing.at(-1).refine),'custom');
    await send('No im asking you to do that for me');
    assert.equal(requests.at(-1).task,'chat');
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' assistant, website export, follow-ups, old writing');
  }finally{await context.close();await browser.close();}
}
try{await check(chromium,'Chromium');requests.length=0;await check(webkit,'WebKit');}finally{server.close();}
