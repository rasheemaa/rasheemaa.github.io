import {VideoClient,VideoFailure} from './video-client.mjs?v=1';
const client=new VideoClient(), $=id=>document.getElementById(id);
const labels={queued:'Your video is waiting to render.',screening:'Checking your prompt.',generating:'Creating your video. This can take a few minutes.',reviewing:'Checking the finished video before showing it.'};
let active=null, stopped=false, controller=null, mediaURL=null, wake=null, cancellation=null;
function status(message){$('video-progress').textContent=message;}
function pause(){return new Promise(resolve=>{const timer=setTimeout(()=>{wake=null;resolve();},4000);wake=()=>{clearTimeout(timer);wake=null;resolve();};});}
function busy(value){$('generate-video').disabled=value;$('cancel-video').hidden=!value;$('cancel-video').disabled=!active;}

const capabilities=await client.capabilities();
if(capabilities){
  $('generate-video').hidden=false;$('generate-video').disabled=false;
  $('local-note').textContent='Saved scene plans stay in this browser.';
  $('generation-details').hidden=false;
  $('generation-details').textContent='Generate a 5-second silent video in portrait or landscape. Your prompt is sent to Sparkle when you choose Generate video.';
  $('generation-availability').textContent='Prompt-to-video is available for short silent clips. Editing your own footage is not available yet. Scene planning stays on this device.';
}

$('generate-video').addEventListener('click',async()=>{
  const prompt=$('concept').value.trim(),format=$('format').value;
  if(!prompt){status('Describe the video you want to create.');$('concept').focus();return;}
  if(format==='1:1'){status('Choose portrait or landscape to generate a video. Square is available for scene plans.');$('creative-settings').open=true;$('format').focus();return;}
  // A multiline plan is not silently altered into a different generation prompt.
  if(/[\u0000-\u001f\u007f]/.test(prompt)){status('Use one paragraph for your video prompt. Your written plan can keep multiple lines.');$('concept').focus();return;}
  active=null;stopped=false;cancellation=null;controller=new AbortController();busy(true);status('Starting your video.');
  try{
    let job=await client.create(prompt,format);active=job.id;$('cancel-video').disabled=false;
    for(;;){
      if(stopped)return;
      if(job.state==='ready')break;
      if(['blocked','failed','cancelled','expired'].includes(job.state)){
        client.forget();throw new VideoFailure(job.error||'video_failed');
      }
      status(labels[job.state]||'Creating your video.');
      await pause();if(stopped)return;job=await client.status(active,controller.signal);
    }
    status('Preparing your video for playback.');
    const blob=await client.file(active,controller.signal);if(stopped)return;
    const next=URL.createObjectURL(blob),previous=mediaURL;mediaURL=next;
    $('generated-video').src=next;$('download-video').href=next;
    $('video-result').hidden=false;$('video-result-title').focus();
    if(previous)URL.revokeObjectURL(previous);
    client.forget();status('Your video is ready. Play it or download the MP4.');
  }catch(error){if(!stopped)status(error instanceof VideoFailure?error.message:'The video could not be finished. Your idea is still here.');}
  finally{if(cancellation)await cancellation;busy(false);active=null;controller=null;wake?.();}
});
$('cancel-video').addEventListener('click',async()=>{
  if(!active||stopped)return;
  const id=active;stopped=true;controller?.abort();wake?.();$('cancel-video').disabled=true;status('Cancelling your video.');
  cancellation=client.cancel(id).then(()=>{client.forget();status('Video cancelled. Your idea is still here.');})
    .catch(()=>status('Cancellation could not be confirmed. Your idea is still here. Retry the same idea to check its existing request.'));
  await cancellation;
});
window.addEventListener('pagehide',()=>{controller?.abort();wake?.();if(mediaURL)URL.revokeObjectURL(mediaURL);});
