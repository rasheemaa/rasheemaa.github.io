// Synthetic transport and colored-grid media exercise the real browser editor.
// This never asserts model quality, moderation approval or live generation.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root=resolve('.'),reports=resolve('.github/reports/video-planner');await mkdir(reports,{recursive:true});
const fixture=await readFile('.github/fixtures/video-editor-test.mp4');
assert.equal(createHash('sha256').update(fixture).digest('hex'),'122067c6070e488c3f9f1d6eae86ea1eb406be357c46ce861303842df63cc694');
let refuse=false;const submissions=[];
const job='d'.repeat(32),json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/api/video/capabilities')return json(res,{ready:true,formats:['9:16','16:9'],seconds:5,audio:false});
    if(pathname==='/api/video/jobs'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Oversize test request');}
      submissions.push(JSON.parse(body));
      return refuse?json(res,{error:'video_unavailable'},503):json(res,{id:job,state:'ready',expires:Math.floor(Date.now()/1000)+3600},202);
    }
    if(pathname===`/api/video/jobs/${job}/file`){res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':fixture.length});res.end(fixture);return;}
    const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
  for(const [name,engine,width] of [['editor-desktop',chromium,1280],['editor-phone',chromium,390],['editor-webkit',webkit,390]]){
    const browser=await engine.launch({headless:true});
    try{
      refuse=false;const context=await browser.newContext({viewport:{width,height:844},acceptDownloads:true});
      const page=await context.newPage(),errors=[],external=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:'))external.push(r.url());});
      await page.goto(origin+'/what-do-i-say/video-planner/');
      await page.locator('#concept').fill('An original glass sphere rolling across a table.');
      await page.locator('#generate-video').click();await page.locator('#video-result').waitFor();
      await page.waitForFunction(()=>{const v=document.querySelector('#generated-video');return v.readyState>=1||v.error;});
      const original=await page.locator('#download-original').getAttribute('href');
      const canPlay=await page.locator('#generated-video').evaluate(v=>!v.error);
      if(canPlay){
        assert.equal(await page.locator('#video-editor').isVisible(),true);await page.locator('#video-editor summary').click();
        await page.locator('#trim-start').fill('4');await page.locator('#trim-end').fill('2');await page.locator('#trim-video').click();
      }else{
        assert.equal(await page.locator('#video-editor').isVisible(),false);
        assert.match(await page.locator('#edit-progress').innerText(),/could not play/);
      }
      const canEncode=canPlay&&await page.evaluate(()=>typeof VideoEncoder!=='undefined'&&typeof VideoDecoder!=='undefined');
      if(canEncode){
        await page.getByText('Choose at least 0.25 seconds within the original video.',{exact:true}).waitFor();
        await page.locator('#trim-start').fill('1');await page.locator('#trim-end').fill('4');await page.locator('#trim-video').click();
        await page.waitForFunction(()=>/Your 3.00-second edit is ready/.test(document.querySelector('#edit-progress').textContent),{},{timeout:90000});
        await page.waitForFunction(()=>document.querySelector('#generated-video').readyState>=1);
        const duration=await page.locator('#generated-video').evaluate(v=>v.duration);assert(Math.abs(duration-3)<.06,String(duration));
        assert.equal(await page.locator('#download-original').getAttribute('href'),original);
        const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-video').click()]);
        assert.match(download.suggestedFilename(),/^sparkle-video-edited\.(mp4|webm)$/);
        await download.saveAs(resolve(reports,name+'-'+download.suggestedFilename()));
        // Return to the immutable source, then cancel while the lazy import is held.
        await page.locator('#restore-video').click();assert.equal(await page.locator('#download-video').getAttribute('href'),original);
        assert.equal(await page.locator('#generated-video').getAttribute('src'),original);
      }else if(canPlay){
        assert.equal(await page.locator('#trim-video').isDisabled(),true);
        assert.match(await page.locator('#edit-progress').innerText(),/original download/);
      }
      // Refinement preserves an already changed draft and failures preserve media.
      const draft='Keep the red glass sphere, but move the camera closer.';await page.locator('#concept').fill(draft);
      await page.locator('#refine-video').click();assert.equal(await page.locator('#concept').inputValue(),draft);
      assert.equal(await page.locator('#concept').evaluate(el=>el===document.activeElement),true);
      refuse=true;await page.locator('#generate-video').click();await page.getByText('Video generation is unavailable right now. Your idea is still here.',{exact:true}).waitFor();
      assert.equal(await page.locator('#download-original').getAttribute('href'),original);
      const [originalDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#download-original').click()]);
      await originalDownload.saveAs(resolve(reports,name+'-original.mp4'));
      const saved=await readFile(resolve(reports,name+'-original.mp4'));assert.deepEqual(saved,fixture);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const a11y=await new AxeBuilder({page}).analyze();assert.deepEqual(a11y.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id),[]);
      await page.screenshot({path:resolve(reports,name+'.png'),fullPage:true});
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      console.log(`PASS ${name}: ${canPlay?'real media preview':'honest unsupported-codec fallback'}, ${canEncode?'accurate local trim and edited download':'original-download fallback'}, exact original download, preserved refinement/failure, mobile fit and accessibility. Synthetic API/media only.`);
      await context.close();
    }finally{await browser.close();}
  }
  const browser=await chromium.launch({headless:true});
  try{
    for(const action of ['cancel','new-result']){
      refuse=false;const context=await browser.newContext(),page=await context.newPage();
      let release,requested;const gate=new Promise(r=>release=r),seen=new Promise(r=>requested=r);
      await page.route('**/vendor/mediabunny.mjs',async route=>{requested();await gate;await route.continue();});
      try{
        await page.goto(origin+'/what-do-i-say/video-planner/');await page.locator('#concept').fill('An original glass sphere on a table.');
        await page.locator('#generate-video').click();await page.waitForFunction(()=>document.querySelector('#generated-video').readyState>=1);
        const old=await page.locator('#download-original').getAttribute('href');
        await page.locator('#video-editor summary').click();await page.locator('#trim-end').fill('3');await page.locator('#trim-video').click();
        await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Editor bundle not requested')),5000))]);
        if(action==='cancel')await page.locator('#cancel-trim').click();
        else{await page.locator('#generate-video').click();await page.waitForFunction(old=>document.querySelector('#download-original').getAttribute('href')!==old,old);}
        release();
        if(action==='cancel')await page.getByText('Edit stopped. Your video and original download are still here.',{exact:true}).waitFor();
        else{await page.waitForTimeout(200);assert.equal(await page.locator('#edit-progress').innerText(),'');}
        assert.equal(await page.locator('#download-video').getAttribute('href'),await page.locator('#download-original').getAttribute('href'));
        assert.equal(await page.locator('#trim-video').isDisabled(),false);
        console.log(`PASS editor ${action}: late lazy import cannot replace the current video or download.`);
      }finally{release();await context.close();}
    }
  }finally{await browser.close();}
}finally{await new Promise(r=>server.close(r));}
