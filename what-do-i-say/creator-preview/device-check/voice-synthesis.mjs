import {PocketTTS,chunksToWavBlob} from '../../voice-beta/pocket-tts/index.js?v=4';
import {prepareVoiceReference} from '../../voice-beta/reference-prep.mjs';
const $=id=>document.getElementById(id),preset={language:'english_2026-04',quantized:true,fullPrecisionAudio:true,voiceCloning:true};
const phrases=["I'm Sparkle, and your video deserves words that feel like you.",'Your next caption starts with the story in your video.'];
const SHA='b59e9c4d70864fcd0cb0b4e9c5f4a25b4854464e53104b7a6a5449d24a54ea20';
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
let tts=null,cancelled=false,epoch=0;const urls=[];
let report={declaredPhrases:phrases,preset,referenceSha256:SHA,runs:[],complete:false,physicalVoiceIdentityVerified:false,liveConversationVerified:false,launchReady:false};
const status=text=>{$('synth-status').textContent=text;};
function stop(){cancelled=true;epoch++;tts?.destroy();tts=null;$('synth-start').disabled=false;$('synth-cancel').disabled=true;status('Cancelled. Existing generated checks remain available.');}
$('synth-cancel').addEventListener('click',stop);window.addEventListener('pagehide',()=>{stop();urls.forEach(URL.revokeObjectURL);});
async function clone(file,engine,context){
  // Same mono/preparation/band-limited resampling as the approved voice beta.
  const decoded=await context.decodeAudioData(await file.arrayBuffer()),mono=new Float32Array(decoded.length);
  for(let ch=0;ch<decoded.numberOfChannels;ch++){const samples=decoded.getChannelData(ch);for(let i=0;i<samples.length;i++)mono[i]+=samples[i]/decoded.numberOfChannels;}
  let prepared=prepareVoiceReference(mono,decoded.sampleRate),rate=decoded.sampleRate;
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(rate!==engine.sampleRate&&Offline){
    const offline=new Offline(1,Math.ceil(prepared.length*engine.sampleRate/rate),engine.sampleRate);
    const buffer=offline.createBuffer(1,prepared.length,rate);buffer.copyToChannel(prepared,0);
    const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start(0);
    prepared=(await offline.startRendering()).getChannelData(0).slice();rate=engine.sampleRate;
  }
  return engine.cloneVoice(prepared,{inputSampleRate:rate,name:'sparkle-voice-local'});
}
$('synth-start').addEventListener('click',async()=>{
  if(tts)return;const turn=++epoch;cancelled=false;const started=performance.now();let context,timer,engine;
  $('synth-start').disabled=true;$('synth-cancel').disabled=false;report={...report,startedAt:new Date().toISOString(),runs:[],complete:false};
  try{
    context=new(window.AudioContext||window.webkitAudioContext)();await context.resume();
    const response=await fetch('../../voice-beta/Sparkle_reference.wav',{cache:'no-store'});if(!response.ok)throw Error('Approved reference unavailable');
    const blob=await response.blob();if(blob.size!==891016||await hash(await blob.arrayBuffer())!==SHA)throw Error('Approved reference changed');
    if(turn!==epoch)return;
    engine=new PocketTTS(preset);tts=engine;status('Loading the existing local voice model…');
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{engine.destroy();reject(Error('Voice test reached its ten-minute limit'));},600000);});
    const test=async()=>{
      await engine.load(info=>{if(turn===epoch&&info.type==='progress')status(`Loading ${info.label||'voice model'}${info.total?' · '+Math.round(info.loaded/info.total*100)+'%':''}`);});
      if(turn!==epoch)return;status('Preparing the approved voice on this device…');const voice=await clone(blob,engine,context);
      for(const [index,text] of phrases.entries()){
        if(cancelled||turn!==epoch)return;status(`Generating voice check ${index+1} of 2…`);
        const chunks=[],begin=performance.now();await engine.generate(text,{voice,onChunk:samples=>{if(!cancelled&&turn===epoch)chunks.push(samples.slice());}});
        if(cancelled||turn!==epoch)return;if(!chunks.length)throw Error('No generated speech');
        let samples=0,squares=0,peak=0,nonfinite=0,clipped=0;
        for(const chunk of chunks)for(const x of chunk){samples++;if(!Number.isFinite(x))nonfinite++;else{squares+=x*x;peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>1)clipped++;}}
        if(nonfinite||!samples)throw Error('Invalid generated audio');
        const wav=chunksToWavBlob(chunks,engine.sampleRate),bytes=await wav.arrayBuffer(),sha=await hash(bytes);
        if(sha===SHA)throw Error('Reference replay is not generated speech');
        const url=URL.createObjectURL(wav);urls.push(url);const row={text,sha256:sha,bytes:wav.size,sampleRate:engine.sampleRate,samples,seconds:samples/engine.sampleRate,rms:Math.sqrt(squares/samples),peak,clippedFraction:clipped/samples,synthesisSeconds:(performance.now()-begin)/1000,playbackEnded:false};report.runs.push(row);
        const box=document.createElement('div'),heading=document.createElement('h3'),p=document.createElement('p'),audio=document.createElement('audio'),link=document.createElement('a');
        heading.textContent=`Voice check ${index+1}`;p.textContent=text;audio.controls=true;audio.src=url;audio.setAttribute('aria-label',`Generated voice check ${index+1}`);audio.addEventListener('ended',()=>{row.playbackEnded=true;});
        link.href=url;link.download=`sparkle-generated-voice-check-${index+1}.wav`;link.textContent='Download generated speech';box.append(heading,p,audio,link);$('synth-results').append(box);
      }
      if(turn===epoch){report.complete=report.runs.length===2;report.totalSeconds=(performance.now()-started)/1000;status('Both checks generated. Press Play on each and listen. No physical or conversation pass is inferred.');}
    };
    await Promise.race([test(),deadline]);
  }catch(error){if(turn===epoch){report.error=error.message;status('Voice synthesis did not complete: '+error.message+'. Existing checks remain available.');}}
  finally{clearTimeout(timer);engine?.destroy();if(turn===epoch){tts=null;$('synth-start').disabled=false;$('synth-cancel').disabled=true;}if(context)await context.close();}
});
$('synth-report').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sparkle-local-voice-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('synth-report-status').textContent='Technical results downloaded locally.';
});
