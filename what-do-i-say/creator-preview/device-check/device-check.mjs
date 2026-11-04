// Owner diagnostics: no upload, speech-recognition service, generation or storage.
const $=id=>document.getElementById(id);
const VOICE_SHA='b59e9c4d70864fcd0cb0b4e9c5f4a25b4854464e53104b7a6a5449d24a54ea20';
const evidence={startedAt:new Date().toISOString(),origin:location.origin,build:null,microphone:[],
  voice:{expectedSha256:VOICE_SHA,verified:false,playbackEnded:false},physicalSafariVerified:false,
  liveVoiceConversationVerified:false,originalGenerationVerified:false,launchReady:false};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
let capture=null,playURL=null,voiceURL=null,starting=false;
function closeCapture(reason){
  const c=capture;if(!c)return;capture=null;
  clearTimeout(c.timer);cancelAnimationFrame(c.raf);c.reason=reason;
  if(c.recorder?.state==='recording')c.recorder.stop();
  c.stream.getTracks().forEach(t=>t.stop());void c.context.close();
  $('mic-start').disabled=false;$('mic-stop').disabled=true;$('mic-level').value=0;
}
function finishAttempt(c){
  const row={at:c.at,seconds:Math.round((performance.now()-c.started)/100)/10,
    peakRms:Number(c.peak.toFixed(6)),stopped:c.reason,signalDetected:c.peak>.01,
    recordingAvailable:c.chunks.length>0,playbackEnded:false};
  evidence.microphone.push(row);
  const item=document.createElement('li');item.textContent=`Attempt ${evidence.microphone.length}: ${row.signalDetected?'input signal detected':'no clear input signal'}; microphone stopped (${c.reason}).`;
  $('mic-attempts').append(item);
  if(playURL)URL.revokeObjectURL(playURL);
  const blob=new Blob(c.chunks,{type:c.recorder.mimeType});playURL=URL.createObjectURL(blob);
  $('mic-playback').src=playURL;$('mic-playback').hidden=false;
  $('mic-playback').onended=()=>{row.playbackEnded=true;const complete=evidence.microphone.filter(r=>r.signalDetected&&r.playbackEnded&&r.seconds>=2&&['complete','manual'].includes(r.stopped));$('mic-heard').disabled=complete.length<2;};
  $('mic-status').textContent='Microphone is off. Play your recording, then repeat the check.';
}
$('mic-start').addEventListener('click',async()=>{
  if(capture||starting)return;starting=true;$('mic-start').disabled=true;$('mic-heard').checked=false;$('mic-heard').disabled=true;
  let stream,context;
  try{
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('unsupported');
    stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    if(document.hidden){stream.getTracks().forEach(t=>t.stop());throw new Error('interrupted');}
    context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
    const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);
    const recorder=new MediaRecorder(stream),c={stream,context,recorder,chunks:[],peak:0,started:performance.now(),at:new Date().toISOString()};capture=c;
    recorder.ondataavailable=e=>{if(e.data.size)c.chunks.push(e.data);};recorder.onstop=()=>finishAttempt(c);
    recorder.onerror=()=>closeCapture('recorder_error');
    stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{if(capture===c)closeCapture('device_ended');}));
    const values=new Float32Array(analyser.fftSize);
    function measure(){if(capture!==c)return;analyser.getFloatTimeDomainData(values);const rms=Math.sqrt(values.reduce((s,x)=>s+x*x,0)/values.length);c.peak=Math.max(c.peak,rms);$('mic-level').value=Math.min(1,rms*5);c.raf=requestAnimationFrame(measure);}
    recorder.start();measure();c.timer=setTimeout(()=>closeCapture('complete'),5000);
    $('mic-stop').disabled=false;$('mic-status').textContent='Speak now. Recording stops in five seconds.';
  }catch(error){
    if(capture)closeCapture('start_failed');
    stream?.getTracks().forEach(t=>t.stop());if(context)void context.close();
    evidence.microphone.push({at:new Date().toISOString(),error:error.name==='NotAllowedError'?'permission_denied':error.message==='unsupported'?'unsupported':'start_failed'});
    $('mic-status').textContent=error.name==='NotAllowedError'?'Microphone permission was denied. Allow this site in browser settings, then retry.':'Microphone did not start. Check your device or browser, then retry.';
    $('mic-start').disabled=false;
  }finally{starting=false;}
});
$('mic-stop').addEventListener('click',()=>closeCapture('manual'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeCapture('page_hidden');});
window.addEventListener('pagehide',()=>{closeCapture('page_exit');if(playURL)URL.revokeObjectURL(playURL);if(voiceURL)URL.revokeObjectURL(voiceURL);});
$('voice-load').addEventListener('click',async()=>{
  $('voice-load').disabled=true;$('voice-heard').disabled=true;$('voice-heard').checked=false;
  try{
    const response=await fetch('../../voice-beta/Sparkle_reference.wav',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('unavailable');const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==891016||await digest(bytes)!==VOICE_SHA)throw new Error('changed');
    if(voiceURL)URL.revokeObjectURL(voiceURL);voiceURL=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
    evidence.voice.verified=true;evidence.voice.playbackEnded=false;
    $('voice-playback').src=voiceURL;$('voice-playback').hidden=false;
    $('voice-status').textContent='Approved recording verified. Press Play and listen through to the end.';
  }catch{evidence.voice.verified=false;$('voice-status').textContent='The approved recording could not be verified. Retry after checking the connection.';}
  finally{$('voice-load').disabled=false;}
});
$('voice-playback').addEventListener('ended',()=>{evidence.voice.playbackEnded=true;$('voice-heard').disabled=!evidence.voice.verified;});
$('download').addEventListener('click',()=>{
  const result={...evidence,finishedAt:new Date().toISOString(),deviceDescription:$('device').value.trim(),
    ownerAttestedPhysicalDevice:$('physical').checked,ownerHeardBothMicrophoneRecordings:$('mic-heard').checked&&!$('mic-heard').disabled,
    ownerHeardApprovedVoice:$('voice-heard').checked&&!$('voice-heard').disabled,
    ownerReported:{layout:$('layout').checked,projects:$('projects').checked,captions:$('captions').checked,notes:$('notes').value},
    limitations:['Owner attestations are separate from measured events.','No physical Safari, live voice conversation, reboot, quality or generation pass is inferred.']};
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='sparkle-device-check.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  $('report-status').textContent='Device check downloaded. Results have not been sent anywhere.';
});
try{
  const response=await fetch('/api/health',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');
  const health=await response.json();evidence.build={siteCommit:health.siteCommit||null,apiRevision:health.apiRevision||null};
  $('build').textContent=`Frontend ${health.siteCommit||'unavailable'} · API ${health.apiRevision||'unavailable'}`;
}catch{$('build').textContent='Staging build metadata could not be read. The device check is still available.';}
