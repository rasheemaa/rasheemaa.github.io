import {CaptionClient,CaptionFailure} from './caption-client.mjs?v=5';
import {prepareCaptionMedia} from './caption-media.mjs';
import {CaptionThread} from './caption-thread.mjs?v=1';
const $=id=>document.getElementById(id),client=new CaptionClient();
const thread=new CaptionThread();let capabilities=null,currentResult=null,sourceFile=null,conversationExpired=false;
let available=false,file=null,previewURL=null,prepared=null,active=null,pendingId=null,wake=null,suggestion=null,sourceName='',history=[];
let elapsedTimer=null,startedAt=0,availabilityChecking=false;
const stages={uploading:'Preparing your video for analysis.',queued:'Your video is waiting for analysis.',analyzing:'Sparkle is analyzing the visuals and speech. This may take a few minutes.',drafting:'Writing fresh captions based on your video.',verifying:'Checking that the caption matches your clip and is different from earlier suggestions.'};
function status(text){$('caption-status').textContent=text;}
function canReply(){return capabilities?.conversationVersion===1&&currentResult?.hook&&file===sourceFile&&thread.versions[thread.selected]?.id===currentResult.id&&!conversationExpired;}
function conversationControls(working=false){
  for(const id of ['caption-another','caption-catchier','caption-flow','caption-reply-send','caption-reply-target'])$(id).disabled=working||!available||!canReply();
}
function logReply(role,text){
  const log=$('caption-thread-log');
  const followLatest=role==='user'||log.scrollHeight-log.scrollTop-log.clientHeight<48;
  const item=document.createElement('p');item.className='caption-thread-message';item.dataset.role=role;item.textContent=(role==='user'?'You: ':'Sparkle: ')+text;
  log.append(item);while(log.children.length>16)log.firstChild.remove();
  if(followLatest)log.scrollTop=log.scrollHeight;
}
function busy(value){
  $('caption-analyze').disabled=value||availabilityChecking||!available||!file;$('caption-cancel').hidden=!value;
  $('caption-refresh').disabled=value||availabilityChecking;
  conversationControls(value||availabilityChecking);
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
  const current=thread.versions.find(v=>v.id===currentResult?.id);if(current){current.hook=$('caption-hook').value;current.caption=text;}
  history.unshift({text,hook:$('caption-hook').value,name:sourceName,summary:$('caption-evidence').textContent,result:currentResult,file:sourceFile});history=history.slice(0,8);
  $('caption-history-select').replaceChildren(...history.map((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=item.name+' · '+item.text.slice(0,60);return option;}));
  $('caption-history').hidden=false;
}
function show(result,name,{focus=true,task=null,restoring=false,restoredFile=null}={}){
  remember();$('caption-text').value=result.caption;$('caption-hook').value=result.hook||'';$('caption-evidence').textContent=result.summary;sourceName=name;
  currentResult={...result};if(task)sourceFile=task.file;else if(restoring)sourceFile=restoredFile;
  if(result.hook&&!restoring){
    conversationExpired=false;thread.accept(result,task?.videoSha,task?.feedback||'');
    if(task?.feedback)logReply('sparkle','On screen: '+result.hook+'\nPost caption: '+result.caption);
  }
  $('caption-hook-section').hidden=!result.hook;$('caption-conversation').hidden=!result.hook;
  $('caption-copy').textContent=result.hook?'Copy post caption':'Copy caption';
  $('caption-for').textContent=result.hook?'Post caption':'Caption for '+name+' · review and edit';
  $('caption-editor').hidden=false;$('caption-empty').hidden=true;$('caption-result').dataset.state='ready';
  $('caption-analyze').textContent='Create another caption';$('caption-use-suggestion').hidden=true;suggestion=null;
  if(focus)(result.hook?$('caption-hook'):$('caption-text')).focus();
  status(result.hook?'Your caption pair is ready. Review it, copy either part, or reply to refine the same clip.':'Your caption is ready. It was checked against your clip. Review it before posting.');
  conversationControls(Boolean(active));
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
  thread.reset();$('caption-thread-log').replaceChildren();conversationExpired=false;
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;
  file=$('caption-file').files?.[0]||null;
  if(file&&(!file.size||file.size>64*1024*1024)){status('Choose a video up to 64 MB and 2 minutes long.');file=null;}
  if(file){previewURL=URL.createObjectURL(file);$('caption-preview').src=previewURL;$('caption-preview').hidden=false;status('Video selected. Your existing caption is preserved until the new analysis is ready.');}
  else{$('caption-preview').removeAttribute('src');$('caption-preview').hidden=true;}
  busy(false);
});
for(const id of ['caption-context','caption-tone','caption-visual-only'])for(const event of ['input','change'])$(id).addEventListener(event,()=>{
  stop('Your options changed. Your caption is preserved.');
  if(id==='caption-visual-only'){prepared=null;thread.reset();$('caption-thread-log').replaceChildren();status('Speech analysis changed. Analyze this video again before replying. Your captions are preserved.');}
  conversationControls(Boolean(active));
});
$('caption-cancel').addEventListener('click',()=>stop('Analysis cancelled. Your video and caption are preserved.'));
$('caption-analyze').addEventListener('click',()=>void analyze());
async function analyze(conversation=null,feedback=''){
  if(active||!available||!file)return;
  const task={controller:new AbortController(),id:null,file,snapshot:$('caption-text').value,hookSnapshot:$('caption-hook').value,feedback};active=task;busy(true);suggestion=null;$('caption-use-suggestion').hidden=true;if(!feedback)viewOutput();
  if(feedback)logReply('user',feedback);
  const signal=task.controller.signal,timer=setTimeout(()=>{if(active===task)stop('Analysis timed out. Your video and caption are preserved.');},12*60*1000);
  try{
    if(!prepared)prepared=await prepareCaptionMedia(task.file,{signal,visualOnly:$('caption-visual-only').checked,onProgress:message=>{if(active===task)status(message);}});
    signal.throwIfAborted();
    const data={...prepared.manifest,context:$('caption-context').value.trim(),tone:$('caption-tone').value};
    task.videoSha=data.videoSha256;
    if(capabilities?.conversationVersion===1)data.format='hook-caption';
    if(conversation)data.conversation=conversation;
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
    if(data.format==='hook-caption'&&!job.hook)throw new CaptionFailure('caption_unverified');
    if($('caption-text').value!==task.snapshot||$('caption-hook').value!==task.hookSnapshot){suggestion={result:job,name:task.file.name,task};$('caption-result').dataset.state='ready';$('caption-use-suggestion').hidden=false;status('A new caption is ready. Your current edits were kept. Choose Use new suggestion when you are ready.');}
    // A background result must never move keyboard focus, including when
    // another Studio tool or Safari's keyboard is already in use. Explicit
    // restore/use-suggestion actions may focus their selected result instead.
    else show(job,task.file.name,{task,focus:false});
    if(feedback&&$('caption-feedback').value.trim()===feedback)$('caption-feedback').value='';
  }catch(error){if(active===task&&!signal.aborted){
    if(error?.code==='caption_conversation_expired')conversationExpired=true;
    $('caption-result').dataset.state='error';status(error instanceof CaptionFailure?error.message:error.message||'This video could not be analyzed. Your caption is preserved.');
  }}
  finally{clearTimeout(timer);if(active===task){active=null;busy(false);}}
}
function reply(feedback){
  if(active||!available||!canReply())return;
  try{const conversation=thread.request(feedback,$('caption-reply-target').value,{hook:$('caption-hook').value,caption:$('caption-text').value});void analyze(conversation,feedback.trim());}
  catch(error){status(error.message);}
}
$('caption-reply-form').addEventListener('submit',event=>{event.preventDefault();reply($('caption-feedback').value);});
$('caption-another').addEventListener('click',()=>reply('Another one'));
$('caption-catchier').addEventListener('click',()=>reply('Keep the same idea. Make it catchier.'));
$('caption-flow').addEventListener('click',()=>reply('Keep the same idea. Make it flow better.'));
$('caption-use-suggestion').addEventListener('click',()=>{if(suggestion){const value=suggestion;show(value.result,value.name,{task:value.task});}});
$('caption-restore').addEventListener('click',()=>{const value=history[Number($('caption-history-select').value)];if(value){
  const copy={...value},index=thread.versions.findIndex(v=>v.id===copy.result?.id);
  if(index>=0)thread.select(index);
  show({...copy.result,caption:copy.text,hook:copy.hook,summary:copy.summary},copy.name,{restoring:true,restoredFile:copy.file});
}});
$('caption-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('caption-text').value);status('Caption copied. Nothing was posted.');}catch{$('caption-text').focus();$('caption-text').select();status('Select and copy your caption from the text box.');}});
$('caption-copy-hook').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('caption-hook').value);status('On screen caption copied. Nothing was posted.');}catch{$('caption-hook').focus();$('caption-hook').select();status('Select and copy your on screen caption from the text box.');}});
$('caption-download').addEventListener('click',()=>{const text=currentResult?.hook?'On screen:\n'+$('caption-hook').value+'\n\nPost caption:\n'+$('caption-text').value:$('caption-text').value;const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sparkle-caption.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
async function refreshAvailability(){
  if(active||availabilityChecking)return;
  availabilityChecking=true;$('caption-refresh').textContent='Checking…';busy(false);
  try{
    const value=await client.capabilities();capabilities=value;available=Boolean(value);
    $('caption-availability').textContent=available?'Video analysis is available. Sparkle checks the clip before writing; each new suggestion is checked for duplicates.':'Video captioning is temporarily unavailable. Your selected video and caption stay here. Check again to reconnect; nothing will be sent.';
  }finally{availabilityChecking=false;$('caption-refresh').textContent='Check again';busy(Boolean(active));}
}
$('caption-refresh').addEventListener('click',()=>{void refreshAvailability();});
window.addEventListener('online',()=>{void refreshAvailability();});
window.addEventListener('pageshow',()=>{void refreshAvailability();});
void refreshAvailability();
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{void refreshAvailability();});
  // Update the existing offline shell on direct Studio visits too. New workers
  // purge the previous release cache and never cache authenticated/API results.
  void navigator.serviceWorker.register('../service-worker.js',{updateViaCache:'none'}).catch(()=>{});
}
window.addEventListener('pagehide',event=>{stop();if(!event.persisted&&previewURL)URL.revokeObjectURL(previewURL);});
