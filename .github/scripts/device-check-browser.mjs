// Isolated simulated-device tests; fake microphone input is NOT physical proof.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root=resolve('.');let wrongVoice=false;const requests=[];
const server=http.createServer(async(req,res)=>{
  requests.push({method:req.method,url:req.url});
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({siteCommit:'1'.repeat(40),apiRevision:'2'.repeat(40)}));return;}
    const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('scope');
    let data=await readFile(file);
    if(file.endsWith('.html'))data=Buffer.from(data.toString().replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''));
    if(wrongVoice&&file.endsWith('Sparkle_reference.wav')){data=Buffer.from(data);data[100]^=1;}
    res.setHeader('Content-Type',({'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.wav':'audio/wav'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const results=[];
try{
  for(const [name,engine,width] of [['pc-synthetic-microphone',chromium,1280],['phone-layout-simulation',chromium,390],['linux-webkit-layout',webkit,390]]){
    const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}: {})});
    try{
      const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/what-do-i-say/creator-preview/device-check/');
      await page.getByText('Frontend '+'1'.repeat(40),{exact:false}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#voice-load').click();await page.getByText('Approved recording verified.',{exact:false}).waitFor();
      assert.equal(await page.locator('#voice-heard').isDisabled(),true);
      wrongVoice=true;await page.locator('#voice-load').click();await page.getByText('The approved recording could not be verified.',{exact:false}).waitFor();wrongVoice=false;
      assert.equal(await page.locator('#voice-heard').isDisabled(),true);
      if(name==='pc-synthetic-microphone'){
        for(let n=1;n<=2;n++){
          await page.locator('#mic-start').click();await page.getByText('Speak now.',{exact:false}).waitFor();
          await page.waitForFunction(n=>document.querySelectorAll('#mic-attempts li').length===n,n,{timeout:12000});
          await page.locator('#mic-playback').evaluate(v=>v.play());
          await page.waitForFunction(()=>document.querySelector('#mic-playback').ended,{}, {timeout:12000});
        }
        assert.equal(await page.locator('#mic-heard').isEnabled(),true);
        await page.locator('#mic-heard').check();
      }
      const scan=await new AxeBuilder({page}).analyze();assert.deepEqual(scan.violations,[]);
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
      const report=JSON.parse(await readFile(await download.path(),'utf8'));
      assert.equal(report.launchReady,false);assert.equal(report.physicalSafariVerified,false);
      assert.equal(report.ownerAttestedPhysicalDevice,false);assert.equal(report.liveVoiceConversationVerified,false);
      assert.equal(report.voice.verified,false);assert.equal(report.ownerHeardApprovedVoice,false);
      assert.equal(report.microphone.length,name==='pc-synthetic-microphone'?2:0);
      assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(errors,[]);
      results.push({name,passed:true,accessibilityViolations:scan.violations.length,physicalDevice:false,report});
      await page.goto(origin+'/what-do-i-say/creator-preview/device-check/voice-synthesis.html');
      await page.locator('#synth-report').waitFor();
      const voiceScan=await new AxeBuilder({page}).analyze();assert.deepEqual(voiceScan.violations,[]);
      const [voiceDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#synth-report').click()]);
      const voiceReport=JSON.parse(await readFile(await voiceDownload.path(),'utf8'));
      assert.equal(voiceReport.complete,false);assert.equal(voiceReport.launchReady,false);
      assert.equal(voiceReport.liveConversationVerified,false);assert.equal(voiceReport.physicalVoiceIdentityVerified,false);
      assert.equal(voiceReport.runs.length,0);assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  }
  assert(requests.every(r=>r.method==='GET'));
  await mkdir('.github/reports/device-check',{recursive:true});
  await (await import('node:fs/promises')).writeFile('.github/reports/device-check/results.json',JSON.stringify({results,noAudioUploads:true,physicalAcceptance:false},null,2)+'\n');
  console.log(JSON.stringify({passed:results.length,accessibilityViolations:0,physicalAcceptance:false,noAudioUploads:true}));
}finally{await new Promise(r=>server.close(r));}
