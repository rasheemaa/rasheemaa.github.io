import {CaptionClient,CaptionFailure} from './caption-client.mjs';
import {prepareCaptionMedia} from './caption-media.mjs';
const $=id=>document.getElementById(id),client=new CaptionClient();
let available=false,file=null,previewURL=null,prepared=null,active=null,pendingId=null,wake=null,suggestion=null,sourceName='',history=[];
let elapsedTimer=null,startedAt=0,availabilityChecking=false;
const stages={uploading:'Preparing your video for analysis.',queued:'Your video is waiting for analysis.',analyzing:'Sparkle is analyzing the visuals and speech. This may take a few minutes.',drafting:'Writing fresh captions based on your video.',verifying:'Checking that the caption matches your clip and is different from earlier suggestions.'};
function status(text){$('caption-status').textContent=text;}
function busy(value){
  $('caption-analyze').disabled=value||availabilityChecking||!available||!file;$('caption-cancel').hidden=!value;
  $('caption-refresh').disabled=value||availabilityChecking;
  $('caption-editor').setAttribute('aria-busy',String(value));
  if(value){
    $('caption-result').dataset.state='working';$('caption-empty').hidden=true;
    if(!elapsedTimer){startedAt=performance.now();const tick=()=>{const seconds=Math.floor((performance.now()-startedAt)/1000);$('caption-elapsed').textContent=seconds+'s elapsed'+(seconds>=30?' · Still analyzing. Longer clips can take more time.':' · Your caption will appear here.');};tick();elapsedTimer=setInterval(tick,1000);}
    $('caption-elapsed').hidden=false;
  }else{
    const wasRunning=Boolean(elapsedTimer),completed=$('caption-result').dataset.state==='ready';
    clearInterval(elapsedTimer);elapsedTimer=null;
    if(wasRunning)$('caption-elapsed').textContent=(completed?'Ready in ':'Analysis stopped after ')+Math.ceil((performance.now()-startedAt)/1000)+'s.';
    if($('caption-result').dataset.state==='working')$('caption-result').dataset.state=$('caption-text').value?'ready':'empty';
    $('caption-empty').hidden=Boolean($('caption-text').value);
  }
}
function viewOutput(){$('caption-result-title').focus();$('caption-result').scrollIntoView({block:'start',behavior:'instant'});}
function stop(message){
  const task=active;active=null;task?.controller.abort();wake?.();
  const id=task?.id||pendingId;pendingId=null;if(id)void client.cancel(id).catch(()=>{});
  client.forget();busy(false);if(message&&(task||id))status(message);
}
function pause(signal){return new Promise(resolve=>{const timer=setTimeout(done,2000);function done(){clearTimeout(timer);signal.removeEventListener('abort',done);wake=null;resolve();}wake=done;signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});}
function remember(){
  const text=$('caption-text').value;if(!text.trim())return;
  history.unshift({text,name:sourceName,summary:$('caption-evidence').textContent});history=history.slice(0,8);
  $('caption-history-select').replaceChildren(...history.map((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=item.name+' · '+item.text.slice(0,60);return option;}));
  $('caption-history').hidden=false;
}
function show(result,name,{focus=true}={}){
  remember();$('caption-text').value=result.caption;$('caption-evidence').textContent=result.summary;sourceName=name;
  $('caption-for').textContent='Caption for '+name+' · review and edit';$('caption-editor').hidden=false;$('caption-empty').hidden=true;$('caption-result').dataset.state='ready';
  $('caption-analyze').textContent='Create another caption';$('caption-use-suggestion').hidden=true;suggestion=null;
  if(focus)$('caption-text').focus();status('Your caption is ready. It was checked against your clip. Review it before posting.');
}
function openCaptionWorkspace(){
  $('video-caption').hidden=false;$('video-caption-title').focus();$('video-caption').scrollIntoView({block:'start',behavior:'instant'});
}
$('start-video-caption').addEventListener('click',openCaptionWorkspace);
if(window.location.hash==='#video-caption'){
  openCaptionWorkspace();
  // Native fragment navigation can reset focus after module initialization.
  // Restore it after load only if the visitor has not started using a control.
  const focusEntry=()=>requestAnimationFrame(()=>{
    if(document.activeElement===document.body||document.activeElement===$('video-caption'))$('video-caption-title').focus({preventScroll:true});
  });
  if(document.readyState==='complete')focusEntry();else window.addEventListener('load',focusEntry,{once:true});
}
$('caption-view-output').addEventListener('click',viewOutput);
$('caption-file').addEventListener('change',()=>{
  stop();prepared=null;suggestion=null;$('caption-use-suggestion').hidden=true;
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;
  file=$('caption-file').files?.[0]||null;
  if(file&&(!file.size||file.size>64*1024*1024)){status('Choose a video up to 64 MB and 2 minutes long.');file=null;}
  if(file){previewURL=URL.createObjectURL(file);$('caption-preview').src=previewURL;$('caption-preview').hidden=false;status('Video selected. Your existing caption is preserved until the new analysis is ready.');}
  else{$('caption-preview').removeAttribute('src');$('caption-preview').hidden=true;}
  busy(false);
});
for(const id of ['caption-context','caption-tone','caption-visual-only'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{stop('Your options changed. Your caption is preserved.');if(id==='caption-visual-only')prepared=null;});
$('caption-cancel').addEventListener('click',()=>stop('Analysis cancelled. Your video and caption are preserved.'));
$('caption-analyze').addEventListener('click',async()=>{
  if(active||!available||!file)return;
  const task={controller:new AbortController(),id:null,file,snapshot:$('caption-text').value};active=task;busy(true);suggestion=null;$('caption-use-suggestion').hidden=true;viewOutput();
  const signal=task.controller.signal,timer=setTimeout(()=>{if(active===task)stop('Analysis timed out. Your video and caption are preserved.');},12*60*1000);
  try{
    if(!prepared)prepared=await prepareCaptionMedia(task.file,{signal,visualOnly:$('caption-visual-only').checked,onProgress:message=>{if(active===task)status(message);}});
    signal.throwIfAborted();
    const data={...prepared.manifest,context:$('caption-context').value.trim(),tone:$('caption-tone').value};
    let job=await client.create(data,signal);task.id=job.id;pendingId=job.id;
    if(job.state==='uploading'){
      for(let offset=0;offset<data.parts.length;offset+=3){
        signal.throwIfAborted();status(`Sending analysis samples ${Math.min(offset+3,data.parts.length)} of ${data.parts.length}.`);
        await Promise.all(data.parts.slice(offset,offset+3).map((part,index)=>client.part(job.id,part,prepared.chunks[offset+index],signal)));
      }
      job=await client.commit(job.id,signal);
    }
    while(job.state!=='ready'){
      signal.throwIfAborted();if(['failed','cancelled','expired'].includes(job.state)){pendingId=null;client.forget();throw new CaptionFailure(job.error||'caption_unverified');}
      status(stages[job.state]||'Analyzing your video.');await pause(signal);signal.throwIfAborted();job=await client.status(job.id,signal);
    }
    if(active!==task||signal.aborted)return;pendingId=null;client.forget();
    if($('caption-text').value!==task.snapshot){suggestion={result:job,name:task.file.name};$('caption-result').dataset.state='ready';$('caption-use-suggestion').hidden=false;status('A new caption is ready. Your current edits were kept. Choose Use new suggestion when you are ready.');}
    else show(job,task.file.name,{focus:$('video-caption').contains(document.activeElement)});
  }catch(error){if(active===task&&!signal.aborted){$('caption-result').dataset.state='error';status(error instanceof CaptionFailure?error.message:error.message||'This video could not be analyzed. Your caption is preserved.');}}
  finally{clearTimeout(timer);if(active===task){active=null;busy(false);}}
});
$('caption-use-suggestion').addEventListener('click',()=>{if(suggestion)show(suggestion.result,suggestion.name);});
$('caption-restore').addEventListener('click',()=>{const value=history[Number($('caption-history-select').value)];if(value){const copy={...value};show({caption:copy.text,summary:copy.summary},copy.name);}});
$('caption-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('caption-text').value);status('Caption copied. Nothing was posted.');}catch{$('caption-text').focus();$('caption-text').select();status('Select and copy your caption from the text box.');}});
$('caption-download').addEventListener('click',()=>{const blob=new Blob([$('caption-text').value],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sparkle-caption.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
async function refreshAvailability(){
  if(active||availabilityChecking)return;
  availabilityChecking=true;$('caption-refresh').textContent='Checking…';busy(false);
  try{
    const value=await client.capabilities();available=Boolean(value);
    $('caption-availability').textContent=available?'Video analysis is available. Sparkle checks the clip before writing; each new suggestion is checked for duplicates.':'Video captioning is temporarily unavailable. Your selected video and caption stay here. Check again to reconnect; nothing will be sent.';
  }finally{availabilityChecking=false;$('caption-refresh').textContent='Check again';busy(Boolean(active));}
}
$('caption-refresh').addEventListener('click',()=>{void refreshAvailability();});
window.addEventListener('online',()=>{void refreshAvailability();});
void refreshAvailability();
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{void refreshAvailability();});
  // Update the existing offline shell on direct Studio visits too. New workers
  // purge the previous release cache and never cache authenticated/API results.
  void navigator.serviceWorker.register('../service-worker.js',{updateViaCache:'none'}).catch(()=>{});
}
window.addEventListener('pagehide',event=>{stop();if(!event.persisted&&previewURL)URL.revokeObjectURL(previewURL);});
