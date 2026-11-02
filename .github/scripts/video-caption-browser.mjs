// Synthetic API replies exercise the real upload preparation and Studio UI.
// This is not a claim of model grounding or operational moderation.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root=resolve('.'),reports=resolve('.github/reports/video-captions');await mkdir(reports,{recursive:true});
const fixture=resolve('.github/fixtures/caption-audio-test.mp4'),bytes=await readFile(fixture);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'2bc562f418ca4fafd5b6fc22e77060fac4253a3cb8fa769b3a33f1d5d500026a');
const job='d'.repeat(32),parts=new Map();let manifest,refuse=false,creates=0;
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/api/captions/capabilities')return json(res,{ready:true,kind:'social-caption',maxSeconds:120,maxFileBytes:64*1024*1024,framesAnalyzed:'sampled',audioAnalyzed:true});
    if(path.startsWith('/api/captions/')){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>98304)throw Error('Oversize test request');}
      if(path==='/api/captions/jobs'&&req.method==='POST'){
        creates++;if(refuse)return json(res,{error:'caption_unavailable'},503);
        manifest=JSON.parse(body);return json(res,{id:job,state:'uploading',expires:2000000000},202);
      }
      const part=/\/parts\/(frame|audio)\/(\d+)$/.exec(path);
      if(part){parts.set(part[1]+':'+part[2],Buffer.from(JSON.parse(body).data,'base64'));return json(res,{received:true});}
      if(path.endsWith('/commit'))return json(res,{id:job,state:'ready',expires:2000000000,caption:'Plum tones and clean white lines, arranged in a simple grid.',summary:'Visuals: A still plum grid with white lines.\nNo clear speech detected.'});
      if(req.method==='DELETE')return json(res,{id:job,state:'cancelled',expires:2000000000});
    }
    const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    let content=await readFile(file);
    if(extname(file)==='.html')content=Buffer.from(content.toString().replace(/^---[\s\S]*?---\s*/,''));
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
  const browser=await chromium.launch({headless:true});
  try{
    for(const [name,width] of [['desktop',1280],['phone',390]]){
      refuse=false;parts.clear();const before=creates,context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**',route=>route.abort());await page.route('https://fonts.gstatic.com/**',route=>route.abort());
      await page.goto(origin+'/what-do-i-say/creator-preview/');await page.locator('#start-video-caption').click();
      assert.equal(await page.locator('#video-caption').isVisible(),true);
      await page.locator('#caption-file').setInputFiles(fixture);
      await page.waitForFunction(()=>document.querySelector('#caption-preview').readyState>=1);
      assert.equal(creates,before,'Choosing a video alone must not upload media');
      await page.locator('#caption-analyze').click();await page.locator('#caption-result').waitFor({timeout:60000});
      assert.equal(manifest.audioMode,'included');assert.equal(manifest.videoSha256,createHash('sha256').update(bytes).digest('hex'));
      assert(manifest.parts.some(p=>p.kind==='audio'));assert(manifest.parts.filter(p=>p.kind==='frame').length>=3);
      for(const part of manifest.parts){const received=parts.get(part.kind+':'+part.index);assert(received);assert.equal(received.length,part.bytes);assert.equal(createHash('sha256').update(received).digest('hex'),part.sha256);}
      const audio=Buffer.concat(manifest.parts.filter(p=>p.kind==='audio').map(p=>parts.get('audio:'+p.index)));
      assert.equal(audio.subarray(0,4).toString(),'RIFF');assert.equal(audio.subarray(8,12).toString(),'WAVE');await writeFile(resolve(reports,name+'-extracted-audio.wav'),audio);
      assert.match(await page.locator('#caption-text').inputValue(),/Plum tones/);
      await page.locator('#caption-text').fill('My edited caption about the plum grid.');refuse=true;
      await page.locator('#caption-analyze').click();await page.getByText('Video captioning is unavailable right now. Your video and draft are preserved.',{exact:true}).waitFor();
      assert.equal(await page.locator('#caption-text').inputValue(),'My edited caption about the plum grid.');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const a11y=await new AxeBuilder({page}).analyze(),violations=a11y.violations.filter(v=>['critical','serious'].includes(v.impact));
      await writeFile(resolve(reports,name+'-accessibility.json'),JSON.stringify(violations,null,2));
      assert.deepEqual(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[]);
      await page.screenshot({path:resolve(reports,name+'-caption.png'),fullPage:true});assert.deepEqual(errors,[]);
      console.log('PASS '+name+': explicit upload consent, actual sampled frames and full PCM audio, content hashes, caption review, preserved failure and accessibility; synthetic API replies only.');
      await context.close();
    }
  }finally{await browser.close();}
}finally{await new Promise(r=>server.close(r));}
