// Real browser/media/UI behavior with explicitly synthetic API replies.
// This cannot establish caption model quality or physical iPhone acceptance.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const AxeBuilder=process.env.SPARKLE_LOCAL_NO_AXE==='1'?null:require('@axe-core/playwright').default;
const root=resolve('.'),reports=resolve('.github/reports/caption-thread');await mkdir(reports,{recursive:true});
const fixture=resolve('.github/fixtures/caption-audio-test.mp4');
let requests=[],jobs=new Map(),count=0,hold=false,refuse=false;
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function ready(job){
  const c=job.spec.conversation,reference=c?.reference;
  return {id:job.id,state:'ready',expires:2000000000,
    hook:c?.target==='caption'?reference.hook:'POV: synthetic on screen fixture '+job.number+' 😭',
    caption:c?.target==='hook'?reference.caption:'Synthetic companion caption '+job.number+' 😭',summary:'Synthetic API reply. Real fixture extraction is tested separately.'};
}
const server=http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/captions/capabilities')return json(res,{ready:true,kind:'social-caption',conversationVersion:1,maxSeconds:120,maxFileBytes:67108864,framesAnalyzed:'sampled',audioAnalyzed:true});
    if(path.startsWith('/api/captions/')){
      let raw='';for await(const c of req){raw+=c;if(raw.length>98304)throw Error('Oversize fixture request');}
      if(path==='/api/captions/jobs'&&req.method==='POST'){
        const spec=JSON.parse(raw);requests.push(spec);if(refuse)return json(res,{error:'caption_unavailable'},503);
        const id=(++count).toString(16).padStart(32,'0'),job={id,number:count,spec};jobs.set(id,job);
        return json(res,{id,state:'uploading',expires:2000000000},202);
      }
      const id=path.split('/')[4],job=jobs.get(id);if(!job)return json(res,{error:'not_found'},404);
      if(path.includes('/parts/'))return json(res,{received:true});
      if(req.method==='DELETE')return json(res,{id,state:'cancelled',expires:2000000000});
      if(hold)return json(res,{id,state:'queued',expires:2000000000});
      return json(res,ready(job));
    }
    const file=resolve(root,'.'+decodeURIComponent(path)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return res.writeHead(403).end();
    let content=await readFile(file);if(extname(file)==='.html')content=Buffer.from(content.toString().replace(/^---[\s\S]*?---\s*/,''));
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
try{
  const browser=await chromium.launch({headless:true,...(process.env.SPARKLE_BROWSER_EXECUTABLE?{executablePath:process.env.SPARKLE_BROWSER_EXECUTABLE}:{})});
  try{
    for(const [name,width,height] of [['desktop',1280,900],['iphone-portrait',390,844],['iphone-landscape',844,390]]){
      requests=[];hold=false;refuse=false;jobs=new Map();
      const context=await browser.newContext({viewport:{width,height},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
      await page.goto(origin+'/what-do-i-say/creator-preview/#video-caption');await page.locator('#video-caption').waitFor({state:'visible'});
      await page.locator('#caption-file').setInputFiles(fixture);await page.waitForFunction(()=>!document.querySelector('#caption-analyze').disabled);
      assert.equal(requests.length,0,'Choosing footage alone is not consent to upload it');
      await page.locator('#caption-analyze').click();await page.locator('#caption-conversation').waitFor({state:'visible'});
      const first={hook:await page.locator('#caption-hook').inputValue(),caption:await page.locator('#caption-text').inputValue()};
      assert.equal(requests[0].format,'hook-caption');assert(!requests[0].conversation);assert(requests[0].parts.some(p=>p.kind==='audio'));
      await page.locator('#caption-copy-hook').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),first.hook);
      await page.locator('#caption-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),first.caption);
      const waitDownload=page.waitForEvent('download');await page.locator('#caption-download').click();const downloaded=await waitDownload;
      assert.equal(await readFile(await downloaded.path(),'utf8'),'On screen:\n'+first.hook+'\n\nPost caption:\n'+first.caption);
      const send=async text=>{const before=requests.length;await page.locator('#caption-feedback').fill(text);await page.locator('#caption-reply-send').click();await page.waitForFunction(()=>document.querySelector('#caption-result').dataset.state==='ready'&&!document.querySelector('#caption-reply-send').disabled);assert.equal(requests.length,before+1);return requests.at(-1);};
      let spec=await send('No relationship drama. Make it catchier.');assert.equal(spec.conversation.action,'revise');assert.deepEqual(spec.conversation.reference,first);
      await page.locator('#caption-another').click();await page.waitForFunction(()=>!document.querySelector('#caption-reply-send').disabled);assert.equal(requests.at(-1).conversation.action,'another');assert(requests.at(-1).conversation.notes.includes('No relationship drama. Make it catchier.'));
      const previous=await page.locator('#caption-hook').inputValue();spec=await send('I liked the other caption, it just needed to flow better.');assert.equal(spec.conversation.action,'revise');assert.notEqual(spec.conversation.reference.hook,previous);
      await page.locator('#caption-reply-target').selectOption('caption');const keptHook=await page.locator('#caption-hook').inputValue();spec=await send('Shorter please');assert.equal(spec.conversation.target,'caption');assert.equal(await page.locator('#caption-hook').inputValue(),keptHook);
      await page.locator('#caption-hook').fill('My manually edited hook 😭');spec=await send('Keep that idea');assert.equal(spec.conversation.reference.hook,'My manually edited hook 😭');assert.equal(await page.locator('#caption-hook').inputValue(),'My manually edited hook 😭');
      const beforeFailure=await page.locator('#caption-text').inputValue();refuse=true;await page.locator('#caption-feedback').fill('Try a different post caption');await page.locator('#caption-reply-send').click();await page.waitForFunction(()=>document.querySelector('#caption-result').dataset.state==='error');
      assert.equal(await page.locator('#caption-text').inputValue(),beforeFailure);assert.equal(await page.locator('#caption-hook').inputValue(),'My manually edited hook 😭');assert.equal(await page.locator('#caption-feedback').inputValue(),'Try a different post caption');
      refuse=false;hold=true;await page.locator('#caption-reply-send').click();await page.waitForFunction(()=>document.querySelector('#caption-result').dataset.state==='working');
      await page.locator('#caption-text').fill('Keep these edits while the next reply arrives 😭');hold=false;
      await page.locator('#caption-use-suggestion').waitFor({state:'visible'});assert.equal(await page.locator('#caption-text').inputValue(),'Keep these edits while the next reply arrives 😭');
      await page.locator('#caption-use-suggestion').click();await page.waitForFunction(()=>!document.querySelector('#caption-reply-send').disabled);
      hold=true;await page.locator('#caption-another').click();await page.locator('#caption-cancel').click();await page.waitForFunction(()=>!document.querySelector('#caption-reply-send').disabled);assert.equal(await page.locator('#caption-hook').inputValue(),'My manually edited hook 😭');hold=false;
      await page.locator('#caption-history > summary').click();await page.locator('#caption-history-select').selectOption('0');await page.locator('#caption-restore').click();
      assert.equal(await page.locator('#caption-text').inputValue(),'Keep these edits while the next reply arrives 😭');
      await page.locator('#caption-feedback').fill('A reply I am still writing');await page.locator('#caption-refresh').click();await page.waitForFunction(()=>!document.querySelector('#caption-refresh').disabled);assert.equal(await page.locator('#caption-feedback').inputValue(),'A reply I am still writing');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
      for(const id of ['caption-copy-hook','caption-copy','caption-reply-send','caption-reply-target'])assert((await page.locator('#'+id).boundingBox()).height>=44,id+' has a phone sized touch target');
      let axeViolations=null;if(AxeBuilder){const a=await new AxeBuilder({page}).analyze();axeViolations=a.violations.filter(v=>['critical','serious'].includes(v.impact));assert.deepEqual(axeViolations,[]);}
      await page.screenshot({path:resolve(reports,name+'.png'),fullPage:true});
      const beforeNew=requests.length;await page.locator('#caption-file').setInputFiles({name:'different-video.mp4',mimeType:'video/mp4',buffer:await readFile(fixture)});
      assert.equal(requests.length,beforeNew);assert.equal(await page.locator('#caption-reply-send').isDisabled(),true,'A new upload cannot inherit the old conversation');
      assert.equal(await page.locator('#caption-text').inputValue(),'Keep these edits while the next reply arrives 😭','Choosing another clip preserves earlier editable output');
      assert.deepEqual(errors,[]);await writeFile(resolve(reports,name+'.json'),JSON.stringify({scope:'Synthetic API replies, real browser/media/UI; not physical iPhone or inference acceptance',passed:true,axeViolations,axeRun:Boolean(AxeBuilder)},null,2));
      console.log('PASS '+name+': paired output, exact separate copy/download, anchored feedback, same-clip binding, targeted changes, manual edits, failure/cancel/history and phone layout. Synthetic API replies only.');await context.close();
    }
  }finally{await browser.close();}
}finally{await new Promise(r=>server.close(r));}
